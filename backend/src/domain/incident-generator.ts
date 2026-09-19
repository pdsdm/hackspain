import { complete, extractJsonObject, type LlmConfig } from "../agents/coordinator/llm.js";
import type { CompleteFn } from "../agents/coordinator/loop.js";
import { liveCoordinatorInput } from "../agents/coordinator/scenario.js";
import type { CoordinatorOperation } from "../agents/coordinator/types.js";
import { normalizeOperation, operationReady } from "../agents/coordinator/validate.js";
import type { CrisisStateDocument } from "./crisis-state.js";
import type { IncidentArea } from "./incidents.js";
import { mulberry32 } from "./random.js";

export interface GeneratedIncident {
  id: string;
  area: IncidentArea;
  text: string;
  operations: CoordinatorOperation[];
}

export interface IncidentHint {
  area: IncidentArea;
  severity: "leve" | "media" | "grave";
  subject: string;
}

export interface GeneratorDeps {
  config?: LlmConfig;
  completeFn?: CompleteFn;
  timeoutMs?: number;
}

const AREAS: IncidentArea[] = ["espacios", "catering", "transporte", "asistentes"];
const SEVERITIES: IncidentHint["severity"][] = ["leve", "media", "media", "grave"];

export const WORLD_SYSTEM_PROMPT = `Eres el mundo real durante una crisis de hospitalidad en MADRING, el circuito de Fórmula 1 de IFEMA Madrid. No eres el coordinador: eres todo lo que le pasa alrededor.

Tu trabajo: inventar UNA incidencia nueva, concreta y verosímil, que todavía no haya ocurrido, sobre la entidad que se te indica o sobre algo cercano a ella. Debe ser algo que un centro de operaciones tendría que gestionar de verdad: un vehículo retenido, un acceso cerrado por seguridad, un proveedor que llega a otro muelle, un invitado con una necesidad nueva, una avería, un cambio de hora, una persona que no aparece, una queja, un pico de gente.

RESPONDE DIRECTO. Esto es una frase, no un problema que resolver: no compares alternativas ni deliberes antes de escribir. Coge la primera opción verosímil y redáctala.

REGLAS
- Usa solo ids que aparezcan en el estado. No inventes lugares, vehículos ni grupos.
- Los ids son para "operations". En "text" hablas como una persona: usa el NOMBRE que viene detrás del id en el estado («Pabellón Principal», «Puerta Sur · Feria de Madrid»), nunca el id crudo («principal», «g-shuttles», «esperaSur»). Un id en el texto es un fallo.
- No repitas ninguna incidencia de la lista YA OCURRIDO ni un giro estándar (cierre del Lounge, aforo de B a 400, retraso de shuttle, retraso de entrega, muelle bloqueado, proveedor mudo, rechazo de gasto, rechazo de dividir).
- La gravedad indicada manda: leve no cierra nada; media retiene o retrasa; grave cierra un lugar o deja a personas sin ubicación.
- Norte y Sur no se conectan por el interior. Norte exige pase Norte.
- Esto es una crisis de HOSPITALIDAD, no de protección civil: nada de heridos, intoxicados, incendios, fugas de gas ni evacuaciones médicas. Lo que se rompe son espacios, horarios, comidas, transporte y accesos.
- No inventes la hora. Si citas una, que cuadre con HORA.
- Entre 1 y 3 operaciones, NUNCA cero: una incidencia sin operations no cambia el mundo, solo ensucia la cronología. Y solo de estas: set_place {id,status,note?,readyAt?,capacity?}, set_gate {id,status?,waiting?,arrivalsPerMin?}, redirect_vehicle {id,destinationId,status?,note?,delayMin?}, reroute_shuttle {id,destinationId,status?,note?,delayMin?}, redirect_delivery {id,dockId,status?,note?,delayMin?}, set_group {id,where?,needs?}. El estado de un lugar solo puede ser cerrado, pendiente, inactivo o descartado (nunca confirmado).
- Eres el mundo, no el operador: cuenta HECHOS que ya han pasado ("Bomberos precinta el paddock", "TX-02 averiado bloquea el Acceso Sur"). Nunca escribas decisiones ni planes ("desvío", "cierro", "reubico", "pido"): eso lo decide el coordinador después. Las operations describen el daño ya hecho, no la solución.
- Texto en español, una o dos frases, con nombres y números concretos, como lo diría alguien por radio.

FORMATO: responde solo con un objeto JSON, sin markdown:
{ "text": "…", "area": "espacios"|"catering"|"transporte"|"asistentes", "operations": [ … ] }`;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function records(state: CrisisStateDocument, field: string): Array<Record<string, unknown>> {
  const value = state[field];
  return Array.isArray(value) ? value.filter(isRecord) : [];
}

export function hintFor(state: CrisisStateDocument, seed: number, index: number): IncidentHint {
  const random = mulberry32((seed * 7919 + index * 104729) >>> 0);
  const area = AREAS[Math.floor(random() * AREAS.length)]!;
  const severity = SEVERITIES[Math.floor(random() * SEVERITIES.length)]!;
  const pool: string[] = [];
  const spaces = records(state, "spaces");
  const vehicles = records(state, "vehicles").filter((item) => item.status !== "llegado");
  const shuttles = records(state, "shuttles").filter((item) => item.status !== "llegado");
  const deliveries = records(state, "deliveries").filter((item) => item.status !== "entregada");
  const groups = records(state, "guestGroups");
  const gates = records(state, "gates");
  if (area === "espacios") pool.push(...spaces.map((item) => `lugar ${String(item.id)}`));
  if (area === "catering") pool.push(...deliveries.map((item) => `entrega ${String(item.id)}`), ...spaces.filter((item) => item.kind === "muelle").map((item) => `lugar ${String(item.id)}`));
  if (area === "transporte") pool.push(...vehicles.map((item) => `vehículo ${String(item.id)}`), ...shuttles.map((item) => `shuttle ${String(item.id)}`));
  if (area === "asistentes") pool.push(...groups.map((item) => `grupo ${String(item.id)}`), ...gates.map((item) => `puerta ${String(item.id)}`));
  if (pool.length === 0) pool.push(...spaces.map((item) => `lugar ${String(item.id)}`));
  const subject = pool[Math.floor(random() * pool.length)] ?? "lugar principal";
  return { area, severity, subject };
}

export function buildWorldPrompt(state: CrisisStateDocument, hint: IncidentHint, happened: string[]): string {
  const input = liveCoordinatorInput(state);
  const lines: string[] = [];
  lines.push(`HORA: ${Number(state.clock.simSeconds)} s desde medianoche (apertura ${String(state.clock.openingAt)}, carrera ${String(state.clock.raceAt)})`);
  // El id va primero porque las operations lo necesitan, pero el NOMBRE tiene que estar:
  // sin él el modelo no puede cumplir la regla de no soltar ids en el texto, y salían
  // frases como «los 180 de g-shuttles quedan fuera».
  lines.push("", "LUGARES  (id · nombre · …)");
  for (const space of input.spaces) {
    lines.push(`- ${space.id} · «${space.name}» · ${String(space.kind ?? "")} · zona ${space.zone} · ${space.status} · cap ${String(space.capacity ?? "—")}${space.note ? ` · ${space.note}` : ""}`);
  }
  lines.push("", "PUERTAS  (id · nombre · …)");
  const gateNames = new Map(records(state, "gates").map((gate) => [String(gate.id), String(gate.name ?? gate.id)]));
  for (const gate of input.gates ?? []) {
    lines.push(`- ${gate.id} · «${gateNames.get(gate.id) ?? gate.id}» · ${gate.status} · cola ${gate.waiting}`);
  }
  lines.push("", "VEHÍCULOS");
  for (const shuttle of input.shuttles ?? []) lines.push(`- shuttle ${shuttle.id} · ${shuttle.origin} → ${shuttle.destinationId} · ${shuttle.status} · ${shuttle.passengers} pax`);
  for (const delivery of input.deliveries ?? []) lines.push(`- entrega ${delivery.id} · muelle ${delivery.dockId} · ${delivery.status}`);
  for (const vehicle of input.vehicles ?? []) lines.push(`- ${vehicle.kind} ${vehicle.id} · ${vehicle.who} (${vehicle.count}) · ${vehicle.from} → ${vehicle.destinationId} · ${vehicle.status}`);
  lines.push("", "GRUPOS DE INVITADOS  (id · nombre · …)");
  for (const group of input.guestGroups) lines.push(`- ${group.id} · «${group.name}» · ${group.count} personas · en ${group.assignedSpaceId ?? "sin ubicación"}${group.needs ? ` · ${group.needs}` : ""}`);
  lines.push("", "YA OCURRIDO");
  if (happened.length === 0) lines.push("- nada todavía");
  for (const text of happened.slice(-12)) lines.push(`- ${text}`);
  lines.push("", `AHORA: incidencia de área ${hint.area}, gravedad ${hint.severity}, sobre ${hint.subject}.`);
  return lines.join("\n");
}

const VEHICLE_STATUSES = new Set(["en_ruta", "retenido", "desviado", "llegado"]);

function inferOp(raw: unknown, state: CrisisStateDocument): unknown {
  if (!isRecord(raw)) return raw;
  const next: Record<string, unknown> = { ...raw };
  const op = [next.op, next.type, next.operation, next.action, next.kind].find((value) => typeof value === "string" && value.trim() !== "");
  if (typeof op === "string") next.op = op.trim().toLowerCase().replace(/[\s-]+/g, "_");
  const id = [next.id, next.placeId, next.vehicleId, next.gateId, next.groupId, next.deliveryId].find((value) => typeof value === "string");
  const has = (field: string) => records(state, field).some((item) => item.id === id);
  if (typeof next.op !== "string" || next.op === "") {
    if (has("vehicles") && (typeof next.destinationId === "string" || typeof next.status === "string")) next.op = "redirect_vehicle";
    else if (has("shuttles")) next.op = "reroute_shuttle";
    else if (has("deliveries")) next.op = "redirect_delivery";
    else if (has("gates")) next.op = "set_gate";
    else if (has("guestGroups")) next.op = "set_group";
    else if (has("spaces")) next.op = "set_place";
  }
  if (next.op === "redirect_vehicle" || next.op === "redirect_delivery") {
    if (next.op === "redirect_vehicle" && has("deliveries")) next.op = "redirect_delivery";
    if (next.op === "redirect_delivery" && has("vehicles")) next.op = "redirect_vehicle";
  }
  if (next.op === "redirect_vehicle") {
    if (typeof next.destinationId !== "string") {
      const vehicle = records(state, "vehicles").find((item) => item.id === id);
      if (vehicle) next.destinationId = vehicle.destinationId;
    }
    if (typeof next.status === "string" && !VEHICLE_STATUSES.has(next.status)) next.status = /reten|bloq|aver|parad|espera/i.test(next.status) ? "retenido" : "desviado";
    if (next.status === "en_ruta" || next.status === "llegado") next.status = "desviado";
  }
  if (next.op === "set_place" && typeof next.status !== "string") next.status = "pendiente";
  return next;
}

function parseIncident(text: string, index: number, hint: IncidentHint, state: CrisisStateDocument): GeneratedIncident | undefined {
  const json = extractJsonObject(text);
  if (!json) return undefined;
  let raw: unknown;
  try {
    raw = JSON.parse(json);
  } catch {
    return undefined;
  }
  if (!isRecord(raw) || typeof raw.text !== "string" || raw.text.trim() === "") return undefined;
  const area = AREAS.includes(raw.area as IncidentArea) ? (raw.area as IncidentArea) : hint.area;
  const operations = (Array.isArray(raw.operations) ? raw.operations : [])
    .map((operation) => normalizeOperation(inferOp(operation, state)))
    .filter((operation) => operationReady(operation))
    .filter((operation) => {
      const op = String((operation as { op: string }).op);
      return ["set_place", "set_gate", "redirect_vehicle", "reroute_shuttle", "redirect_delivery", "set_group"].includes(op);
    })
    .map((operation) => {
      const next = operation as Record<string, unknown>;
      if (next.op === "set_place" && next.status === "confirmado") next.status = "pendiente";
      return next as unknown as CoordinatorOperation;
    })
    .slice(0, 3);
  return { id: `gen-${index}`, area, text: raw.text.trim(), operations };
}

export async function generateIncident(
  state: CrisisStateDocument,
  deps: GeneratorDeps,
  seed: number,
  index: number,
  happened: string[],
): Promise<GeneratedIncident | undefined> {
  if (!deps.config && !deps.completeFn) return undefined;
  const hint = hintFor(state, seed, index);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), deps.timeoutMs ?? 45_000);
  try {
    const completeFn = deps.completeFn;
    const text = completeFn
      ? await completeFn(deps.config ?? ({} as LlmConfig), WORLD_SYSTEM_PROMPT, buildWorldPrompt(state, hint, happened), { signal: controller.signal })
      : await complete(deps.config!, WORLD_SYSTEM_PROMPT, buildWorldPrompt(state, hint, happened), {
          signal: controller.signal,
          temperature: 0.9,
          nonce: `${seed}-${index}`,
        });
    return parseIncident(text, index, hint, state);
  } catch (error) {
    console.error("[live] generador", error instanceof Error ? error.message : error);
    return undefined;
  } finally {
    clearTimeout(timer);
  }
}
