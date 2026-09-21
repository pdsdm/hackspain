import { createHmac, randomBytes, randomInt, timingSafeEqual } from "node:crypto";

import { ContractError } from "../contracts/api.js";
import type { AuthPurpose, SendAuthEmail } from "./mailer.js";
import { AuthRepository, type AuthUser } from "./repository.js";

const CODE_TTL_MS = 10 * 60 * 1000;
const RESEND_COOLDOWN_MS = 60 * 1000;
const MAX_ATTEMPTS = 5;
const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000;

export interface AuthServiceOptions {
  secret: string;
  sendEmail: SendAuthEmail;
  echoCode?: boolean;
  now?: () => number;
}

function normalizeEmail(raw: unknown): string {
  if (typeof raw !== "string") throw new ContractError("email must be a string", 400);
  const email = raw.trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254) {
    throw new ContractError("email no es válido", 400);
  }
  return email;
}

function normalizePurpose(raw: unknown): AuthPurpose {
  if (raw === "register" || raw === "login") return raw;
  throw new ContractError("purpose debe ser register o login", 400);
}

function normalizeCode(raw: unknown): string {
  if (typeof raw !== "string") throw new ContractError("code must be a string", 400);
  const code = raw.trim();
  if (!/^\d{6}$/.test(code)) throw new ContractError("el código tiene que ser de 6 dígitos", 400);
  return code;
}

function hmac(secret: string, value: string): string {
  return createHmac("sha256", secret).update(value).digest("hex");
}

function sameHash(left: string, right: string): boolean {
  const a = Buffer.from(left);
  const b = Buffer.from(right);
  return a.length === b.length && timingSafeEqual(a, b);
}

export class AuthService {
  constructor(
    private readonly users: AuthRepository,
    private readonly options: AuthServiceOptions,
  ) {}

  async requestCode(body: unknown): Promise<{ ok: true; expiresInSeconds: number; code?: string }> {
    if (!body || typeof body !== "object") throw new ContractError("body must be an object", 400);
    const record = body as Record<string, unknown>;
    const email = normalizeEmail(record.email);
    const purpose = normalizePurpose(record.purpose);
    const existing = this.users.findUserByEmail(email);
    if (purpose === "register" && existing) {
      throw new ContractError("Ya hay una cuenta con este correo", 409);
    }
    if (purpose === "login" && !existing) {
      throw new ContractError("No hay cuenta con este correo", 404);
    }

    const now = this.options.now?.() ?? Date.now();
    const latest = this.users.latestCode(email);
    if (latest && now - latest.created_at < RESEND_COOLDOWN_MS && latest.consumed_at === null) {
      throw new ContractError("Espera un minuto para pedir otro código", 429);
    }

    const code = String(randomInt(0, 1_000_000)).padStart(6, "0");
    this.users.insertCode({
      email,
      purpose,
      codeHash: hmac(this.options.secret, `${email}:${code}`),
      expiresAt: now + CODE_TTL_MS,
      createdAt: now,
    });
    try {
      await this.options.sendEmail({ to: email, code, purpose });
    } catch (error) {
      throw new ContractError(
        error instanceof Error ? error.message : "No se pudo enviar el correo",
        503,
      );
    }
    return {
      ok: true,
      expiresInSeconds: CODE_TTL_MS / 1000,
      ...(this.options.echoCode ? { code } : {}),
    };
  }

  async verify(body: unknown): Promise<{ token: string; user: AuthUser }> {
    if (!body || typeof body !== "object") throw new ContractError("body must be an object", 400);
    const record = body as Record<string, unknown>;
    const email = normalizeEmail(record.email);
    const code = normalizeCode(record.code);
    const now = this.options.now?.() ?? Date.now();
    const latest = this.users.latestCode(email);
    if (!latest || latest.consumed_at !== null || latest.expires_at <= now) {
      throw new ContractError("Código inválido o caducado", 401);
    }
    if (latest.attempts >= MAX_ATTEMPTS) {
      throw new ContractError("Demasiados intentos. Pide un código nuevo", 401);
    }
    if (!sameHash(latest.code_hash, hmac(this.options.secret, `${email}:${code}`))) {
      const attempts = this.users.bumpAttempts(latest.id);
      if (attempts >= MAX_ATTEMPTS) {
        this.users.consumeCode(latest.id, now);
        throw new ContractError("Demasiados intentos. Pide un código nuevo", 401);
      }
      throw new ContractError("Código incorrecto", 401);
    }

    this.users.consumeCode(latest.id, now);
    const user =
      latest.purpose === "register"
        ? this.users.findUserByEmail(email) ?? this.users.createUser(email)
        : this.users.findUserByEmail(email);
    if (!user) throw new ContractError("No hay cuenta con este correo", 404);

    const token = randomBytes(32).toString("base64url");
    this.users.createSession({
      userId: user.id,
      tokenHash: hmac(this.options.secret, token),
      expiresAt: now + SESSION_TTL_MS,
      createdAt: now,
    });
    return { token, user };
  }

  userFromAuthorization(header: string | undefined): AuthUser | undefined {
    if (!header?.startsWith("Bearer ")) return undefined;
    const token = header.slice("Bearer ".length).trim();
    if (!token) return undefined;
    const now = this.options.now?.() ?? Date.now();
    return this.users.findSession(hmac(this.options.secret, token), now);
  }

  logout(header: string | undefined): void {
    if (!header?.startsWith("Bearer ")) return;
    const token = header.slice("Bearer ".length).trim();
    if (!token) return;
    this.users.deleteSession(hmac(this.options.secret, token));
  }
}
