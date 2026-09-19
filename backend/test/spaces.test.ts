import assert from "node:assert/strict";
import test from "node:test";

import { extract, parseAnswer, parseClock } from "../src/agents/spaces/extract.js";
import { QUESTION_ORDER, SYSTEM_PROMPT, buildUserPrompt } from "../src/agents/spaces/prompt.js";
import type { SpacesAnswer, SpacesBrief } from "../src/agents/spaces/types.js";

// La llamada de referencia del escenario: 600 invitados, apertura a las 13:00 en Sur.
const brief: SpacesBrief = {
  counterpart: "Responsable de recinto",
  headcount: 600,
  zone: "sur",
  openingAt: 46800,
  candidates: [
    { id: "pabellonB", name: "Pabellón B", zone: "sur", capacity: 450 },
    { id: "loungeSur", name: "Lounge Fan Zone Sur", zone: "sur", capacity: 150 },
    { id: "norteC", name: "Pabellón Norte C", zone: "norte", capacity: 600 },
  ],
};

function answer(spaces: SpacesAnswer["spaces"]): SpacesAnswer {
  return { callId: "call-1", counterpart: "Responsable de recinto", spaces };
}

test("el guion pregunta en el orden de prioridad de T11", () => {
  assert.deepEqual(
    QUESTION_ORDER.map((question) => question.key),
    ["capacidad", "zona", "hora de montaje", "accesos", "señal de carrera", "coste"],
  );

  const positions = QUESTION_ORDER.map((question) => SYSTEM_PROMPT.indexOf(`${question.key}:`));
  assert.ok(positions.every((position) => position > 0), "todas las preguntas están en el guion");
  assert.deepEqual(positions, [...positions].sort((a, b) => a - b), "y en ese mismo orden");

  const userPrompt = buildUserPrompt(brief);
  assert.match(userPrompt, /600 invitados/);
  assert.match(userPrompt, /13:00/);
  assert.match(userPrompt, /capacidad de catálogo 450 \(sin confirmar\)/);
});

test("la disponibilidad condicionada es un acuerdo con condiciones, no un rechazo", () => {
  const { result, issues } = extract(
    answer([
      {
        id: "loungeSur",
        availability: "condicionada",
        capacity: 150,
        zone: "sur",
        conditions: ["el montaje no termina hasta las 13:15"],
      },
    ]),
    brief,
  );

  assert.deepEqual(issues, []);
  const commitment = result.commitments.find((item) => item.id === "c-espacios-loungeSur");
  assert.ok(commitment);
  assert.equal(commitment.status, "aceptado_condiciones");
  assert.deepEqual(commitment.conditions, ["el montaje no termina hasta las 13:15"]);
  assert.equal(result.spaceUpdates[0]?.status, "propuesto");
});

test("«el montaje no termina hasta las 13:15» sale como readyAt 47700, no como descartado", () => {
  const { result } = extract(
    answer([{ id: "loungeSur", availability: "disponible", capacity: 150, readyAt: "13:15" }]),
    brief,
  );

  const update = result.spaceUpdates.find((item) => item.id === "loungeSur");
  assert.ok(update);
  assert.equal(update.readyAt, 47700);
  assert.equal(update.status, "propuesto");

  // Una hora posterior a la apertura queda registrada como condición pendiente.
  const commitment = result.commitments[0];
  assert.ok(commitment);
  assert.equal(commitment.status, "aceptado_condiciones");
  assert.match(commitment.conditions.join(" "), /13:15/);

  assert.equal(parseClock("13.15"), 47700);
  assert.equal(parseClock("13h15"), 47700);
  assert.equal(parseClock(47700), 47700);
});

test("rellena capacidad, zona y coste, y deja la llamada como evidencia", () => {
  const { result } = extract(
    answer([
      {
        id: "pabellonB",
        availability: "disponible",
        capacity: 450,
        zone: "sur",
        readyAt: "12:30",
        access: "acceso este Sur, accesible",
        raceFeed: "si",
        cost: 1500,
      },
      {
        id: "loungeSur",
        availability: "condicionada",
        capacity: 150,
        zone: "sur",
        readyAt: "13:15",
        access: "acceso Fan Zone Sur",
        raceFeed: "si",
        cost: 900,
        conditions: ["el montaje no termina hasta las 13:15"],
      },
    ]),
    brief,
  );

  const pabellonB = result.spaceUpdates.find((item) => item.id === "pabellonB");
  assert.ok(pabellonB);
  assert.equal(pabellonB.capacity, 450);
  assert.equal(pabellonB.zone, "sur");
  assert.equal(pabellonB.evidenceCallId, "call-1");
  assert.match(pabellonB.note ?? "", /acceso este Sur/);

  assert.equal(result.forecastDelta, 2400);
  assert.deepEqual(result.missing, [], "no queda nada por preguntar");
  assert.ok(result.commitments.every((item) => item.evidenceCallId === "call-1"));

  // Listo a las 12:30, antes de abrir: no hay condición que añadir.
  assert.equal(
    result.commitments.find((item) => item.id === "c-espacios-pabellonB")?.status,
    "en_consulta",
  );
});

test("un dato que no aparece en la conversación queda vacío y se apunta como pendiente", () => {
  const { result } = extract(
    answer([{ id: "pabellonB", availability: "disponible", capacity: null, cost: null, raceFeed: "desconocido" }]),
    brief,
  );

  const update = result.spaceUpdates.find((item) => item.id === "pabellonB");
  assert.ok(update);
  assert.ok(!("capacity" in update), "no hereda la capacidad del catálogo");
  assert.ok(!("readyAt" in update));
  assert.deepEqual(result.missing, [
    "pabellonB: capacidad",
    "pabellonB: zona",
    "pabellonB: hora de montaje",
    "pabellonB: accesos",
    "pabellonB: señal de carrera",
    "pabellonB: coste",
  ]);
  assert.equal(result.forecastDelta, 0);
});

test("haber hablado no confirma nada", () => {
  const { result } = extract(
    answer([
      { id: "pabellonB", availability: "disponible", capacity: 450, zone: "sur" },
      { id: "norteC", availability: "no_disponible" },
      { id: "loungeSur", availability: "sin_respuesta" },
    ]),
    brief,
  );

  const statuses = result.spaceUpdates.map((item) => item.status);
  assert.deepEqual(statuses, ["propuesto", "descartado", "pendiente"]);
  assert.ok(!statuses.includes("confirmado" as never));

  const pabellonB = result.commitments.find((item) => item.id === "c-espacios-pabellonB");
  assert.ok(pabellonB);
  assert.equal(pabellonB.status, "en_consulta");
  assert.equal(
    result.commitments.find((item) => item.id === "c-espacios-norteC"),
    undefined,
    "un espacio rechazado no genera compromiso",
  );
});

test("lo que no se entiende se marca como incidencia en vez de adivinarse", () => {
  const { result, issues } = extract(
    answer([
      { id: "pabellonB", availability: "disponible", readyAt: "cuando acabe el montaje" },
      { id: "pabellonZ", availability: "disponible" },
      { id: "norteC", availability: "disponible", capacity: 600, zone: "sur" },
    ]),
    brief,
  );

  assert.deepEqual(
    issues.map((issue) => issue.code),
    ["hora_ilegible", "espacio_desconocido", "zona_contradictoria"],
  );
  assert.equal(result.spaceUpdates.length, 2, "el espacio desconocido no entra en el estado");
  assert.ok(!("readyAt" in (result.spaceUpdates[0] ?? {})));

  assert.equal(parseAnswer("no es json", brief).result, null);
  assert.deepEqual(parseAnswer('{"callId":"","spaces":[]}', brief).issues, [
    { code: "forma", detail: "callId vacío" },
    { code: "forma", detail: "counterpart vacío" },
  ]);
});
