// Comprueba que la salida del coordinador cumple los criterios de T10 antes de ejecutarla.
// No sustituye a la validación de aforo y presupuesto del backend (T7): esto solo descarta
// una respuesta del modelo mal formada o incoherente con el estado que recibió.

import { extractJsonObject } from "./llm.js";
import type {
  Area,
  CommitmentStatus,
  CoordinatorInput,
  CoordinatorOutput,
  CoordinatorStatus,
} from "./types.js";

export interface ValidationIssue {
  code: string;
  detail: string;
}

const AREAS: readonly Area[] = ["espacios", "catering", "transporte", "asistentes"];
const CHANNELS = ["llamada", "sms", "email"] as const;
const NON_GUEST_KINDS: ReadonlySet<string> = new Set(["acceso", "muelle", "parking", "paddock"]);
const STATUSES: readonly CommitmentStatus[] = [
  "propuesto",
  "en_consulta",
  "aceptado_condiciones",
  "confirmado",
  "en_ejecucion",
  "completado",
  "invalidado",
];
const COORDINATOR_STATUSES: readonly CoordinatorStatus[] = [
  "estable",
  "replanificando",
  "esperando_decision",
  "pausado",
];

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function pickString(...values: unknown[]): string | undefined {
  for (const value of values) {
    if (typeof value === "string" && value.trim() !== "") return value;
  }
  return undefined;
}

export function normalizeOperation(raw: unknown): unknown {
  if (!isRecord(raw)) return raw;
  const id = pickString(
    raw.id,
    raw.placeId,
    raw.vehicleId,
    raw.gateId,
    raw.groupId,
    raw.deliveryId,
    raw.shipmentId,
  );
  const status = pickString(raw.status, raw.estado);
  const text = pickString(raw.text, raw.message, raw.constraint);
  const next: Record<string, unknown> = { ...raw };
  if (id !== undefined) next.id = id;
  if (status !== undefined) next.status = status;
  if (next.op === "set_place" && typeof next.id === "string" && next.id.startsWith("gate-")) {
    next.op = "set_gate";
  }
  if (raw.op === "log_event") {
    next.text = text ?? pickString(raw.reason) ?? "";
    if (typeof next.kind !== "string" || next.kind === "") next.kind = "incidencia";
  }
  if (raw.op === "add_constraint") next.text = text ?? pickString(raw.reason) ?? "";
  if (raw.op === "set_group") {
    const where = pickString(raw.where, raw.location);
    const assigned = pickString(raw.assignedSpaceId, raw.spaceId);
    if (where !== undefined) next.where = where;
    if (assigned !== undefined) next.assignedSpaceId = assigned;
  }
  if (raw.op === "redirect_delivery") {
    const dockId = pickString(raw.dockId, raw.dock, raw.muelleId, raw.muelle, raw.destinationDock);
    if (dockId !== undefined) next.dockId = dockId;
  }
  if (raw.op === "redirect_vehicle") {
    const destinationId = pickString(raw.destinationId, raw.toId, raw.destination, raw.placeId);
    if (destinationId !== undefined) next.destinationId = destinationId;
  }
  if (raw.op === "spawn_vehicle" || raw.op === "add_vehicle" || raw.op === "dispatch_vehicle") {
    next.op = "spawn_vehicle";
    const from = pickString(raw.from, raw.fromId, raw.origin, raw.originId, raw.pickup);
    const destinationId = pickString(raw.destinationId, raw.toId, raw.destination, raw.placeId, raw.dockId);
    const who = pickString(raw.who, raw.cargo, raw.item, raw.description);
    if (from !== undefined) next.from = from;
    if (destinationId !== undefined) next.destinationId = destinationId;
    if (who !== undefined) next.who = who;
  }
  return next;
}

export function operationReady(raw: unknown): boolean {
  if (!isRecord(raw) || typeof raw.op !== "string") return false;
  if (raw.op === "set_place") return typeof raw.id === "string" && typeof raw.status === "string";
  if (raw.op === "reroute_shuttle") return typeof raw.id === "string" && typeof raw.destinationId === "string";
  if (raw.op === "redirect_delivery") return typeof raw.id === "string" && typeof raw.dockId === "string";
  if (raw.op === "redirect_vehicle") return typeof raw.id === "string" && typeof raw.destinationId === "string";
  if (raw.op === "spawn_vehicle") {
    return typeof raw.from === "string" && typeof raw.destinationId === "string" && typeof raw.who === "string";
  }
  if (raw.op === "cancel_action") return typeof raw.taskId === "string" && typeof raw.reason === "string";
  if (raw.op === "set_group") return typeof raw.id === "string";
  if (raw.op === "set_gate") return typeof raw.id === "string";
  if (raw.op === "log_event") return typeof raw.text === "string";
  if (raw.op === "add_constraint") return typeof raw.text === "string";
  if (raw.op === "set_agent") return true;
  return true;
}

function normalizePayload(value: unknown): unknown {
  if (!isRecord(value)) return value;
  if (!Array.isArray(value.operations)) return value;
  return { ...value, operations: value.operations.map(normalizeOperation).filter(operationReady) };
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === "string");
}

function checkShape(value: unknown): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const add = (detail: string) => issues.push({ code: "forma", detail });

  if (!isRecord(value)) {
    add("la salida no es un objeto JSON");
    return issues;
  }

  if (typeof value.reading !== "string" || value.reading.trim() === "") add("reading vacío");
  if (typeof value.planVersion !== "number") add("planVersion no es un número");
  if (!COORDINATOR_STATUSES.includes(value.coordinatorStatus as CoordinatorStatus)) {
    add(`coordinatorStatus desconocido: ${String(value.coordinatorStatus)}`);
  }
  if (!isStringArray(value.unverified)) add("unverified no es una lista de textos");

  if (!Array.isArray(value.actions)) {
    add("actions no es una lista");
  } else {
    for (const [index, raw] of value.actions.entries()) {
      if (!isRecord(raw)) {
        add(`actions[${index}] no es un objeto`);
        continue;
      }
      if (typeof raw.id !== "string" || raw.id === "") add(`actions[${index}].id vacío`);
      if (!AREAS.includes(raw.area as Area)) add(`actions[${index}].area desconocida`);
      if (!CHANNELS.includes(raw.channel as (typeof CHANNELS)[number])) {
        add(`actions[${index}].channel desconocido`);
      }
      if (typeof raw.counterpart !== "string" || raw.counterpart === "") {
        add(`actions[${index}].counterpart vacío`);
      }
      if (typeof raw.objective !== "string" || raw.objective === "") {
        add(`actions[${index}].objective vacío`);
      }
      if (typeof raw.dueAt !== "number") add(`actions[${index}].dueAt no es un número`);
      if (!isStringArray(raw.dependsOn)) add(`actions[${index}].dependsOn no es una lista`);
      if (typeof raw.reason !== "string") add(`actions[${index}].reason no es un texto`);
      // Un verificationTarget mal formado se descarta en validateOutput, no invalida el plan.
    }
  }

  if (!Array.isArray(value.commitments)) {
    add("commitments no es una lista");
  } else {
    for (const [index, raw] of value.commitments.entries()) {
      if (!isRecord(raw)) {
        add(`commitments[${index}] no es un objeto`);
        continue;
      }
      if (!STATUSES.includes(raw.status as CommitmentStatus)) {
        add(`commitments[${index}].status desconocido`);
      }
      if (!isStringArray(raw.conditions)) add(`commitments[${index}].conditions no es una lista`);
    }
  }

  if (!Array.isArray(value.assignments)) {
    add("assignments no es una lista");
  } else {
    for (const [index, raw] of value.assignments.entries()) {
      if (!isRecord(raw)) {
        add(`assignments[${index}] no es un objeto`);
        continue;
      }
      if (typeof raw.groupId !== "string") add(`assignments[${index}].groupId no es un texto`);
      if (typeof raw.spaceId !== "string") add(`assignments[${index}].spaceId no es un texto`);
      if (typeof raw.count !== "number" || raw.count <= 0) {
        add(`assignments[${index}].count debe ser un número positivo`);
      }
    }
  }

  if (value.decision !== null) {
    if (!isRecord(value.decision)) {
      add("decision debe ser un objeto o null");
    } else {
      for (const field of ["title", "summary", "effectApprove", "effectReject", "rationale"]) {
        if (typeof value.decision[field] !== "string" || value.decision[field] === "") {
          add(`decision.${field} vacío`);
        }
      }
      if (value.decision.cost !== null && (typeof value.decision.cost !== "number" || !Number.isFinite(value.decision.cost) || value.decision.cost < 0)) add("decision.cost debe ser no negativo o null");
      if (value.decision.kind !== undefined && value.decision.kind !== "operational") add("decision.kind desconocido");
      if (!isStringArray(value.decision.conditions)) add("decision.conditions no es una lista");
    }
  }

  if (value.operations !== undefined) {
    if (!Array.isArray(value.operations)) {
      add("operations no es una lista");
    } else {
      for (const [index, raw] of value.operations.entries()) {
        if (!isRecord(raw) || typeof raw.op !== "string") {
          add(`operations[${index}] no es una operación`);
          continue;
        }
        const known = [
          "set_place",
          "set_gate",
          "reroute_shuttle",
          "redirect_delivery",
          "redirect_vehicle",
          "spawn_vehicle",
          "set_group",
          "cancel_action",
          "set_agent",
          "log_event",
          "add_constraint",
        ];
        if (!known.includes(raw.op)) add(`operations[${index}].op desconocido: ${raw.op}`);
        if (raw.op === "set_place" && typeof raw.id !== "string") add(`operations[${index}].id vacío`);
        if (raw.op === "reroute_shuttle" && (typeof raw.id !== "string" || typeof raw.destinationId !== "string")) {
          add(`operations[${index}] reroute_shuttle incompleto`);
        }
        if (raw.op === "redirect_delivery" && (typeof raw.id !== "string" || typeof raw.dockId !== "string")) {
          add(`operations[${index}] redirect_delivery incompleto`);
        }
        if (raw.op === "redirect_vehicle" && (typeof raw.id !== "string" || typeof raw.destinationId !== "string")) {
          add(`operations[${index}] redirect_vehicle incompleto`);
        }
        if (raw.op === "spawn_vehicle" && (typeof raw.from !== "string" || typeof raw.destinationId !== "string" || typeof raw.who !== "string")) {
          add(`operations[${index}] spawn_vehicle incompleto`);
        }
        if (raw.op === "cancel_action" && (typeof raw.taskId !== "string" || typeof raw.reason !== "string")) {
          add(`operations[${index}] cancel_action incompleto`);
        }
      }
    }
  }

  if (value.queries !== undefined) {
    if (!Array.isArray(value.queries)) {
      add("queries no es una lista");
    } else {
      for (const [index, raw] of value.queries.entries()) {
        if (!isRecord(raw) || typeof raw.type !== "string") {
          add(`queries[${index}] inválida`);
          continue;
        }
        if (!["affected_by", "alternatives_for", "route"].includes(raw.type)) {
          add(`queries[${index}].type desconocido`);
        }
      }
    }
  }

  if (value.done !== undefined && typeof value.done !== "boolean") add("done no es un booleano");

  return issues;
}

function checkInvariants(output: CoordinatorOutput, input: CoordinatorInput): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const add = (code: string, detail: string) => issues.push({ code, detail });

  if (output.planVersion < input.planVersion) {
    add("version_plan_retrocede", `${output.planVersion} < ${input.planVersion}`);
  }

  const actionIds = new Set(output.actions.map((action) => action.id));
  for (const action of output.actions) {
    if (action.reason.trim() === "") add("razon_vacia", `acción ${action.id} sin reason`);
    if (action.dueAt <= input.clock.simSeconds) {
      add("plazo_pasado", `acción ${action.id} vence en ${action.dueAt}`);
    }
    for (const dependency of action.dependsOn) {
      if (!actionIds.has(dependency)) {
        add("dependencia_inexistente", `acción ${action.id} depende de ${dependency}`);
      }
    }
  }

  for (const commitment of output.commitments) {
    if (commitment.status === "confirmado" && commitment.conditions.length > 0) {
      add("confirmado_con_condiciones", `compromiso ${commitment.id}`);
    }
  }

  const spaces = new Map(input.spaces.map((space) => [space.id, space]));
  const groups = new Map(input.guestGroups.map((group) => [group.id, group]));
  const perSpace = new Map<string, number>();
  const perGroup = new Map<string, number>();

  for (const assignment of output.assignments) {
    const space = spaces.get(assignment.spaceId);
    const group = groups.get(assignment.groupId);
    if (space === undefined) {
      add("espacio_inexistente", assignment.spaceId);
      continue;
    }
    if (group === undefined) {
      add("grupo_inexistente", assignment.groupId);
      continue;
    }
    if (space.status === "cerrado" || space.status === "descartado") {
      add("espacio_no_utilizable", `${assignment.spaceId} está ${space.status}`);
      continue;
    }
    if (NON_GUEST_KINDS.has(String(space.kind ?? ""))) {
      add("espacio_no_hospitalidad", `${assignment.spaceId} es ${String(space.kind)}`);
      continue;
    }
    perSpace.set(assignment.spaceId, (perSpace.get(assignment.spaceId) ?? 0) + assignment.count);
    perGroup.set(assignment.groupId, (perGroup.get(assignment.groupId) ?? 0) + assignment.count);
  }

  for (const [spaceId, assigned] of perSpace) {
    const capacity = spaces.get(spaceId)?.capacity;
    if (capacity !== undefined && assigned > capacity) {
      add("aforo_superado", `${spaceId}: ${assigned} > ${capacity}`);
    }
  }

  for (const [groupId, assigned] of perGroup) {
    const count = groups.get(groupId)?.count ?? 0;
    if (assigned > count) {
      add("grupo_sobreasignado", `${groupId}: ${assigned} > ${count}`);
    }
  }

  if (output.estimatedCost !== null && output.estimatedCost !== undefined &&
    (typeof output.estimatedCost !== "number" || !Number.isFinite(output.estimatedCost) || output.estimatedCost < 0)) {
    add("coste_invalido", "estimatedCost debe ser un importe no negativo o null");
  }
  if (output.decision === null && output.coordinatorStatus === "esperando_decision") {
    add("estado_sin_escalado", "esperando_decision sin decision operativa");
  }
  if (output.decision !== null && output.coordinatorStatus !== "esperando_decision") {
    add("estado_sin_esperar", `hay decision pero el estado es ${output.coordinatorStatus}`);
  }

  return issues;
}

// El target de verificación es un extra opcional de la demo (T35): si el modelo lo pone
// donde no toca, se retira la marca y el plan sigue siendo válido. Nunca tumba un replan.
function dropUnconfirmableTargets(output: CoordinatorOutput, input: CoordinatorInput): void {
  for (const action of output.actions) {
    const target: unknown = action.verificationTarget;
    if (target === undefined) continue;
    if (!isRecord(target)) {
      delete action.verificationTarget;
      continue;
    }
    const commitment = output.commitments.find((item) => item.id === target.commitmentId);
    const resource = input.spaces.find((item) => item.id === target.resourceId);
    const confirmable =
      action.area === "espacios" &&
      action.channel === "llamada" &&
      target.commitmentId === "c-pabB" &&
      target.resourceType === "space" &&
      target.resourceId === "pabellonB" &&
      commitment?.area === "espacios" &&
      commitment.title === "Reserva de Pabellón B · 450 plazas" &&
      resource?.zone === "sur";
    if (!confirmable) delete action.verificationTarget;
  }
}

export function validateOutput(
  value: unknown,
  input: CoordinatorInput,
): { output: CoordinatorOutput | null; issues: ValidationIssue[] } {
  const shapeIssues = checkShape(value);
  if (shapeIssues.length > 0) {
    return { output: null, issues: shapeIssues };
  }

  const output = value as CoordinatorOutput;
  if (output.estimatedCost === undefined) output.estimatedCost = output.decision?.cost ?? null;
  if (output.decision && output.decision.kind !== "operational") {
    output.decision = null;
    if (output.coordinatorStatus === "esperando_decision") output.coordinatorStatus = "replanificando";
  }
  output.operations = Array.isArray(output.operations) ? output.operations : [];
  output.queries = Array.isArray(output.queries) ? output.queries : [];
  output.done = output.done !== false;
  dropUnconfirmableTargets(output, input);
  const issues = checkInvariants(output, input);
  return { output: issues.length === 0 ? output : null, issues };
}

function parseJsonText(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    const extracted = extractJsonObject(text);
    if (extracted === null) throw new Error("json");
    return JSON.parse(extracted);
  }
}

export function parseOutput(
  text: string,
  input: CoordinatorInput,
): { output: CoordinatorOutput | null; issues: ValidationIssue[] } {
  try {
    return validateOutput(normalizePayload(parseJsonText(text)), input);
  } catch {
    return { output: null, issues: [{ code: "json_invalido", detail: "la respuesta no es JSON" }] };
  }
}
