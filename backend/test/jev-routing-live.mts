import { buildUserPrompt, SYSTEM_PROMPT } from "../src/agents/coordinator/prompt.js";
import { complete, loadLlmConfig } from "../src/agents/coordinator/llm.js";
import { crisisInput } from "../src/agents/coordinator/scenario.js";
import { parseOutput } from "../src/agents/coordinator/validate.js";
import { createRoutingEvaluator, qualifiesForLounge, ROUTING_MODEL, routingTextHash } from "../src/agents/jev-routing.js";
import { JevHttpError } from "../src/agents/jev.js";
import { BASELINE_CASE_IDS, ROUTING_CASES, type RoutingCase } from "./jev-routing-cases.js";

if (process.env.JEV_ROUTING_LIVE !== "true") throw new Error("Set JEV_ROUTING_LIVE=true to run the paid routing pilot");
const apiKey = process.env.TYPESAFE_API_KEY?.trim();
if (!apiKey) throw new Error("TYPESAFE_API_KEY is required");
const runCoordinator = process.env.JEV_ROUTING_SKIP_COORDINATOR !== "true";
if (runCoordinator && !process.env.HELMCODE_API_KEY?.trim()) throw new Error("HELMCODE_API_KEY is required for the coordinator comparison");

const reviewed = new Set(ROUTING_CASES.map((item) => routingTextHash(item.text)));
const evaluate = createRoutingEvaluator({ apiKey, model: ROUTING_MODEL, timeoutMs: 1500 }, reviewed);
interface JevObservation { id: string; split: string; expected: string; category: string; repetition: number; latencyMs: number; route: "playbook" | "llm" | "unavailable"; scores?: unknown; inputTokens: number; outputTokens: number }
const observations: JevObservation[] = [];
let requestCount = 0;
const repetitions = (item: RoutingCase) => item.split === "development" ? 1 : 2;
for (const item of ROUTING_CASES) {
  for (let repetition = 1; repetition <= repetitions(item); repetition += 1) {
    if (++requestCount > 60) throw new Error("JEV request budget exceeded");
    const started = performance.now();
    try {
      const result = await evaluate(item.text, new AbortController().signal);
      observations.push({ id: item.id, split: item.split, expected: item.expected, category: item.category, repetition,
        latencyMs: Math.round(performance.now() - started), route: qualifiesForLounge(result.scores) ? "playbook" : "llm",
        scores: result.scores, inputTokens: result.inputTokens ?? 0, outputTokens: result.outputTokens ?? 0 });
    } catch (error) {
      if (error instanceof JevHttpError && [401, 403].includes(error.status)) throw new Error("JEV authentication failed; pilot stopped");
      observations.push({ id: item.id, split: item.split, expected: item.expected, category: item.category, repetition,
        latencyMs: Math.round(performance.now() - started), route: "unavailable", inputTokens: 0, outputTokens: 0 });
    }
    console.log("JEV_OBSERVATION", JSON.stringify(observations.at(-1)));
  }
}

function percentile(values: number[], fraction: number): number | null {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.max(0, Math.ceil(sorted.length * fraction) - 1)]!;
}
function summarizeJev(split: "development" | "holdout") {
  const rows = observations.filter((row) => row.split === split);
  const evaluated = rows.filter((row) => row.route !== "unavailable");
  const byCase = ROUTING_CASES.filter((item) => item.split === split).map((item) => {
    const votes = rows.filter((row) => row.id === item.id).map((row) => row.route);
    return { ...item, votes, stable: new Set(votes).size === 1, correct: votes.every((vote) => vote === item.expected) };
  });
  return {
    cases: byCase.length, requests: rows.length, evaluated: evaluated.length, unavailable: rows.length - evaluated.length,
    truePositive: evaluated.filter((row) => row.expected === "playbook" && row.route === "playbook").length,
    falseNegative: evaluated.filter((row) => row.expected === "playbook" && row.route !== "playbook").length,
    falsePositive: evaluated.filter((row) => row.expected === "llm" && row.route === "playbook").length,
    trueNegative: evaluated.filter((row) => row.expected === "llm" && row.route !== "playbook").length,
    exactCases: byCase.filter((item) => item.correct).length, unstableCases: byCase.filter((item) => !item.stable).map((item) => item.id),
    mistakes: byCase.filter((item) => !item.correct).map((item) => ({ id: item.id, expected: item.expected, votes: item.votes, category: item.category })),
    latencyMs: { median: percentile(rows.map((row) => row.latencyMs), 0.5), p95: percentile(rows.map((row) => row.latencyMs), 0.95), max: percentile(rows.map((row) => row.latencyMs), 1) },
  };
}

interface CoordinatorObservation { id: string; expected: string; latencyMs: number; valid: boolean; destructiveLoungeChange: boolean; matchedLabel: boolean; issues: string[]; actionCount: number }
const coordinator: CoordinatorObservation[] = [];
if (runCoordinator) {
  const config = loadLlmConfig({ ...process.env, COORDINATOR_HARNESS: "json", COORDINATOR_VERBOSE: "0" });
  for (const id of BASELINE_CASE_IDS) {
    const item = ROUTING_CASES.find((candidate) => candidate.id === id)!;
    const input = { ...crisisInput("recovered"), event: { source: "chat", kind: "free_text", text: item.text } };
    const started = performance.now();
    let valid = false, destructiveLoungeChange = false, issues: string[] = [], actionCount = 0;
    try {
      const text = await complete(config, SYSTEM_PROMPT, buildUserPrompt(input), { nonce: `routing-${id}-${Date.now()}`, signal: AbortSignal.timeout(120_000) });
      const parsed = parseOutput(text, input);
      valid = parsed.output !== null;
      issues = parsed.issues.map((issue) => `${issue.code}:${issue.detail}`);
      actionCount = parsed.output?.actions.length ?? 0;
      destructiveLoungeChange = Boolean(parsed.output?.operations?.some((operation) =>
        operation.op === "set_place" && operation.id === "loungeSur" && ["cerrado", "descartado"].includes(operation.status)));
    } catch (error) {
      issues = [error instanceof Error ? error.message : String(error)];
    }
    const observation = { id, expected: item.expected, latencyMs: Math.round(performance.now() - started), valid,
      destructiveLoungeChange, matchedLabel: valid && (item.expected === "playbook" ? destructiveLoungeChange : !destructiveLoungeChange), issues, actionCount };
    coordinator.push(observation);
    console.log("COORDINATOR_OBSERVATION", JSON.stringify(observation));
  }
}

console.log("PILOT_SUMMARY", JSON.stringify({
  protocol: "routing-pilot-v1", model: ROUTING_MODEL, uniqueCases: ROUTING_CASES.length, jevRequests: requestCount,
  development: summarizeJev("development"), holdout: summarizeJev("holdout"),
  tokens: { input: observations.reduce((sum, row) => sum + row.inputTokens, 0), output: observations.reduce((sum, row) => sum + row.outputTokens, 0) },
  coordinator: { requested: runCoordinator ? BASELINE_CASE_IDS.length : 0, completed: coordinator.length,
    valid: coordinator.filter((row) => row.valid).length, matchedLabel: coordinator.filter((row) => row.matchedLabel).length,
    latencyMs: { median: percentile(coordinator.map((row) => row.latencyMs), 0.5), p95: percentile(coordinator.map((row) => row.latencyMs), 0.95), max: percentile(coordinator.map((row) => row.latencyMs), 1) } },
}));
