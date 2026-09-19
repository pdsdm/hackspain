import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";

import type { CoordinatorOperation, CoordinatorOutput } from "../agents/coordinator/types.js";
import type { CoordinatorProposalEnvelope } from "../contracts/api.js";
import type { CrisisStateDocument } from "./crisis-state.js";
import type { GuestAllocation } from "./plan-rules.js";
import type { WorkflowService } from "./workflow-service.js";
import type { StateRepository } from "../state/state-repository.js";
import type { TaskRepository } from "../state/task-repository.js";
import {
  etaFor,
  originStopId,
  placeById,
  routeTo,
  type WorldModel,
} from "../world/world.js";

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

const SEED_URL = new URL("../../fixtures/madring/seed.json", import.meta.url);
const seedGuests = (JSON.parse(readFileSync(SEED_URL, "utf8")) as {
  guests: Array<{ id: string; groupId: string }>;
}).guests;

export function hasNorthAccess(state: CrisisStateDocument): boolean {
  const constraints = Array.isArray(state.constraints)
    ? state.constraints.filter((value): value is string => typeof value === "string")
    : [];
  if (constraints.some((text) => /norte/i.test(text) && /acceso|permiso|confirm/i.test(text))) {
    return true;
  }
  return records(state, "commitments").some((commitment) => {
    const title = String(commitment.title ?? "");
    return /norte/i.test(title) && commitment.status === "confirmado";
  });
}

const SPACE_STATUSES = new Set(["cerrado", "operativo", "propuesto", "pendiente", "confirmado", "descartado", "inactivo"]);

function coerceSpaceStatus(status: string): string {
  if (SPACE_STATUSES.has(status)) return status;
  if (/cerr|bloq|cort|inutil|caid|sin acceso/i.test(status)) return "cerrado";
  if (/descart/i.test(status)) return "descartado";
  if (/confirm/i.test(status)) return "confirmado";
  if (/inactiv|sin usar/i.test(status)) return "inactivo";
  return "pendiente";
}

export function applyOperation(
  draft: CrisisStateDocument,
  world: WorldModel,
  operation: CoordinatorOperation,
  openTaskIds: ReadonlySet<string>,
): { ok: true; cancelTaskId?: string } | { ok: false; error: string } {
  const now = Number(draft.clock.simSeconds);
  switch (operation.op) {
    case "set_place": {
      if (operation.status === "confirmado") {
        return { ok: false, error: `set_place ${operation.id}: confirmado solo lo aplica un resultado de llamada` };
      }
      const space = draft.spaces.find((item) => item.id === operation.id);
      if (!space) return { ok: false, error: `set_place: lugar desconocido ${operation.id}` };
      space.status = coerceSpaceStatus(operation.status);
      if (operation.note !== undefined) space.note = operation.note;
      if (operation.capacity !== undefined) space.capacity = operation.capacity;
      if (operation.readyAt !== undefined) space.readyAt = operation.readyAt;
      return { ok: true };
    }
    case "set_gate": {
      const gate = findById(records(draft, "gates"), operation.id);
      if (!gate) return { ok: false, error: `set_gate: puerta desconocida ${operation.id}` };
      if (operation.status !== undefined) gate.status = operation.status;
      if (operation.arrivalsPerMin !== undefined) gate.arrivalsPerMin = operation.arrivalsPerMin;
      if (operation.throughputPerMin !== undefined) gate.throughputPerMin = operation.throughputPerMin;
      if (operation.waiting !== undefined) gate.waiting = operation.waiting;
      draft.gates = records(draft, "gates");
      return { ok: true };
    }
    case "reroute_shuttle": {
      const shuttle = findById(records(draft, "shuttles"), operation.id);
      if (!shuttle) return { ok: false, error: `reroute_shuttle: bus desconocido ${operation.id}` };
      const destination = placeById(world, operation.destinationId);
      if (!destination) return { ok: false, error: `reroute_shuttle: destino desconocido ${operation.destinationId}` };
      if (destination.zone === "norte" && !hasNorthAccess(draft)) {
        return { ok: false, error: `reroute_shuttle ${operation.id}: Norte sin acceso confirmado` };
      }
      if (operation.delayMin !== undefined) shuttle.delayMin = operation.delayMin;
      const estimate = etaFor(
        world,
        {
          origin: String(shuttle.origin ?? ""),
          destinationId: String(shuttle.destinationId ?? ""),
          departAt: Number(shuttle.departAt ?? now),
          delayMin: Number(shuttle.delayMin ?? 0),
        },
        operation.destinationId,
        now,
      );
      shuttle.destinationId = operation.destinationId;
      shuttle.route = estimate.route;
      shuttle.arriveAt = estimate.arriveAt;
      shuttle.status = operation.status ?? "reasignado";
      if (operation.note !== undefined) shuttle.note = operation.note;
      draft.shuttles = records(draft, "shuttles");
      return { ok: true };
    }
    case "redirect_delivery": {
      const delivery = findById(records(draft, "deliveries"), operation.id);
      if (!delivery) return { ok: false, error: `redirect_delivery: entrega desconocida ${operation.id}` };
      const dock = findById(records(draft, "spaces"), operation.dockId);
      if (!dock) return { ok: false, error: `redirect_delivery: muelle desconocido ${operation.dockId}` };
      if (dock.status === "cerrado" || dock.status === "descartado") {
        return { ok: false, error: `redirect_delivery ${operation.id}: muelle ${operation.dockId} ${String(dock.status)}` };
      }
      if (operation.delayMin !== undefined) delivery.delayMin = operation.delayMin;
      const fromId = "coslada";
      const estimate = routeTo(world, fromId, operation.dockId);
      delivery.dockId = operation.dockId;
      delivery.route = estimate.route;
      delivery.arriveAt = Math.max(now, Number(delivery.departAt ?? now)) + estimate.minutes * 60 + Number(operation.delayMin ?? 0) * 60;
      delivery.status = operation.status ?? "programada";
      if (operation.note !== undefined) delivery.note = operation.note;
      draft.deliveries = records(draft, "deliveries");
      return { ok: true };
    }
    case "redirect_vehicle": {
      const vehicle = findById(records(draft, "vehicles"), operation.id);
      if (!vehicle) return { ok: false, error: `redirect_vehicle: vehículo desconocido ${operation.id}` };
      const destination = findById(records(draft, "spaces"), operation.destinationId);
      if (!destination) return { ok: false, error: `redirect_vehicle: destino desconocido ${operation.destinationId}` };
      if (destination.status === "cerrado" || destination.status === "descartado") {
        return { ok: false, error: `redirect_vehicle ${operation.id}: destino ${operation.destinationId} ${String(destination.status)}` };
      }
      if (operation.delayMin !== undefined) vehicle.delayMin = operation.delayMin;
      const estimate = routeTo(world, String(vehicle.from ?? ""), operation.destinationId);
      vehicle.destinationId = operation.destinationId;
      vehicle.route = estimate.route;
      vehicle.arriveAt = Math.max(now, Number(vehicle.departAt ?? now)) + estimate.minutes * 60 + Number(vehicle.delayMin ?? 0) * 60;
      vehicle.status = operation.status ?? "desviado";
      if (operation.note !== undefined) vehicle.note = operation.note;
      draft.vehicles = records(draft, "vehicles");
      return { ok: true };
    }
    case "spawn_vehicle": {
      const fromId = originStopId(operation.from, operation.from);
      const origin = placeById(world, fromId);
      if (!origin) return { ok: false, error: `spawn_vehicle: origen desconocido ${operation.from}` };
      const destination = findById(records(draft, "spaces"), operation.destinationId);
      if (!destination) return { ok: false, error: `spawn_vehicle: destino desconocido ${operation.destinationId}` };
      if (destination.status === "cerrado" || destination.status === "descartado") {
        return { ok: false, error: `spawn_vehicle: destino ${operation.destinationId} ${String(destination.status)}` };
      }
      const vehicles = records(draft, "vehicles");
      const id = operation.id?.trim() || `DHL-${randomUUID().slice(0, 8)}`;
      if (vehicles.some((item) => item.id === id)) {
        return { ok: false, error: `spawn_vehicle: ya existe ${id}; usa redirect_vehicle` };
      }
      const kind = operation.kind ?? "repartidor";
      if (!["taxi", "vip", "repartidor"].includes(kind)) {
        return { ok: false, error: `spawn_vehicle: kind desconocido ${kind}` };
      }
      const estimate = routeTo(world, fromId, operation.destinationId);
      const delayMin = operation.delayMin ?? 0;
      const departAt = now;
      vehicles.push({
        id,
        kind,
        name: id,
        who: operation.who,
        count: operation.count ?? 1,
        from: fromId,
        origin: origin.name,
        destinationId: operation.destinationId,
        route: estimate.route,
        departAt,
        arriveAt: departAt + estimate.minutes * 60 + delayMin * 60,
        delayMin,
        status: "en_ruta",
        counterpart: operation.counterpart ?? "DHL Express",
        ...(operation.note ? { note: operation.note } : {}),
      });
      draft.vehicles = vehicles;
      return { ok: true };
    }
    case "set_group": {
      const group = findById(records(draft, "guestGroups"), operation.id);
      if (!group) return { ok: false, error: `set_group: grupo desconocido ${operation.id}` };
      if (operation.where !== undefined) group.where = operation.where;
      if (operation.assignedSpaceId !== undefined) {
        if (operation.assignedSpaceId === "") delete group.assignedSpaceId;
        else group.assignedSpaceId = operation.assignedSpaceId;
      }
      if (operation.needs !== undefined) group.needs = operation.needs;
      draft.guestGroups = records(draft, "guestGroups");
      return { ok: true };
    }
    case "cancel_action": {
      if (!openTaskIds.has(operation.taskId)) {
        return { ok: false, error: `cancel_action: tarea desconocida ${operation.taskId}` };
      }
      return { ok: true, cancelTaskId: operation.taskId };
    }
    case "set_agent": {
      const agent = findById(records(draft, "agents"), operation.area);
      if (!agent) return { ok: false, error: `set_agent: área desconocida ${operation.area}` };
      agent.objective = operation.objective;
      agent.reason = operation.reason;
      agent.status = operation.status;
      draft.agents = records(draft, "agents");
      return { ok: true };
    }
    case "log_event": {
      const events = records(draft, "events");
      events.push({
        id: `coord-${randomUUID()}`,
        time: now,
        kind: operation.kind,
        text: operation.text,
        ...(operation.area ? { area: operation.area } : {}),
      });
      draft.events = events.slice(-80);
      return { ok: true };
    }
    case "add_constraint": {
      const constraints = Array.isArray(draft.constraints)
        ? draft.constraints.filter((value): value is string => typeof value === "string")
        : [];
      if (!constraints.includes(operation.text)) constraints.push(operation.text);
      draft.constraints = constraints;
      return { ok: true };
    }
  }
}

export function applyOperations(
  draft: CrisisStateDocument,
  world: WorldModel,
  operations: CoordinatorOperation[],
  openTaskIds: ReadonlySet<string>,
): { errors: string[]; cancelled: string[] } {
  const errors: string[] = [];
  const cancelled: string[] = [];
  for (const operation of operations) {
    const result = applyOperation(draft, world, operation, openTaskIds);
    if (!result.ok) errors.push(result.error);
    else if (result.cancelTaskId) cancelled.push(result.cancelTaskId);
  }
  return { errors, cancelled };
}

function allocationsFrom(output: CoordinatorOutput): GuestAllocation[] {
  const used = new Set<string>();
  const allocations: GuestAllocation[] = [];
  for (const assignment of output.assignments) {
    const available = seedGuests.filter((guest) => guest.groupId === assignment.groupId && !used.has(guest.id));
    for (const guest of available.slice(0, assignment.count)) {
      used.add(guest.id);
      allocations.push({ guestId: guest.id, spaceId: assignment.spaceId, status: "proposed" });
    }
  }
  return allocations;
}

const CHANNEL_KIND = { llamada: "call", sms: "sms", email: "email" } as const;

export function persistCoordinatorOutput(input: {
  runId: string;
  planVersion: number;
  output: CoordinatorOutput;
  world: WorldModel;
  workflows: WorkflowService;
  tasks: TaskRepository;
  states: StateRepository;
}): string[] {
  const openTaskIds = new Set(input.tasks.listOpen(input.runId).map((task) => task.id));
  const current = input.states.ensureActiveRun();
  const dry = structuredClone(current.state);
  const { errors, cancelled } = applyOperations(dry, input.world, input.output.operations ?? [], openTaskIds);
  if (errors.length > 0) return errors;

  const hasPlan =
    input.output.assignments.length > 0 ||
    input.output.actions.length > 0 ||
    input.output.commitments.length > 0 ||
    input.output.decision !== null;

  if (hasPlan) {
    const allocations = allocationsFrom(input.output);
    const envelope: CoordinatorProposalEnvelope = {
      eventId: `coord-${randomUUID()}`,
      runId: input.runId,
      planVersion: input.planVersion,
      reading: input.output.reading,
      proposal: {
        title: input.output.decision?.title ?? "Replan del coordinador",
        summary: input.output.decision?.summary ?? input.output.reading,
        rationale: input.output.decision?.rationale ?? input.output.reading,
        cost: input.output.estimatedCost === undefined ? input.output.decision?.cost ?? null : input.output.estimatedCost,
        ...(input.output.decision?.kind === "operational" ? { approval: { ...input.output.decision, kind: "operational" as const } } : {}),
        conditions: input.output.decision?.conditions ?? input.output.unverified,
        allocations,
        confirmedNorthGuestIds: [],
        confirmedExternalTransferSeats: 0,
      },
      commitments: input.output.commitments
        .filter((commitment) =>
          ["propuesto", "en_consulta", "aceptado_condiciones"].includes(commitment.status),
        )
        .map((commitment) => ({
          id: commitment.id,
          title: commitment.title,
          area: commitment.area,
          status: commitment.status as "propuesto" | "en_consulta" | "aceptado_condiciones",
          counterpart: commitment.counterpart,
          conditions: commitment.conditions,
        })),
      actions: input.output.actions.map((action) => ({
        actionId: action.id,
        area: action.area,
        kind: CHANNEL_KIND[action.channel],
        objective: action.objective,
        counterpart: action.counterpart,
        dueAt: Math.min(86_399, Math.max(0, action.dueAt)),
        reason: action.reason,
        dependsOn: action.dependsOn,
        payload: action.verificationTarget
          ? { verificationTarget: action.verificationTarget }
          : {},
      })),
      unverified: input.output.unverified,
    };
    input.workflows.applyCoordinatorProposal(envelope);
  }

  const run = input.states.ensureActiveRun();
  const next = structuredClone(run.state);
  applyOperations(next, input.world, input.output.operations ?? [], openTaskIds);
  for (const taskId of cancelled) input.tasks.cancel(taskId, "invalidated by coordinator");
  if (!hasPlan && input.output.estimatedCost !== undefined && input.output.estimatedCost !== null) {
    next.budget.forecast = input.output.estimatedCost;
  }
  if (!next.waitingForDecision) next.coordinatorStatus = input.output.coordinatorStatus;
  input.states.saveState(run.id, next);
  return [];
}

export function persistReplan(input: {
  runId: string;
  output: CoordinatorOutput;
  world: WorldModel;
  tasks: TaskRepository;
  states: StateRepository;
}): string[] {
  const open = input.tasks.listOpen(input.runId);
  const openTaskIds = new Set(open.map((task) => task.id));
  const current = input.states.ensureActiveRun();
  const next = structuredClone(current.state);
  const { errors, cancelled } = applyOperations(next, input.world, input.output.operations ?? [], openTaskIds);
  if (errors.length > 0) return errors;

  const now = Number(next.clock.simSeconds);
  const commitments = new Map(next.commitments.map((commitment) => [commitment.id, commitment]));
  for (const commitment of input.output.commitments) {
    commitments.set(commitment.id, {
      ...commitments.get(commitment.id),
      ...commitment,
      planVersion: next.planVersion,
      updatedAt: now,
    });
  }
  next.commitments = [...commitments.values()];

  const agents = records(next, "agents");
  for (const action of input.output.actions) {
    const agent = agents.find((item) => item.id === action.area);
    if (!agent) continue;
    agent.objective = action.objective;
    agent.reason = action.reason;
    agent.status = next.agentsPaused ? "pausado" : "activo";
  }
  next.agents = agents;
  next.lastCoordinatorUnverified = input.output.unverified;
  next.coordinatorStatus = input.output.coordinatorStatus;
  next.resolved = false;
  input.states.saveState(current.id, next);
  const dropped = new Set(cancelled);
  for (const taskId of dropped) input.tasks.cancel(taskId, "invalidated by coordinator");
  // Una tarea que el giro no invalida sigue valiendo, pero claimNext solo despacha
  // la versión vigente del plan: sin esto se quedaría abierta y sin ejecutarse nunca.
  for (const task of open) {
    if (!dropped.has(task.id)) input.tasks.carryToPlan(task.id, next.planVersion);
  }
  const prefix = `replan-${next.planVersion}`;
  for (const action of input.output.actions) {
    input.tasks.enqueue({
      runId: input.runId,
      planVersion: next.planVersion,
      area: action.area,
      kind: CHANNEL_KIND[action.channel],
      payload: {
        objective: action.objective,
        counterpart: action.counterpart,
        dueAt: Math.min(86_399, Math.max(0, action.dueAt)),
        reason: action.reason,
        dependsOnKeys: action.dependsOn.map((dependency) => `${prefix}:${dependency}`),
      },
      idempotencyKey: `${prefix}:${action.id}`,
    });
  }
  return [];
}
