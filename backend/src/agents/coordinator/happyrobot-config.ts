export const HAPPYROBOT_COORDINATOR_MODEL = "gpt-5.6-luna-low";
const DEFAULT_API_BASE = "https://platform.eu.happyrobot.ai/api/v2";
const DEFAULT_TIMEOUT_MS = 180_000;

export interface HappyRobotCoordinatorConfig {
  apiKey: string;
  apiBase: string;
  workflowId: string;
  hookUrl?: string;
  environment: string;
  model: string;
  apply: boolean;
  timeoutMs: number;
  publicBaseUrl: string;
}

export function readApplyFlag(value: string | undefined): boolean {
  return ["1", "true"].includes(value?.trim().toLowerCase() ?? "");
}

export function loadHappyRobotCoordinatorConfig(
  env: NodeJS.ProcessEnv = process.env,
): HappyRobotCoordinatorConfig {
  const apiKey = env.HAPPYROBOT_API_KEY?.trim();
  const workflowId = env.HAPPYROBOT_COORDINATOR_WORKFLOW_ID?.trim();
  if (!apiKey) throw new Error("COORDINATOR_HARNESS=happyrobot requiere HAPPYROBOT_API_KEY");
  if (!workflowId) throw new Error("COORDINATOR_HARNESS=happyrobot requiere HAPPYROBOT_COORDINATOR_WORKFLOW_ID");
  const timeoutRaw = env.HAPPYROBOT_COORDINATOR_TIMEOUT_MS?.trim();
  const timeoutMs = timeoutRaw ? Number(timeoutRaw) : DEFAULT_TIMEOUT_MS;
  if (!Number.isInteger(timeoutMs) || timeoutMs < 1_000 || timeoutMs > 600_000) {
    throw new Error("HAPPYROBOT_COORDINATOR_TIMEOUT_MS must be an integer between 1000 and 600000");
  }
  return {
    apiKey,
    apiBase: (env.HAPPYROBOT_COORDINATOR_API_BASE?.trim() || DEFAULT_API_BASE).replace(/\/+$/, ""),
    workflowId,
    ...(env.HAPPYROBOT_COORDINATOR_HOOK_URL?.trim() ? { hookUrl: env.HAPPYROBOT_COORDINATOR_HOOK_URL.trim() } : {}),
    environment: env.HAPPYROBOT_COORDINATOR_ENVIRONMENT?.trim() || "development",
    model: HAPPYROBOT_COORDINATOR_MODEL,
    apply: readApplyFlag(env.HAPPYROBOT_COORDINATOR_APPLY),
    timeoutMs,
    publicBaseUrl: env.PUBLIC_BASE_URL?.trim().replace(/\/+$/, "") || "http://localhost:8000",
  };
}
