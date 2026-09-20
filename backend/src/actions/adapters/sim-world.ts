import { complete, extractJsonObject, type LlmConfig } from "../../agents/coordinator/llm.js";
import type { CompleteFn } from "../../agents/coordinator/loop.js";
import type { SpecialistOutcome } from "../../contracts/api.js";
import type { CrisisStateDocument } from "../../domain/crisis-state.js";
import { mulberry32 } from "../../domain/random.js";
import type { DispatchTask } from "../../state/task-repository.js";

export interface SimReply {
  outcome: SpecialistOutcome;
  summary: string;
  conditions: string[];
  committedCost?: number;
  transcript: Array<{ who: "agente" | "humano"; text: string; at: number }>;
}

export interface SimWorldDeps {
  config?: LlmConfig;
  completeFn?: CompleteFn;
  timeoutMs?: number;
}

const OUTCOMES: SpecialistOutcome[] = ["accepted", "accepted_with_conditions", "rejected", "no_answer"];

export const COUNTERPART_SYSTEM_PROMPT = `Eres la persona al otro lado del teléfono durante una crisis de hospitalidad en MADRING, el circuito de Fórmula 1 de IFEMA Madrid: el responsable del recinto, el jefe de catering, el coordinador de transporte, el jefe de recepción o un invitado. Un agente de IA del centro de operaciones te llama con un objetivo. Tú NO eres el agente: eres el mundo, con tus propios problemas, tu agenda y tus límites.

REGLAS
- Decide con criterio real. Un recinto no regala plazas; un proveedor no llega antes de lo posible; un conductor no cruza Norte/Sur por el interior; nadie confirma lo que no controla.
- Responde con NÚMEROS y HORAS concretos (plazas, minutos, euros, hora de apertura). Si aceptas con condiciones, las condiciones son concretas y verificables.
- Puedes rechazar. Puedes no contestar (estás en el andén, sin cobertura, en otra llamada). Puedes aceptar menos de lo que te piden.
- Respeta el estado que se te da: si un lugar está cerrado o descartado, no lo ofreces. Si el objetivo pide algo imposible, dilo.
- Si aceptas una reserva firme sin condiciones y has acordado un precio concreto en la conversación, incluye committedCost con ese importe no negativo. No lo incluyas para presupuestos orientativos, rechazos, condiciones pendientes o costes desconocidos. El coste no es un límite ni requiere aprobación económica.
- La pista de la semilla te da tu humor de hoy (dispuesto, escéptico, saturado, ausente) y una cifra orientativa; úsala, pero manda la coherencia con el estado.
- Transcripción de 3 a 5 líneas, en español hablado, corta, sin markdown. El agente empieza.

FORMATO: responde solo con un objeto JSON, sin markdown:
{ "outcome": "accepted"|"accepted_with_conditions"|"rejected"|"no_answer", "summary": "una frase con el resultado y los números", "conditions": ["…"], "transcript": [ { "who": "agente"|"humano", "text": "…" } ] }`;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function records(state: CrisisStateDocument, field: string): Array<Record<string, unknown>> {
  const value = state[field];
  return Array.isArray(value) ? value.filter(isRecord) : [];
}

function hash(text: string): number {
  let h = 2166136261;
  for (const char of text) h = Math.imul(h ^ char.charCodeAt(0), 16777619);
  return h >>> 0;
}

export function moodFor(seed: number, task: DispatchTask): { mood: string; figure: number; lean: SimReply["outcome"] } {
  const random = mulberry32((seed * 31 + hash(task.id)) >>> 0);
  const moods = ["dispuesto", "escéptico", "saturado", "dispuesto", "ausente"];
  const mood = moods[Math.floor(random() * moods.length)]!;
  const figure = Math.round(random() * 100);
  const lean: SimReply["outcome"] = mood === "ausente" ? "no_answer" : mood === "escéptico" ? "rejected" : mood === "saturado" ? "accepted_with_conditions" : random() < 0.4 ? "accepted" : "accepted_with_conditions";
  return { mood, figure, lean };
}

export function buildCounterpartPrompt(task: DispatchTask, state: CrisisStateDocument, seed: number): string {
  const payload = isRecord(task.payload) ? task.payload : {};
  const { mood, figure } = moodFor(seed, task);
  const lines: string[] = [];
  lines.push(`HORA: ${Number(state.clock.simSeconds)} s desde medianoche (apertura ${String(state.clock.openingAt)}, carrera ${String(state.clock.raceAt)})`);
  lines.push(`ÁREA: ${task.area} · CANAL: ${task.kind}`);
  lines.push(`TÚ ERES: ${String(payload.counterpart ?? "la contraparte")}`);
  lines.push(`OBJETIVO DEL AGENTE: ${String(payload.objective ?? "")}`);
  lines.push("", "LUGARES");
  for (const space of records(state, "spaces")) {
    lines.push(`- ${String(space.id)} · ${String(space.kind ?? "")} · zona ${String(space.zone)} · ${String(space.status)} · cap ${String(space.capacity ?? "—")}${space.readyAt ? ` · listo ${String(space.readyAt)}` : ""}${space.note ? ` · ${String(space.note)}` : ""}`);
  }
  lines.push("", "VEHÍCULOS Y ENTREGAS");
  for (const shuttle of records(state, "shuttles")) lines.push(`- shuttle ${String(shuttle.id)} → ${String(shuttle.destinationId)} · ${String(shuttle.status)} · llega ${String(shuttle.arriveAt)}`);
  for (const delivery of records(state, "deliveries")) lines.push(`- entrega ${String(delivery.id)} → ${String(delivery.dockId)} · ${String(delivery.status)}`);
  for (const vehicle of records(state, "vehicles")) lines.push(`- ${String(vehicle.kind)} ${String(vehicle.id)} · ${String(vehicle.who)} → ${String(vehicle.destinationId)} · ${String(vehicle.status)}`);
  lines.push("", "GRUPOS");
  for (const group of records(state, "guestGroups")) lines.push(`- ${String(group.id)} · ${String(group.count)} personas · en ${String(group.assignedSpaceId ?? "sin ubicación")}${group.needs ? ` · ${String(group.needs)}` : ""}`);
  const budget: Record<string, unknown> = isRecord(state.budget) ? state.budget : {};
  lines.push("", `COSTES INFORMATIVOS: previsto ${String(budget.forecast ?? "sin estimar")} · comprometido ${String(budget.committed ?? 0)} €. No hay límite presupuestario ni aprobación económica; recoge el coste sin bloquear la recuperación del servicio.`);
  lines.push("", `PISTA: hoy estás ${mood}; cifra orientativa ${figure}.`);
  return lines.join("\n");
}

function parseReply(text: string, payload: Record<string, unknown>): SimReply | undefined {
  const json = extractJsonObject(text);
  if (!json) return undefined;
  let raw: unknown;
  try {
    raw = JSON.parse(json);
  } catch {
    return undefined;
  }
  if (!isRecord(raw)) return undefined;
  const outcome = OUTCOMES.includes(raw.outcome as SpecialistOutcome) ? (raw.outcome as SpecialistOutcome) : "accepted_with_conditions";
  const conditions = (Array.isArray(raw.conditions) ? raw.conditions : []).filter((item): item is string => typeof item === "string" && item.trim() !== "").slice(0, 4);
  let at = 4;
  const transcript = (Array.isArray(raw.transcript) ? raw.transcript : [])
    .filter(isRecord)
    .map((line) => {
      at += 6 + Math.min(20, Math.floor(String(line.text ?? "").length / 8));
      return { who: line.who === "humano" ? ("humano" as const) : ("agente" as const), text: String(line.text ?? "").trim(), at };
    })
    .filter((line) => line.text !== "")
    .slice(0, 6);
  const summary = typeof raw.summary === "string" && raw.summary.trim() !== "" ? raw.summary.trim() : `${String(payload.counterpart ?? "La contraparte")}: ${outcome}`;
  const committedCost = raw.committedCost;
  return {
    outcome, summary, conditions: outcome === "accepted_with_conditions" && conditions.length === 0 ? ["Confirmar por escrito antes de la apertura"] : conditions, transcript,
    ...(outcome === "accepted" && conditions.length === 0 && typeof committedCost === "number" && Number.isFinite(committedCost) && committedCost >= 0 ? { committedCost } : {}),
  };
}

const FALLBACK_CONDITIONS: Record<string, string[]> = {
  espacios: ["Reserva firmada antes de las 12:45", "Aforo validado por Seguridad en el sitio", "Acceso adaptado comprobado antes de entrar"],
  catering: ["Descarga en el muelle indicado, no en otro", "Pago del extra de reparto antes de salir", "Menús especiales confirmados por escrito"],
  transporte: ["Permiso de acceso Norte enviado al conductor", "Hora de recogida fija; no espera más de 10 minutos", "Un solo punto de embarque"],
  asistentes: ["Mensaje con hora y puerta concretas", "Repetir el aviso 15 minutos antes", "Punto de encuentro con personal visible"],
};

export function e2eReply(task: DispatchTask): SimReply {
  const payload = isRecord(task.payload) ? task.payload : {};
  const objective = String(payload.objective ?? "Confirmar la acción vigente");
  const counterpart = String(payload.counterpart ?? "La contraparte");
  const transcript = (answer: string): SimReply["transcript"] => [
    { who: "agente", text: objective, at: 2 },
    { who: "humano", text: answer, at: 5 },
  ];
  if (task.area === "espacios") {
    const summary = "Simulado: el recinto acepta la alternativa Sur solicitada, condicionada a la comprobación operativa antes de recibir invitados.";
    return { outcome: "accepted_with_conditions", summary, conditions: ["Comprobación operativa antes de la apertura"], transcript: transcript("Acepto la reserva solicitada en Sur; confirmaremos apertura operativa antes de recibir invitados.") };
  }
  if (task.area === "catering") {
    const summary = "Simulado: Catering confirma 600 servicios y descarga por el muelle alternativo operativo, coordinada con recepción.";
    return { outcome: "accepted_with_conditions", summary, conditions: ["Recepción disponible en el muelle operativo"], transcript: transcript("Confirmo 600 servicios por el muelle operativo cuando recepción dé paso a la descarga.") };
  }
  if (task.area === "transporte") {
    const summary = "Simulado: Transporte confirma BUS-01, BUS-02, BUS-03 y BUS-04 con destino y acceso Sur coherentes.";
    return { outcome: "accepted", summary, conditions: [], transcript: transcript("Confirmo los cuatro shuttles hacia Acceso Sur sin desvíos a Norte.") };
  }
  const summary = "Simulado: Recepción distribuye exactamente seis personas y segmenta los avisos vigentes a los grupos afectados.";
  return { outcome: "accepted", summary, conditions: [], transcript: transcript(`${counterpart}: seis personas distribuidas y mensajes segmentados enviados.`) };
}

export function fallbackReply(task: DispatchTask, seed: number): SimReply {
  const payload = isRecord(task.payload) ? task.payload : {};
  const { mood, figure, lean } = moodFor(seed, task);
  const counterpart = String(payload.counterpart ?? "La contraparte");
  const random = mulberry32((seed * 97 + hash(task.id) + 7) >>> 0);
  const pool = FALLBACK_CONDITIONS[task.area] ?? FALLBACK_CONDITIONS.espacios!;
  const condition = pool[Math.floor(random() * pool.length)]!;
  const objective = String(payload.objective ?? "lo que pides");
  if (lean === "no_answer") {
    return { outcome: "no_answer", summary: `${counterpart} no contesta (simulado, ${mood}).`, conditions: [], transcript: [{ who: "agente", text: objective, at: 5 }] };
  }
  if (lean === "rejected") {
    return {
      outcome: "rejected",
      summary: `Simulado: ${counterpart} no puede: "${objective}" no entra hoy (${mood}).`,
      conditions: [],
      transcript: [
        { who: "agente", text: objective, at: 5 },
        { who: "humano", text: `Lo siento, hoy no puedo. Tengo ${figure} cosas antes y esto no entra.`, at: 16 },
        { who: "agente", text: "Entendido. Buscamos otra opción y te aviso.", at: 24 },
      ],
    };
  }
  if (lean === "accepted") {
    return {
      outcome: "accepted",
      summary: `Simulado: ${counterpart} acepta sin condiciones.`,
      conditions: [],
      transcript: [
        { who: "agente", text: objective, at: 5 },
        { who: "humano", text: "Sí, sin problema. Lo dejo apuntado y os lo confirmo ahora mismo.", at: 15 },
      ],
    };
  }
  return {
    outcome: "accepted_with_conditions",
    summary: `Simulado: ${counterpart} acepta con una condición: ${condition.toLowerCase()}.`,
    conditions: [condition],
    transcript: [
      { who: "agente", text: objective, at: 5 },
      { who: "humano", text: `Puedo, pero con una condición: ${condition.toLowerCase()}. Si no, no me comprometo.`, at: 17 },
      { who: "agente", text: "De acuerdo, lo anoto como condición y lo verificamos.", at: 26 },
    ],
  };
}

export async function counterpartReply(task: DispatchTask, state: CrisisStateDocument, seed: number, deps: SimWorldDeps): Promise<SimReply> {
  const payload = isRecord(task.payload) ? task.payload : {};
  if (state.e2eMode === "production-isolated") return e2eReply(task);
  if (!deps.config && !deps.completeFn) return fallbackReply(task, seed);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), deps.timeoutMs ?? 45_000);
  try {
    const user = buildCounterpartPrompt(task, state, seed);
    const text = deps.completeFn
      ? await deps.completeFn(deps.config ?? ({} as LlmConfig), COUNTERPART_SYSTEM_PROMPT, user, { signal: controller.signal })
      : await complete(deps.config!, COUNTERPART_SYSTEM_PROMPT, user, { signal: controller.signal, temperature: 0.9, nonce: `${seed}-${task.id}` });
    return parseReply(text, payload) ?? fallbackReply(task, seed);
  } catch (error) {
    console.error("[sim] contraparte", error instanceof Error ? error.message : error);
    return fallbackReply(task, seed);
  } finally {
    clearTimeout(timer);
  }
}
