import assert from "node:assert/strict";
import test from "node:test";

import { createJevEvaluator, type JevAcceptanceInput } from "../src/agents/jev.js";
import { decideAcceptance, DEMO_TARGET } from "../src/domain/acceptance-policy.js";
import { isDemoTranscript } from "../src/domain/result-verifier.js";

const question = "¿Confirma la reserva del Pabellón B para 450 invitados? El coste del plan es 3200 euros.";
const cases = [
  { name: "aceptación explícita", texts: ["Sí, confirmo la reserva del Pabellón B para 450 invitados, sin condiciones. El coste del plan es 3200 euros."], confirm: true },
  { name: "sí pero", texts: ["Sí, pero falta la autorización del montaje."], confirm: false },
  { name: "otro recurso", texts: ["Confirmo el Norte C, no el Pabellón B."], confirm: false },
  { name: "retractación", texts: ["Sí, confirmo la reserva del Pabellón B.", "Perdón, retiro la confirmación. No puedo confirmar."], confirm: false },
  { name: "negación dudosa", texts: ["No... sí... no sé. La transcripción no es clara."], confirm: false },
  { name: "negación explícita", texts: ["No confirmo la reserva del Pabellón B."], confirm: false },
  { name: "solo acepta el agente", texts: [], confirm: false },
];

for (const item of cases) {
  const input: JevAcceptanceInput = {
    objective: "Confirmar la reserva de Pabellón B (Sur) para 450 plazas, sin cambios en los términos acordados.",
    expectedRole: "Responsable de recinto (rol esperado, no identidad autenticada)",
    target: DEMO_TARGET,
    terms: { spaceName: "Pabellón B", capacity: 450, readyAt: null, planCost: 3200 },
    transcript: [
      { who: "agente", text: question, at: 0 },
      ...item.texts.map((text, index) => ({ who: "humano" as const, text, at: index + 1 })),
    ],
  };
  test(`Spanish corpus passes the privacy boundary: ${item.name}`, () => {
    for (const line of input.transcript) assert(isDemoTranscript(line.text), item.name);
  });
  test(`live JEV Spanish evidence: ${item.name}`, { skip: process.env.JEV_LIVE_EVAL !== "true" }, async () => {
    const apiKey = process.env.TYPESAFE_API_KEY;
    assert(apiKey, "TYPESAFE_API_KEY is required for the opt-in live evaluation");
    const evaluate = createJevEvaluator({ apiKey, model: "jev-1.13.0", timeoutMs: 1500 });
    const decision = decideAcceptance(await evaluate(input));
    assert.equal(decision, item.confirm ? "confirm_target" : "keep_conditional", item.name);
  });
}
