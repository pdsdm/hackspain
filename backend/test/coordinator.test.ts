import assert from "node:assert/strict";
import test from "node:test";

import { extractJsonObject, loadLlmConfig, takeSseDataEvents } from "../src/agents/coordinator/llm.js";
import { SYSTEM_PROMPT, buildUserPrompt } from "../src/agents/coordinator/prompt.js";
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
        id: "a3",
        area: "asistentes",
        channel: "sms",
        counterpart: "Recepción MADRING",
        objective: "Distribuir las 6 personas: 2 en Pabellón B, 1 en Lounge Sur, 2 en accesos y 1 en el muelle",
        dueAt: hm(12, 30),
        dependsOn: ["a1"],
        reason: "Los dos espacios y el muelle necesitan recepción sin superar las 6 personas disponibles.",
      },
      {
        id: "a2",
        area: "catering",
        channel: "llamada",
        counterpart: "Responsable de catering",
        objective: "Repartir 450 y 150 servicios entre los dos espacios",
        dueAt: hm(12, 35),
        dependsOn: ["a1", "a3"],
        reason: "El reparto depende de los espacios y de que Recepción abra el muelle.",
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

test("el plan de referencia coordina seis personas de recepción antes de Catering", () => {
  const plan = validPlan();
  const staff = plan.actions.find((action) => action.area === "asistentes");
  const catering = plan.actions.find((action) => action.area === "catering");

  assert.ok(staff);
  assert.ok(catering);
  assert.match(staff.objective, /6 personas/);
  assert.match(staff.objective, /2 en Pabellón B, 1 en Lounge Sur, 2 en accesos y 1 en el muelle/);
  assert.ok(catering.dependsOn.includes(staff.id));
});

test("un verificationTarget fuera de la demo se descarta sin invalidar el plan", () => {
  const plan = validPlan();
  plan.commitments.push({
    id: "c-pabB",
    title: "Reserva de Pabellón B · 450 plazas",
    area: "espacios",
    status: "en_consulta",
    counterpart: "Recinto",
    conditions: ["Confirmar reserva"],
  });
  plan.actions[0]!.verificationTarget = { commitmentId: "c-pabB", resourceType: "space", resourceId: "pabellonB" };
  plan.actions[1]!.verificationTarget = { commitmentId: "c-entrega1", resourceType: "space", resourceId: "muelleEste" };

  const { output, issues } = validateOutput(plan, crisisInput());

  assert.deepEqual(issues, []);
  assert.deepEqual(output?.actions[0]?.verificationTarget, {
    commitmentId: "c-pabB",
    resourceType: "space",
    resourceId: "pabellonB",
  });
  assert.equal(output?.actions[1]?.verificationTarget, undefined);
});

test("un verificationTarget mal formado tampoco tumba el plan", () => {
  const plan = validPlan();
  (plan.actions[0] as { verificationTarget?: unknown }).verificationTarget = "c-pabB";

  const { output, issues } = validateOutput(plan, crisisInput());

  assert.deepEqual(issues, []);
  assert.equal(output?.actions[0]?.verificationTarget, undefined);
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

test("un coste superior al antiguo límite no exige escalado", () => {
  const input = crisisInput();
  input.budget.forecast = 6000;
  const plan = validPlan();
  plan.decision = null;
  plan.estimatedCost = 6000;
  plan.coordinatorStatus = "replanificando";
  assert.deepEqual(validateOutput(plan, input).issues, []);
});

test("las decisiones operativas no dependen del coste", () => {
  const plan = validPlan();
  plan.decision = { ...validPlan().decision!, kind: "operational", cost: 0 };
  const { output, issues } = validateOutput(plan, crisisInput());
  assert.deepEqual(issues, []);
  assert.equal(output?.decision?.kind, "operational");
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

test("rechaza asignar invitados a un parking, paddock, acceso o muelle", () => {
  const plan = validPlan();
  plan.assignments = [{ groupId: "g-acceso", spaceId: "parkingSur", count: 90 }];

  const { issues } = validateOutput(plan, crisisInput());

  assert.equal(issues[0]?.code, "espacio_no_hospitalidad");
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
  const input = crisisInput();
  const prompt = buildUserPrompt(input);

  assert.match(prompt, /12:15 \(44100\)/);
  assert.match(prompt, /Norte y Sur sin conexión interior/);
  assert.match(prompt, /Recepción disponible: 6 personas/);
  assert.match(prompt, /pabellonB .* capacidad 450/);
  assert.match(prompt, /listo a las 13:45/);
  assert.match(SYSTEM_PROMPT, /sumen como máximo 6/);
  assert.match(SYSTEM_PROMPT, /se bloquea un muelle/);
  assert.match(SYSTEM_PROMPT, /principal_pipe_burst.*B 450 \+ Lounge 150/);
  assert.match(SYSTEM_PROMPT, /dock_blocked.*acciones visibles de espacios, catering, transporte y asistentes/);
});

test("Helmcode usa Deepseek por el endpoint compatible con OpenAI", () => {
  const config = loadLlmConfig({ HELMCODE_API_KEY: "sk-test" });

  assert.equal(config.provider, "helmcode");
  assert.equal(config.model, "deepseek-v4-flash");
  assert.equal(config.baseUrl, "https://api.helmcode.com/v1");
  assert.equal(config.harness, "json");
  assert.equal(config.reasoningEffort, "low");
});

test("el effort de Helmcode se puede sobrescribir y no se impone a otros proveedores", () => {
  assert.equal(
    loadLlmConfig({ HELMCODE_API_KEY: "sk-test", COORDINATOR_REASONING_EFFORT: "none" }).reasoningEffort,
    "none",
  );
  assert.equal(loadLlmConfig({ OPENAI_API_KEY: "sk-test" }).reasoningEffort, undefined);
  assert.equal(loadLlmConfig({ COGNITION_API_KEY: "sk-test" }).reasoningEffort, undefined);
  assert.equal(
    loadLlmConfig({ COGNITION_API_KEY: "sk-test", COORDINATOR_REASONING_EFFORT: "high" }).reasoningEffort,
    "high",
  );
});

test("el parser SSE del chat deja el trozo incompleto en rest", () => {
  const { payloads, rest } = takeSseDataEvents(
    'data: {"choices":[{"delta":{"reasoning_content":"hola"}}]}\ndata: {"choices":[{"delta":{"content":"{"}}]}\ndata: {parcial',
  );
  assert.equal(payloads.length, 2);
  assert.equal(rest, "data: {parcial");
});

test("el prompt corta el thinking y no pide queries por confirmaciones humanas", () => {
  assert.match(SYSTEM_PROMPT, /Prohibido redactar el JSON en el thinking/);
  assert.match(SYSTEM_PROMPT, /Hasta 5 acciones/);
  assert.match(buildUserPrompt(crisisInput()), /No escribas JSON en el thinking/);
});

test("recupera un JSON embebido en el thinking", () => {
  const salvaged = extractJsonObject('plan listo {"reading":"ok","done":true} fin');
  assert.equal(salvaged, '{"reading":"ok","done":true}');
  assert.equal(extractJsonObject("todavía pensando"), null);
  assert.equal(extractJsonObject('{"reading":"ok","done":true}\n}'), '{"reading":"ok","done":true}');
});

test("Cognition/Devin es el proveedor por defecto y usa el harness de tools", () => {
  const config = loadLlmConfig({
    COGNITION_API_KEY: "cog_test",
    OPENAI_API_KEY: "sk-openai",
  });

  assert.equal(config.provider, "cognition");
  assert.equal(config.model, "swe-1.7");
  assert.equal(config.harness, "tools");
  assert.equal(config.baseUrl, "https://api.cognition.ai/v1");
});

test("el harness Devin cloud exige DEVIN_ORG_ID", () => {
  assert.throws(
    () => loadLlmConfig({ COGNITION_API_KEY: "cog_test", COORDINATOR_HARNESS: "devin" }),
    /DEVIN_ORG_ID/,
  );
});

test("normaliza set_place sobre una puerta a set_gate", () => {
  const plan = validPlan();
  plan.operations = [{ op: "set_place", id: "gate-oeste", status: "cerrado" }];

  const { output, issues } = parseOutput(JSON.stringify(plan), crisisInput("calm"));

  assert.deepEqual(issues, []);
  assert.equal(output?.operations?.[0]?.op, "set_gate");
});

test("acepta operations de Devin con placeId/estado/vehicleId", () => {
  const payload = JSON.stringify({
    reading: "Acceso Sur cerrado, shuttles a esperaSur.",
    planVersion: 2,
    coordinatorStatus: "replanificando",
    actions: [],
    commitments: [],
    assignments: [],
    decision: null,
    unverified: [],
    operations: [
      { op: "set_place", placeId: "accesoSur", estado: "cerrado" },
      { op: "reroute_shuttle", vehicleId: "BUS-01", destinationId: "esperaSur" },
      { op: "redirect_delivery", deliveryId: "CAT-01", muelleId: "muelleEste" },
      { op: "redirect_delivery", destino: "sin-muelle" },
      { op: "log_event", message: "Acceso Sur cortado" },
    ],
    done: true,
  });
  const { output, issues } = parseOutput(payload, crisisInput("calm"));
  assert.deepEqual(issues, []);
  assert.ok(output);
  const first = output.operations?.[0];
  const second = output.operations?.[1];
  assert.equal(first?.op, "set_place");
  assert.equal(first && "id" in first ? first.id : undefined, "accesoSur");
  assert.equal(second && "id" in second ? second.id : undefined, "BUS-01");
  const delivery = output.operations?.[2];
  assert.equal(delivery && "op" in delivery ? delivery.op : undefined, "redirect_delivery");
  assert.equal(delivery && "id" in delivery ? delivery.id : undefined, "CAT-01");
  assert.equal(delivery && "dockId" in delivery ? delivery.dockId : undefined, "muelleEste");
  assert.equal(output.operations?.length, 4);
});
