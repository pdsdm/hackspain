// Evaluación temporal: ¿aporta algo JEV donde está enchufado hoy?
// Genera llamadas con el sim-world (contraparte LLM, prompt y semilla distintos de JEV),
// las pasa por el camino real de /workflow/results y cuenta dónde se queda cada una.
// Uso desde backend/: JEV_LIVE_EVAL=true node --env-file=../.env --import tsx test/jev-simworld-eval.mts [--runs=12]

import { counterpartReply } from "../src/actions/adapters/sim-world.js";
import { scheduleSimResult } from "../src/actions/adapters/sim.js";
import { createJevEvaluator } from "../src/agents/jev.js";
import { loadLlmConfig } from "../src/agents/coordinator/llm.js";
import { verificationSnapshot } from "../src/domain/acceptance-policy.js";
import { verifyCallAcceptance } from "../src/domain/result-verifier.js";
import { openDatabase } from "../src/state/database.js";
import { StateRepository } from "../src/state/state-repository.js";
import { TaskRepository } from "../src/state/task-repository.js";

if (process.env.JEV_LIVE_EVAL !== "true") throw new Error("Set JEV_LIVE_EVAL=true: esta evaluación gasta llamadas de pago");
const apiKey = process.env.TYPESAFE_API_KEY;
if (!apiKey) throw new Error("TYPESAFE_API_KEY is required");

const timeoutMs = Number(process.argv.find((a) => a.startsWith("--timeout="))?.slice(10) ?? 3_000);
const runs = Number(process.argv.find((a) => a.startsWith("--runs="))?.slice(7) ?? 12);
const llmConfig = loadLlmConfig();
const evaluate = createJevEvaluator({ apiKey, model: process.env.JEV_MODEL?.trim() || "jev-1.13.0", timeoutMs });

const database = openDatabase(":memory:");
const states = new StateRepository(database.connection, "proposal");
const tasks = new TaskRepository(database.connection);
const run = states.ensureActiveRun();
run.state.budget.authorized = 3200;
run.state.waitingForDecision = null;
run.state.decisions = [];
run.state.commitments.find((c) => c.id === "c-pabB")!.conditions = ["Confirmación de reserva"];
states.saveState(run.id, run.state);
const state = states.ensureActiveRun().state;

const task = tasks.enqueue({
  runId: run.id,
  planVersion: state.planVersion,
  area: "espacios",
  kind: "call",
  payload: {
    objective: "Confirmar la reserva del Pabellón B (Sur) para 450 invitados, sin cambios en los términos",
    counterpart: "Responsable de recinto",
    verificationTarget: { commitmentId: "c-pabB", resourceType: "space", resourceId: "pabellonB" },
    verificationSnapshot: verificationSnapshot(state),
  },
  idempotencyKey: "eval-pabellon-b",
});
tasks.claimNext();
const claimed = tasks.get(task.id)!;

interface Row {
  seed: number;
  outcome: string;
  conditions: number;
  motivoReal: string;
  motivoSinFiltro: string;
  scores?: Record<string, number>;
}
const rows: Row[] = [];

for (let i = 0; i < runs; i += 1) {
  const seed = 1000 + i;
  const reply = await counterpartReply(claimed, state, seed, { config: llmConfig });
  const envelope = scheduleSimResult({
    reply, task: claimed, runId: run.id, planVersion: state.planVersion,
    callId: `call-${claimed.id}`, eventId: `eval-${seed}`,
  });
  // El sim no pone sessionId y JEV lo exige: se añade para imitar un callback real de HappyRobot.
  envelope.result.evidence.sessionId = `happyrobot-session-${seed}`;
  // Camino real, con el filtro de privacidad tal cual está en producción.
  const real = await verifyCallAcceptance(claimed, envelope, evaluate, state, true, []);
  // Modo observador: transcripción sintética permitida y 3 s de margen.
  const libre = await verifyCallAcceptance(claimed, envelope, evaluate, state, false, [], {
    allowUnreviewedTranscripts: true,
    timeoutMs,
  });
  rows.push({
    seed,
    outcome: envelope.result.outcome,
    conditions: envelope.result.conditions.length,
    motivoReal: `${real.decision}/${real.reason}`,
    motivoSinFiltro: `${libre.reason}${libre.gap ? ` (${libre.gap})` : ""}`,
    ...(libre.scores ? { scores: libre.scores as unknown as Record<string, number> } : {}),
  });
  const last = rows.at(-1)!;
  console.log(
    `${String(i + 1).padStart(2)}. ${envelope.result.outcome.padEnd(24)} cond=${last.conditions}` +
    ` | real: ${last.motivoReal.padEnd(38)} | sin filtro: ${last.motivoSinFiltro}`,
  );
  if (last.scores) console.log(`    scores: ${JSON.stringify(last.scores)}`);
  const humano = (envelope.result.evidence.transcript ?? []).filter((l) => l.who === "humano").map((l) => l.text).join(" | ");
  console.log(`    humano: ${humano.slice(0, 190)}`);
}

const cuenta = (pred: (r: Row) => boolean) => rows.filter(pred).length;
console.log("\n--- Resumen de", rows.length, "llamadas generadas por el sim-world ---");
console.log("Callbacks que llegan a JEV con el filtro actual:", cuenta((r) => !r.motivoReal.includes("privacidad") && !r.motivoReal.includes("evidencia_insuficiente") && !r.motivoReal.includes("no_admitido")));
console.log("Bloqueados por el filtro de vocabulario:", cuenta((r) => r.motivoReal.includes("privacidad")));
console.log("Bloqueados antes por evidencia (no accepted o con condiciones):", cuenta((r) => r.motivoReal.includes("evidencia_insuficiente")));
console.log("Confirmarían con el filtro actual:", cuenta((r) => r.motivoReal.startsWith("confirm_target")));
console.log("Observador: evaluadas por JEV:", cuenta((r) => r.scores !== undefined));
console.log("Observador: desacuerdos señalados:", cuenta((r) => r.motivoSinFiltro.includes("(")));
console.log("Observador: sin respuesta de JEV (timeout):", cuenta((r) => r.motivoSinFiltro.includes("verificacion_no_disponible")));
console.log("\nDesglose por outcome del sim-world:");
for (const outcome of new Set(rows.map((r) => r.outcome))) {
  const subset = rows.filter((r) => r.outcome === outcome);
  console.log(` ${outcome}: ${subset.length} | evaluadas: ${subset.filter((r) => r.scores).length} | desacuerdos: ${subset.filter((r) => r.motivoSinFiltro.includes("(")).length}`);
}
database.close();
