import { randomUUID } from "node:crypto";
import type { DatabaseSync } from "node:sqlite";

import type { AuthPurpose } from "./mailer.js";

export interface AuthUser {
  id: string;
  email: string;
}

interface CodeRow {
  id: string;
  email: string;
  purpose: AuthPurpose;
  code_hash: string;
  expires_at: number;
  attempts: number;
  consumed_at: number | null;
  created_at: number;
}

interface SessionRow {
  user_id: string;
  email: string;
  expires_at: number;
}

export class AuthRepository {
  constructor(private readonly database: DatabaseSync) {}

  findUserByEmail(email: string): AuthUser | undefined {
    const row = this.database
      .prepare("SELECT id, email FROM users WHERE email = ?")
      .get(email) as AuthUser | undefined;
    return row;
  }

  createUser(email: string): AuthUser {
    const user = { id: randomUUID(), email };
    this.database.prepare("INSERT INTO users (id, email) VALUES (?, ?)").run(user.id, user.email);
    return user;
  }

  latestCode(email: string): CodeRow | undefined {
    return this.database
      .prepare(
        `SELECT id, email, purpose, code_hash, expires_at, attempts, consumed_at, created_at
         FROM auth_codes WHERE email = ? ORDER BY created_at DESC LIMIT 1`,
      )
      .get(email) as CodeRow | undefined;
  }

  insertCode(input: { email: string; purpose: AuthPurpose; codeHash: string; expiresAt: number; createdAt: number }): void {
    this.database
      .prepare(
        `INSERT INTO auth_codes (id, email, purpose, code_hash, expires_at, created_at)
         VALUES (?, ?, ?, ?, ?, ?)`,
      )
      .run(randomUUID(), input.email, input.purpose, input.codeHash, input.expiresAt, input.createdAt);
  }

  bumpAttempts(id: string): number {
    this.database.prepare("UPDATE auth_codes SET attempts = attempts + 1 WHERE id = ?").run(id);
    const row = this.database.prepare("SELECT attempts FROM auth_codes WHERE id = ?").get(id) as { attempts: number };
    return row.attempts;
  }

  consumeCode(id: string, at: number): void {
    this.database.prepare("UPDATE auth_codes SET consumed_at = ? WHERE id = ?").run(at, id);
  }

  createSession(input: { userId: string; tokenHash: string; expiresAt: number; createdAt: number }): void {
    this.database
      .prepare(
        `INSERT INTO auth_sessions (id, user_id, token_hash, expires_at, created_at)
         VALUES (?, ?, ?, ?, ?)`,
      )
      .run(randomUUID(), input.userId, input.tokenHash, input.expiresAt, input.createdAt);
  }

  findSession(tokenHash: string, now: number): AuthUser | undefined {
    const row = this.database
      .prepare(
        `SELECT s.user_id, u.email, s.expires_at
         FROM auth_sessions s JOIN users u ON u.id = s.user_id
         WHERE s.token_hash = ?`,
      )
      .get(tokenHash) as SessionRow | undefined;
    if (!row || row.expires_at <= now) return undefined;
    return { id: row.user_id, email: row.email };
  }

  deleteSession(tokenHash: string): void {
    this.database.prepare("DELETE FROM auth_sessions WHERE token_hash = ?").run(tokenHash);
  }
}
