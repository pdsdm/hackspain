import { randomUUID } from "node:crypto";

import { ContractError, type HappyRobotIncidentId, type Intervention, type TwistId } from "../contracts/api.js";
import type { InitialFixture } from "../config.js";
import type { CrisisStateDocument } from "./crisis-state.js";
import { findIncident } from "./incidents.js";
import { createSimulationSeed } from "./random.js";
import type { StateRepository } from "../state/state-repository.js";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function records(state: CrisisStateDocument, field: string): Array<Record<string, unknown>> {
  const value = state[field];
  return Array.isArray(value) ? value.filter(isRecord) : [];
}

function findById(values: Array<Record<string, unknown>>, id: string) {
  return values.find((value) => value.id === id);
}

export interface IncidentProvenance {
  channel: "call" | "sms";
  actor: string;
  eventId: string;
  sessionId: string;
}

function addEvent(state: CrisisStateDocument, kind: string, text: string, area?: string, provenance?: IncidentProvenance): void {
  const events = records(state, "events");
  events.push({
    id: `event-${randomUUID()}`,
    time: state.clock.simSeconds,
    kind,
    text,
    ...(area ? { area } : {}),
    ...(provenance ? {
      channel: provenance.channel,
      actor: provenance.actor,
      provenance: { source: "happyrobot", eventId: provenance.eventId, sessionId: provenance.sessionId },
    } : {}),
  });
  state.events = events.slice(-80);
}

function invalidate(state: CrisisStateDocument, id: string, reason: string): void {
  const commitment = findById(state.commitments, id);
  if (!commitment || commitment.status === "invalidado" || commitment.status === "completado") return;
  commitment.status = "invalidado";
  commitment.note = reason;
  commitment.updatedAt = state.clock.simSeconds;
}

function twists(state: CrisisStateDocument): string[] {
  return Array.isArray(state.twistsApplied)
    ? state.twistsApplied.filter((value): value is string => typeof value === "string")
    : [];
}

export function applyTwistEffect(state: CrisisStateDocument, twist: TwistId, provenance?: IncidentProvenance): void {
  const spaces = records(state, "spaces");
  const shuttles = records(state, "shuttles");
  const deliveries = records(state, "deliveries");
  const agents = records(state, "agents");
  const groups = records(state, "guestGroups");

  switch (twist) {
    case "lounge_unavailable": {
      const lounge = findById(spaces, "loungeSur");
      if (lounge) Object.assign(lounge, { status: "descartado", note: "Recinto retira la disponibilidad" });
      const wait = findById(spaces, "esperaSur");
      if (wait) wait.status = "inactivo";
      invalidate(state, "c-lounge", "Recinto retira el Lounge Sur");
      invalidate(state, "c-espera", "La espera ya no desemboca en un espacio confirmado");
      const group = findById(groups, "g-propios");
      if (group && typeof group.confirmedCount === "number") group.confirmedCount = Math.max(0, group.confirmedCount - 150);
      const north = findById(spaces, "norteC");
      if (north) north.status = "propuesto";
      state.planVersion += 1;
      addEvent(state, "incidencia", "El Lounge Sur deja de estar disponible", "espacios");
      break;
    }
    case "pabellon_b_400": {
      const pavilion = findById(spaces, "pabellonB");
      if (pavilion) Object.assign(pavilion, { capacity: 400, note: "Aforo revisado de 450 a 400" });
      invalidate(state, "c-pabB", "El aforo confirmado cambia a 400");
      let remaining = 550;
      for (const group of groups) {
        if (typeof group.confirmedCount !== "number" || typeof group.count !== "number") continue;
        const confirmed = Math.min(group.count, remaining);
        group.confirmedCount = confirmed;
        remaining -= confirmed;
      }
      state.planVersion += 1;
      addEvent(state, "incidencia", "Pabellón B reduce su aforo a 400", "espacios");
      break;
    }
    case "shuttle_delay": {
      const shuttle = findById(shuttles, "BUS-02");
      if (shuttle) Object.assign(shuttle, { delayMin: Number(shuttle.delayMin ?? 0) + 20, arriveAt: Number(shuttle.arriveAt ?? 0) + 1200, status: "retrasado" });
      addEvent(state, "incidencia", "BUS-02 se retrasa 20 minutos", "transporte");
      break;
    }
    case "delivery_delay": {
      const delivery = findById(deliveries, "CAT-02");
      if (delivery) Object.assign(delivery, { arriveAt: Number(delivery.arriveAt ?? 0) + 1500, status: "retrasada", note: "Retraso de 25 minutos" });
      addEvent(state, "incidencia", "CAT-02 se retrasa 25 minutos", "catering");
      break;
    }
    case "dock_blocked": {
      const dock = findById(spaces, "muelleEste");
      if (dock) Object.assign(dock, { status: "cerrado", note: "Bloqueado por un vehículo de TV" });
      invalidate(state, "c-muelle", "Muelle Este bloqueado");
      for (const delivery of deliveries) if (delivery.status !== "entregada") delivery.status = "bloqueada";
      addEvent(state, "incidencia", "Muelle Este Sur bloqueado", "catering", provenance);
      break;
    }
    case "provider_silent": {
      const agent = findById(agents, "transporte");
      if (agent) Object.assign(agent, { status: "incidencia", lastResult: "El transportista no responde" });
      addEvent(state, "fallo", "El transportista no responde", "transporte");
      break;
    }
    case "reject_split": {
      for (const decision of state.decisions) {
        if (decision.status === "pendiente") decision.status = "rechazada";
      }
      state.waitingForDecision = null;
      for (const id of ["pabellonB", "loungeSur"]) {
        const space = findById(spaces, id);
        if (space) space.status = "descartado";
      }
      const north = findById(spaces, "norteC");
      if (north) north.status = "propuesto";
      for (const id of ["c-pabB", "c-lounge", "c-espera"]) invalidate(state, id, "El responsable rechaza dividir la hospitalidad");
      state.planVersion += 1;
      addEvent(state, "intervencion", "Se rechaza dividir la hospitalidad; se evalúa Norte C");
      break;
    }
    case "guest_need": {
      const group = findById(groups, "g-propios");
      if (group) group.needs = "13 accesibilidad · 38 dieta";
      addEvent(state, "incidencia", "Una invitada comunica una necesidad de accesibilidad no registrada", "asistentes");
      break;
    }
  }
  state.twistsApplied = [...twists(state), twist];
  state.coordinatorStatus = "replanificando";
  state.resolved = false;
}

export class ControlService {
  constructor(
    private readonly states: StateRepository,
    private readonly simSeed?: number,
    private readonly clockSpeed = 1,
  ) {}

  applyIntervention(intervention: Intervention): void {
    const run = this.states.ensureActiveRun();
    const state = structuredClone(run.state);
    const agents = records(state, "agents");
    switch (intervention.type) {
      case "pause":
        state.agentsPaused = true;
        state.coordinatorStatus = "pausado";
        for (const agent of agents) agent.status = "pausado";
        addEvent(state, "intervencion", "El responsable pausa nuevas acciones de los agentes");
        break;
      case "resume":
        state.agentsPaused = false;
        state.coordinatorStatus = state.waitingForDecision ? "esperando_decision" : "replanificando";
        for (const agent of agents) agent.status = "activo";
        addEvent(state, "intervencion", "El responsable reanuda a los agentes");
        break;
      case "set_constraint": {
        const text = intervention.payload!.text!;
        const constraints = Array.isArray(state.constraints) ? state.constraints.filter((value): value is string => typeof value === "string") : [];
        if (!constraints.includes(text)) constraints.push(text);
        state.constraints = constraints;
        addEvent(state, "intervencion", `Restricción fijada: «${text}»`);
        break;
      }
      case "take_call": {
        const callId = intervention.payload!.callId!;
        const call = findById(records(state, "calls"), callId);
        if (!call) throw new ContractError(`Call not found: ${callId}`, 404);
        if (call.status !== "en_curso") throw new ContractError(`Call is not active: ${callId}`, 409);
        const transcript = Array.isArray(call.transcript) ? call.transcript : [];
        transcript.push({ who: "humano", text: `[Responsable de operaciones toma la conversación con ${String(call.counterpart ?? "el interlocutor")}]`, at: Math.max(0, state.clock.simSeconds - Number(call.startedAt ?? state.clock.simSeconds)) });
        call.transcript = transcript;
        call.endsAfter = Number(call.endsAfter ?? 0) + 30;
        addEvent(state, "intervencion", `El responsable toma la llamada ${callId}`);
        break;
      }
      case "approve_spend":
      case "reject_spend":
        throw new ContractError("Economic approvals are disabled", 409);
      case "reject_split":
        if (!twists(state).includes("reject_split")) applyTwistEffect(state, "reject_split");
        break;
      case "approve_plan":
      case "reject_plan": {
        const decisionId = intervention.payload!.decisionId!;
        const decision = findById(state.decisions, decisionId);
        if (!decision) throw new ContractError(`Decision not found: ${decisionId}`, 404);
        if (decision.kind !== "operational" || decision.status !== "pendiente" || state.waitingForDecision !== decisionId) {
          throw new ContractError(`Decision is not a pending operational decision: ${decisionId}`, 409);
        }
        const approved = intervention.type === "approve_plan";
        decision.status = approved ? "aprobada" : "rechazada";
        if (!approved) state.rejectedPlanVersion = state.planVersion;
        state.waitingForDecision = null;
        addEvent(state, "intervencion", `El responsable ${approved ? "acepta" : "rechaza"} ${String(decision.title)}`);
        state.coordinatorStatus = "replanificando";
        break;
      }
    }
    this.states.saveState(run.id, state);
  }

  applyTwist(twist: TwistId): void {
    const run = this.states.ensureActiveRun();
    if (twists(run.state).includes(twist)) return;
    const state = structuredClone(run.state);
    applyTwistEffect(state, twist);
    this.states.saveState(run.id, state);
  }

  applyHappyRobotIncident(incidentId: HappyRobotIncidentId, summary: string, provenance: IncidentProvenance): boolean {
    const run = this.states.ensureActiveRun();
    if (incidentId === "inbox_batch") {
      const state = structuredClone(run.state);
      state.inboxTriage = { eventId: provenance.eventId, received: 10, relevant: 1, ignored: 9, status: "processing" };
      addEvent(state, "info", summary, "espacios", provenance);
      this.states.saveState(run.id, state);
      return true;
    }
    if (incidentId === "dock_blocked") {
      if (twists(run.state).includes(incidentId)) return false;
      const state = structuredClone(run.state);
      applyTwistEffect(state, incidentId, provenance);
      this.states.saveState(run.id, state);
      return true;
    }

    const principal = findById(records(run.state, "spaces"), "principal");
    if (principal?.status === "cerrado") return false;
    const state = structuredClone(run.state);
    const nextVersion = state.planVersion + 1;
    const space = findById(records(state, "spaces"), "principal");
    if (space) Object.assign(space, { status: "cerrado", note: "Avería de agua · sin hora de reapertura" });
    for (const id of ["c-principal", "c-entrega1", "c-entrega2"]) {
      invalidate(state, id, id === "c-principal" ? "Pabellón cerrado por avería" : "El plan original queda invalidado");
      const commitment = findById(state.commitments, id);
      if (commitment?.status === "invalidado") commitment.planVersion = nextVersion;
    }
    for (const group of records(state, "guestGroups")) {
      if (group.assignedSpaceId !== "principal") continue;
      group.confirmedCount = 0;
      group.informedCount = 0;
      group.acceptedCount = 0;
      delete group.assignedSpaceId;
    }
    state.planVersion = nextVersion;
    state.waitingForDecision = null;
    state.coordinatorStatus = "replanificando";
    state.resolved = false;
    delete state.closureSummary;
    addEvent(state, "incidencia", summary, "espacios", provenance);
    this.states.saveState(run.id, state);
    return true;
  }

  setLive(enabled: boolean, seed?: number, mode?: "open" | "catalog"): { live: boolean; seed: number; mode: "open" | "catalog" } {
    const run = this.states.ensureActiveRun();
    const state = structuredClone(run.state);
    const current = Number(state.clock.liveSeed ?? 0);
    const nextSeed = seed ?? (current > 0 ? current : 1 + Math.floor(Math.random() * 99_999));
    state.clock.live = enabled;
    state.clock.liveSeed = nextSeed;
    if (mode) state.clock.liveMode = mode;
    const liveMode: "open" | "catalog" = state.clock.liveMode === "catalog" ? "catalog" : "open";
    if (enabled && (seed !== undefined || !state.clock.liveLastAt)) {
      state.clock.liveIndex = 0;
      state.clock.liveLastAt = 0;
    }
    addEvent(state, "info", enabled ? `Modo vivo activado · semilla ${nextSeed} · ${liveMode === "open" ? "incidencias generadas" : "catálogo"}` : "Modo vivo desactivado");
    this.states.saveState(run.id, state);
    return { live: enabled, seed: nextSeed, mode: liveMode };
  }

  setClock(speed?: number, paused?: boolean): { speed: number; paused: boolean } {
    const run = this.states.ensureActiveRun();
    const state = structuredClone(run.state);
    if (speed !== undefined) state.clock.speed = speed;
    if (paused !== undefined) state.clock.paused = paused;
    this.states.saveState(run.id, state);
    return { speed: Number(state.clock.speed ?? this.clockSpeed), paused: Boolean(state.clock.paused) };
  }

  applyIncident(id: string): void {
    const incident = findIncident(id);
    if (!incident) throw new ContractError(`Unknown incident: ${id}`, 400);
    const run = this.states.ensureActiveRun();
    const state = structuredClone(run.state);
    incident.apply(state);
    addEvent(state, "incidencia", incident.text, incident.area);
    const fired = Array.isArray(state.incidentsApplied) ? state.incidentsApplied.filter((value): value is string => typeof value === "string") : [];
    state.incidentsApplied = [...fired, id];
    const texts = Array.isArray(state.incidentTexts) ? state.incidentTexts.filter((value): value is string => typeof value === "string") : [];
    state.incidentTexts = [...texts, incident.text].slice(-20);
    this.states.saveState(run.id, state);
  }

  applyGateSaturation(gateId: string): void {
    const run = this.states.ensureActiveRun();
    const state = structuredClone(run.state);
    const gates = records(state, "gates");
    const gate = findById(gates, gateId);
    if (!gate) throw new ContractError(`Unknown gate: ${gateId}`, 400);
    const closed = gates.find((item) => item.zone === gate.zone && item.id !== gate.id && item.status === "cerrado");
    if (closed) {
      closed.status = "abierto";
      addEvent(state, "accion", `Regla: abre ${String(closed.name ?? closed.id)} para descargar ${String(gate.name ?? gate.id)}`, "asistentes");
    } else {
      addEvent(state, "info", `Sin acceso cerrado en zona ${String(gate.zone)}; el coordinador decide cómo descargar ${String(gate.name ?? gate.id)}`, "asistentes");
    }
    state.gates = gates;
    this.states.saveState(run.id, state);
  }

  reset(fixture?: InitialFixture): { runId: string; planVersion: number } {
    // El modo vivo se configura al arrancar el servidor y vive en el reloj, que el
    // fixture sobrescribe. Sin arrastrarlo, «Reiniciar simulación» dejaba un mundo
    // quieto: el reloj corría pero no volvía a pasar nada.
    const previous = this.states.ensureActiveRun().state.clock;
    const live = previous.live === true;
    const seed = Number(previous.liveSeed ?? 0);
    const mode = previous.liveMode === "catalog" ? "catalog" : "open";

    const run = this.states.reset(fixture);
    const state = structuredClone(run.state);
    state.clock.speed = this.clockSpeed;
    state.clock.seed = this.simSeed ?? createSimulationSeed();
    delete state.clock.attendanceSeed;
    if (live) {
      state.clock.live = true;
      state.clock.liveSeed = seed > 0 ? seed : 1 + Math.floor(Math.random() * 99_999);
      state.clock.liveMode = mode;
      // La secuencia empieza de cero: mundo nuevo, incidencias desde la primera.
      state.clock.liveIndex = 0;
      state.clock.liveLastAt = 0;
      addEvent(state, "info", `Modo vivo mantenido tras el reinicio · semilla ${state.clock.liveSeed}`);
    }
    this.states.saveState(run.id, state);
    return { runId: run.id, planVersion: state.planVersion };
  }
}
