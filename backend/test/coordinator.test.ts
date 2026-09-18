import assert from "node:assert/strict";
import test from "node:test";

import { buildUserPrompt } from "../src/agents/coordinator/prompt.js";
import { hm, crisisInput } from "../src/agents/coordinator/scenario.js";
import type { CoordinatorOutput } from "../src/agents/coordinator/types.js";
import { parseOutput, validateOutput } from "../src/agents/coordinator/validate.js";

// Plan de referencia del escenario: Pabellón B (450) + Lounge Sur (150) para las 600 personas,
// lo que obliga a repartir el grupo de los shuttles entre los dos espacios.
function validPlan(): CoordinatorOutput {
  return {
    reading:
      "El Pabellón Principal queda cerrado: las 600 personas no tienen ubicación y el catering apunta a un muelle inutilizable.",
    planVersion: 2,
    coordinatorStatus: "esperando_decision",
    actions: [
      {
        id: "a1",
        area: "espacios",
        channel: "llamada",
        counterpart: "Responsable de recinto",
        objective: "Confirmar Pabellón B y Lounge Fan Zone Sur para la apertura de las 13:00",
        dueAt: hm(12, 25),
        dependsOn: [],
        reason: "Sin espacio confirmado en Sur no hay ningún plan ejecutable.",
      },
      {
        id: "a2",
        area: "catering",
        channel: "llamada",
        counterpart: "Responsable de catering",
        objective: "Repartir 450 y 150 servicios entre los dos espacios",
        dueAt: hm(12, 35),
        dependsOn: ["a1"],
        reason: "El reparto depende de que el recinto confirme los dos espacios.",
      },
    ],
    commitments: [
      {
        id: "c-pabellonB",
        title: "Pabellón B para 450 invitados",
        area: "espacios",
        status: "en_consulta",
        counterpart: "Recinto",
        conditions: ["Confirmar montaje y equipamiento"],
      },
    ],
    assignments: [
      { groupId: "g-propios", spaceId: "pabellonB", count: 330 },
      { groupId: "g-acceso", spaceId: "pabellonB", count: 90 },
      { groupId: "g-shuttles", spaceId: "pabellonB", count: 30 },
      { groupId: "g-shuttles", spaceId: "loungeSur", count: 150 },
    ],
    decision: {
      title: "Habilitar Pabellón B y Lounge Sur",
      summary: "Dividir la hospitalidad en dos espacios de la zona Sur para cubrir las 600 plazas.",
      cost: 3200,
      conditions: ["Montaje del Lounge sin confirmar", "Muelle este por verificar"],
      effectApprove: "Se habilitan los dos espacios y se comunica la apertura a las 13:00.",
      effectReject: "Hay que buscar un único espacio de 600, probablemente Norte C con retraso.",
      rationale: "Es la única combinación en Sur que cubre las 600 plazas sin traslado entre zonas.",
    },
    unverified: ["Capacidad real de Pabellón B en el montaje previsto"],
  };
}

test("el plan de referencia del escenario inicial pasa la validación", () => {
  const { output, issues } = validateOutput(validPlan(), crisisInput());

  assert.deepEqual(issues, []);
  assert.equal(output?.assignments.length, 4);
});

test("rechaza superar el aforo de un espacio", () => {
  const plan = validPlan();
  plan.assignments = [{ groupId: "g-propios", spaceId: "loungeSur", count: 330 }];

  const { issues } = validateOutput(plan, crisisInput());

  assert.equal(issues[0]?.code, "aforo_superado");
});

test("rechaza asignar más personas de las que tiene un grupo", () => {
  const plan = validPlan();
  plan.assignments = [{ groupId: "g-acceso", spaceId: "pabellonB", count: 200 }];

  const { issues } = validateOutput(plan, crisisInput());

  assert.equal(issues[0]?.code, "grupo_sobreasignado");
});

test("exige escalado cuando el coste previsto supera lo autorizado", () => {
  const input = crisisInput();
  input.budget.forecast = 3200;
  const plan = validPlan();
  plan.decision = null;
  plan.coordinatorStatus = "replanificando";

  const { issues } = validateOutput(plan, input);

  assert.equal(issues[0]?.code, "falta_escalado");
});

test("rechaza escalar un gasto que cabe en el límite autónomo", () => {
  const plan = validPlan();
  plan.decision = { ...validPlan().decision!, cost: 900 };

  const { issues } = validateOutput(plan, crisisInput());

  assert.equal(issues[0]?.code, "escalado_innecesario");
});

test("exige un porqué en cada acción", () => {
  const plan = validPlan();
  plan.actions[0]!.reason = "   ";

  const { issues } = validateOutput(plan, crisisInput());

  assert.equal(issues[0]?.code, "razon_vacia");
});

test("rechaza depender de una acción que no existe", () => {
  const plan = validPlan();
  plan.actions[1]!.dependsOn = ["a9"];

  const { issues } = validateOutput(plan, crisisInput());

  assert.equal(issues[0]?.code, "dependencia_inexistente");
});

test("rechaza un plazo anterior a la hora actual", () => {
  const plan = validPlan();
  plan.actions[0]!.dueAt = hm(12, 10);

  const { issues } = validateOutput(plan, crisisInput());

  assert.equal(issues[0]?.code, "plazo_pasado");
});

test("rechaza dar por confirmado un compromiso con condiciones abiertas", () => {
  const plan = validPlan();
  plan.commitments[0]!.status = "confirmado";

  const { issues } = validateOutput(plan, crisisInput());

  assert.equal(issues[0]?.code, "confirmado_con_condiciones");
});

test("rechaza una respuesta que no es JSON", () => {
  const { output, issues } = parseOutput("Claro, aquí tienes el plan:", crisisInput());

  assert.equal(output, null);
  assert.equal(issues[0]?.code, "json_invalido");
});

test("rechaza asignar personas a un espacio cerrado o descartado", () => {
  const plan = validPlan();
  plan.assignments = [{ groupId: "g-acceso", spaceId: "principal", count: 90 }];

  const { issues } = validateOutput(plan, crisisInput());

  assert.equal(issues[0]?.code, "espacio_no_utilizable");
});

test("carga los estados de demo de T5", () => {
  const crisis = crisisInput();
  const total = crisis.guestGroups.reduce((sum, group) => sum + group.count, 0);

  assert.equal(total, 600);
  assert.equal(crisis.spaces.find((space) => space.id === "pabellonB")?.capacity, 450);
  assert.equal(crisis.budget.authorized, 1500);
});

test("los giros del jurado llegan como estados cargables", () => {
  const sinLounge = crisisInput("lounge_unavailable");
  const bReducido = crisisInput("pabellon_b_400");

  assert.equal(sinLounge.spaces.find((space) => space.id === "loungeSur")?.status, "descartado");
  assert.equal(bReducido.spaces.find((space) => space.id === "pabellonB")?.capacity, 400);
});

test("el prompt lleva las horas en segundos y las restricciones del escenario", () => {
  const prompt = buildUserPrompt(crisisInput());

  assert.match(prompt, /12:15 \(44100\)/);
  assert.match(prompt, /Norte y Sur sin conexión interior/);
  assert.match(prompt, /pabellonB .* capacidad 450/);
  assert.match(prompt, /listo a las 13:45/);
});
