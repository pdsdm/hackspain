import { resolve } from "node:path";

const DEFAULT_PORT = 8000;
/** Teléfono de pruebas del equipo. Es el destino por defecto de todas las áreas. */
export const DEFAULT_TEST_PHONE = "+34616500586";
const FIXTURES = [
  "calm",
  "normal",
  "crisis",
  "proposal",
  "recovered",
  "lounge_unavailable",
  "pabellon_b_400",
] as const;

export type InitialFixture = (typeof FIXTURES)[number];
export type CoordinatorMode = "llm" | "rules";
export type AreaHook = "espacios" | "catering" | "transporte" | "asistentes";

export interface AppConfig {
  databasePath: string;
  host: string;
  port: number;
  workflowToken: string | undefined;
  happyrobotApiKey: string | undefined;
  happyrobotTestPhone: string | undefined;
  initialFixture: InitialFixture;
  clockSpeed: number;
  coordinatorMode: CoordinatorMode;
  jevEnabled: boolean;
  jevApplyConfirmations: boolean;
  jevReviewedTranscriptHashes: string[];
  jevAllowUnreviewedTranscripts: boolean;
  jevTimeoutMs: number;
  typesafeApiKey: string | undefined;
  jevModel: string;
  hooks: Partial<Record<AreaHook, string>>;
  publicBaseUrl: string;
  deploymentId?: string;
}

function readPort(value: string | undefined): number {
  if (value === undefined || value.trim() === "") {
    return DEFAULT_PORT;
  }

  const port = Number(value);
  if (!Number.isInteger(port) || port < 1 || port > 65_535) {
    throw new Error(`PORT must be an integer between 1 and 65535, received "${value}"`);
  }

  return port;
}

function readDatabasePath(value: string | undefined): string {
  const path = value?.trim();
  if (!path) {
    return resolve("data", "crisis.db");
  }

  return path === ":memory:" ? path : resolve(path);
}

function readFixture(value: string | undefined): InitialFixture {
  const fixture = value?.trim();
  if (!fixture) return "calm";
  if (!FIXTURES.includes(fixture as InitialFixture)) {
    throw new Error(`INITIAL_FIXTURE must be one of ${FIXTURES.join(", ")}`);
  }
  return fixture as InitialFixture;
}

function readClockSpeed(value: string | undefined): number {
  if (value === undefined || value.trim() === "") return 1;
  const speed = Number(value);
  if (!Number.isFinite(speed) || speed <= 0 || speed > 120) {
    throw new Error(`CLOCK_SPEED must be a number between 0 and 120, received "${value}"`);
  }
  return speed;
}

function hasLlmKey(env: NodeJS.ProcessEnv): boolean {
  return Boolean(
    env.COGNITION_API_KEY?.trim() ||
      env.DEVIN_API_KEY?.trim() ||
      env.OPENAI_API_KEY?.trim() ||
      env.HELMCODE_API_KEY?.trim() ||
      env.ANTHROPIC_API_KEY?.trim() ||
      (env.COORDINATOR_HARNESS?.trim() === "happyrobot" && env.HAPPYROBOT_COORDINATOR_WORKFLOW_ID?.trim()),
  );
}

function readCoordinatorMode(value: string | undefined, env: NodeJS.ProcessEnv): CoordinatorMode {
  const mode = value?.trim();
  if (mode === "llm" || mode === "rules") return mode;
  if (mode) throw new Error(`COORDINATOR_MODE must be llm or rules, received "${value}"`);
  return hasLlmKey(env) ? "llm" : "rules";
}

function readHook(value: string | undefined): string | undefined {
  const url = value?.trim();
  return url || undefined;
}

function readReviewedHashes(value: string | undefined): string[] {
  const hashes = value?.trim().toLowerCase().split(/[\s,]+/).filter(Boolean) ?? [];
  if (hashes.some((hash) => !/^[a-f0-9]{64}$/.test(hash))) {
    throw new Error("JEV_REVIEWED_TRANSCRIPT_HASHES must contain SHA-256 hashes separated by commas");
  }
  return [...new Set(hashes)];
}

function readPhone(value: string | undefined): string | undefined {
  const phone = value?.trim();
  if (!phone) return undefined;
  if (!/^\+[1-9]\d{7,14}$/.test(phone)) {
    throw new Error("HAPPYROBOT_TEST_PHONE must use E.164, for example +34600000000");
  }
  return phone;
}

function readJevTimeout(value: string | undefined): number {
  if (value === undefined || value.trim() === "") return 3_000;
  const timeout = Number(value);
  if (!Number.isInteger(timeout) || timeout < 200 || timeout > 15_000) {
    throw new Error(`JEV_TIMEOUT_MS must be an integer between 200 and 15000, received "${value}"`);
  }
  return timeout;
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): AppConfig {
  const hooks: AppConfig["hooks"] = {};
  // Un área sin hook propio no tiene canal, y entonces su tarea muere en «Sin canal real
  // configurado» sin llamar a nadie. HAPPYROBOT_HOOK_DEFAULT da voz a las cuatro áreas con
  // un único workflow: el cuerpo ya lleva area, objective, counterpart y contact.role.
  // Es opt-in explícito: activar canales reales sin querer obliga a tener teléfono y saca
  // llamadas de verdad, así que no se hereda de otras variables.
  const fallback = readHook(env.HAPPYROBOT_HOOK_DEFAULT);
  const espacios = readHook(env.HAPPYROBOT_HOOK_ESPACIOS) ?? fallback;
  const catering = readHook(env.HAPPYROBOT_HOOK_CATERING) ?? fallback;
  const transporte = readHook(env.HAPPYROBOT_HOOK_TRANSPORTE) ?? fallback;
  const asistentes = readHook(env.HAPPYROBOT_HOOK_ASISTENTES) ?? fallback;
  if (espacios) hooks.espacios = espacios;
  if (catering) hooks.catering = catering;
  if (transporte) hooks.transporte = transporte;
  if (asistentes) hooks.asistentes = asistentes;
  const happyrobotApiKey = env.HAPPYROBOT_API_KEY?.trim() || undefined;
  // Siempre hay un destino: así una llamada nunca sale sin número y el panel arranca con un
  // teléfono visible. `HAPPYROBOT_TEST_PHONE` lo sustituye, y el panel manda sobre los dos
  // (`POST /agents/:area/phone`).
  const happyrobotTestPhone = readPhone(env.HAPPYROBOT_TEST_PHONE) ?? DEFAULT_TEST_PHONE;

  return {
    databasePath: readDatabasePath(env.DATABASE_URL),
    host: env.HOST?.trim() || "0.0.0.0",
    port: readPort(env.PORT),
    workflowToken: env.HAPPYROBOT_WEBHOOK_TOKEN?.trim() || undefined,
    happyrobotApiKey,
    happyrobotTestPhone,
    initialFixture: readFixture(env.INITIAL_FIXTURE),
    clockSpeed: readClockSpeed(env.CLOCK_SPEED),
    coordinatorMode: readCoordinatorMode(env.COORDINATOR_MODE, env),
    jevEnabled: ["1", "true"].includes(env.JEV_ENABLED?.trim().toLowerCase() ?? ""),
    jevApplyConfirmations: ["1", "true"].includes(env.JEV_APPLY_CONFIRMATIONS?.trim().toLowerCase() ?? ""),
    jevReviewedTranscriptHashes: readReviewedHashes(env.JEV_REVIEWED_TRANSCRIPT_HASHES),
    jevAllowUnreviewedTranscripts: ["1", "true"].includes(env.JEV_ALLOW_UNREVIEWED_TRANSCRIPTS?.trim().toLowerCase() ?? ""),
    jevTimeoutMs: readJevTimeout(env.JEV_TIMEOUT_MS),
    typesafeApiKey: env.TYPESAFE_API_KEY?.trim() || undefined,
    jevModel: env.JEV_MODEL?.trim() || "jev-1.13.0",
    hooks,
    publicBaseUrl: env.PUBLIC_BASE_URL?.trim().replace(/\/+$/, "") || "http://localhost:8000",
    ...(env.RAILWAY_DEPLOYMENT_ID?.trim() ? { deploymentId: env.RAILWAY_DEPLOYMENT_ID.trim() } : {}),
  };
}

export const KNOWN_FIXTURES: readonly InitialFixture[] = FIXTURES;
