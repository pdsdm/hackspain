import type { TwistId } from "../../contracts/api.js";
import type { CrisisStateDocument } from "../../domain/crisis-state.js";
import type {
  CoordinatorAction,
  CoordinatorAssignment,
  CoordinatorCommitment,
  CoordinatorOperation,
  CoordinatorOutput,
} from "./types.js";

const T16: ReadonlySet<string> = new Set(["lounge_unavailable", "pabellon_b_400", "reject_split"]);
const SOUTH_IDS = ["pabellonB", "loungeSur"] as const;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function records(state: CrisisStateDocument, field: string): Array<Record<string, unknown>> {
  const value = state[field];
  return Array.isArray(value) ? value.filter(isRecord) : [];
}

function hhmm(seconds: number): string {
  return `${String(Math.floor(seconds / 3600)).padStart(2, "0")}:${String(Math.floor((seconds % 3600) / 60)).padStart(2, "0")}`;
}

function usableCapacity(space: Record<string, unknown> | undefined): number {
  if (!space) return 0;
  const status = String(space.status ?? "");
  if (status === "descartado" || status === "cerrado" || status === "inactivo") return 0;
  return Number(space.capacity ?? 0);
}

function staysPut(
  group: Record<string, unknown>,
  assigned: CoordinatorAssignment[],
  discarded: ReadonlySet<string>,
): boolean {
  const old = typeof group.assignedSpaceId === "string" ? group.assignedSpaceId : undefined;
  if (!old || discarded.has(old)) return false;
  const mine = assigned.filter((item) => item.groupId === group.id);
  const placed = mine.reduce((sum, item) => sum + item.count, 0);
  const spaces = [...new Set(mine.map((item) => item.spaceId))];
  return spaces.length === 1 && spaces[0] === old && placed === Number(group.count ?? 0);
}

function fold(value: string): string {
  return value.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase();
}

function spaceAliases(space: Record<string, unknown>): string[] {
  const id = String(space.id);
  const split = id.replace(/([a-z])([A-Z])/g, "$1 $2");
  return [...new Set([id, split, String(space.name ?? "")].map(fold).filter(Boolean))];
}

function taskTouchesDiscarded(
  task: { id: string; payload?: unknown },
  discardedSpaces: Array<Record<string, unknown>>,
): boolean {
  const blob = fold(`${task.id} ${JSON.stringify(task.payload ?? {})}`);
  return discardedSpaces.some((space) => spaceAliases(space).some((alias) => blob.includes(alias)));
}

function applyAssignmentOps(
  groups: Array<Record<string, unknown>>,
  assignments: CoordinatorAssignment[],
): CoordinatorOperation[] {
  const ops: CoordinatorOperation[] = [];
  for (const group of groups) {
    const id = String(group.id);
    const mine = assignments.filter((item) => item.groupId === id);
    const placed = mine.reduce((sum, item) => sum + item.count, 0);
    const spaces = [...new Set(mine.map((item) => item.spaceId))];
    const current = typeof group.assignedSpaceId === "string" ? group.assignedSpaceId : "";
    const next =
      placed === 0 ? "" : spaces.length === 1 && placed === Number(group.count ?? 0) ? spaces[0]! : "";
    if (next !== current) ops.push({ op: "set_group", id, assignedSpaceId: next });
  }
  return ops;
}

export function buildReplan(
  state: CrisisStateDocument,
  twist: TwistId,
  pending: ReadonlyArray<{ id: string; payload?: unknown }>,
): CoordinatorOutput | null {
  if (!T16.has(twist)) return null;

  const now = Number(state.clock.simSeconds);
  const dueAt = now + 600;
  const spaces = records(state, "spaces");
  const groups = records(state, "guestGroups");
  const discardedSpaces = spaces.filter((space) => space.status === "descartado");
  const discarded = new Set(discardedSpaces.map((space) => String(space.id)));
  const byId = new Map(spaces.map((space) => [String(space.id), space]));
  const remaining = new Map<string, number>(
    SOUTH_IDS.map((id) => [id, usableCapacity(byId.get(id))]),
  );
  const placed = new Map<string, number>();
  const assignments: CoordinatorAssignment[] = [];

  const take = (groupId: string, spaceId: string, count: number) => {
    if (count <= 0) return;
    assignments.push({ groupId, spaceId, count });
    remaining.set(spaceId, (remaining.get(spaceId) ?? 0) - count);
    placed.set(groupId, (placed.get(groupId) ?? 0) + count);
  };

  for (const group of groups) {
    const spaceId = typeof group.assignedSpaceId === "string" ? group.assignedSpaceId : undefined;
    if (!spaceId || (remaining.get(spaceId) ?? 0) <= 0) continue;
    take(String(group.id), spaceId, Math.min(Number(group.count ?? 0), remaining.get(spaceId) ?? 0));
  }
  for (const group of groups) {
    let left = Number(group.count ?? 0) - (placed.get(String(group.id)) ?? 0);
    for (const spaceId of SOUTH_IDS) {
      if (left <= 0) break;
      const cap = remaining.get(spaceId) ?? 0;
      if (cap <= 0) continue;
      const count = Math.min(left, cap);
      take(String(group.id), spaceId, count);
      left -= count;
    }
  }

  const south = assignments.reduce((sum, item) => sum + item.count, 0);
  const sure = assignments
    .filter((item) => byId.get(item.spaceId)?.status === "confirmado")
    .reduce((sum, item) => sum + item.count, 0);
  const coverage =
    sure === south ? `${south} plazas confirmadas en Sur` : `${south} plazas en Sur (${sure} confirmadas)`;
  const usableSouth = SOUTH_IDS.filter((id) => usableCapacity(byId.get(id)) > 0).map((id) =>
    String(byId.get(id)?.name ?? id),
  );
  const total = groups.reduce((sum, group) => sum + Number(group.count ?? 0), 0);
  const missing = Math.max(0, total - south);
  const north = byId.get("norteC");
  const readyAt = Number(north?.readyAt ?? 49500);
  const openingAt = Number((state.clock as { openingAt?: number }).openingAt ?? 46800);
  const delayMin = Math.max(0, Math.round((readyAt - openingAt) / 60));

  const operations: CoordinatorOperation[] = pending
    .filter((task) => taskTouchesDiscarded(task, discardedSpaces))
    .map((task) => ({
      op: "cancel_action",
      taskId: task.id,
      reason: "El giro invalida la tarea",
    }));
  const actions: CoordinatorAction[] = [];
  const commitments: CoordinatorCommitment[] = records(state, "commitments")
    .filter((item) => item.status === "invalidado")
    .map((item) => ({
      id: String(item.id),
      title: String(item.title ?? item.id),
      area: item.area as CoordinatorCommitment["area"],
      status: "invalidado",
      counterpart: String(item.counterpart ?? ""),
      conditions: Array.isArray(item.conditions)
        ? item.conditions.filter((value): value is string => typeof value === "string")
        : [],
    }));
  const unverified: string[] = [];
  let reading = "";

  if (twist === "lounge_unavailable") {
    reading = `${coverage}, ${missing} personas sin ubicación. Lounge Sur invalidado; cruzar a Norte exige traslado, no un paso a pie.`;
    operations.push({
      op: "set_place",
      id: "norteC",
      status: "propuesto",
      readyAt,
      note: `Alternativa para ${missing} con traslado exterior · ${hhmm(readyAt)}`,
    });
    commitments.push({
      id: "c-norte150",
      title: `Traslado de ${missing} invitados a Norte C (${hhmm(readyAt)})`,
      area: "espacios",
      status: "propuesto",
      counterpart: "Recinto + Transporte",
      conditions: ["Lanzadera Sur→Norte", `Aceptar retraso ${hhmm(readyAt)}`],
    });
    actions.push({
      id: "a-norte",
      area: "espacios",
      channel: "llamada",
      counterpart: "Responsable de recinto",
      objective: `Confirmar Norte C para ${missing} personas a las ${hhmm(readyAt)} con traslado exterior`,
      dueAt,
      dependsOn: [],
      reason: `Faltan ${missing} plazas en Sur y Norte C no está confirmado.`,
    });
    unverified.push("Disponibilidad real de Norte C y lanzadera Sur→Norte");
  } else if (twist === "pabellon_b_400") {
    const cover =
      usableSouth.length === 0
        ? `El Sur ya no cubre nada de ${total}`
        : `${usableSouth.join(" + ")} cubre${usableSouth.length > 1 ? "n" : ""} ${south} de ${total}`;
    reading = `${cover}. El plan no es viable: faltan ${missing} plazas.`;
    commitments.push({
      id: "c-50",
      title: `Ubicar ${missing} invitados sin plaza`,
      area: "espacios",
      status: "propuesto",
      counterpart: "Recinto",
      conditions: ["Espacio adicional en Sur o traslado acordado a Norte"],
    });
    actions.push({
      id: "a-aforo",
      area: "espacios",
      channel: "llamada",
      counterpart: "Responsable de recinto",
      objective: `Cubrir ${missing} plazas que ya no caben con aforo 400 + Lounge`,
      dueAt,
      dependsOn: [],
      reason: `La cobertura baja a ${south} y no se puede declarar el plan viable.`,
    });
    unverified.push("Dónde caben las plazas que faltan");
  } else {
    reading = `Se descartan Pabellón B y Lounge Sur. Norte C (readyAt ${readyAt}, ${hhmm(readyAt)}) implica ${delayMin} min de retraso y un traslado exterior Sur→Norte.`;
    operations.push({
      op: "set_place",
      id: "norteC",
      status: "propuesto",
      readyAt,
      note: `Única opción para ${total} juntos · apertura ${hhmm(readyAt)}`,
    });
    commitments.push({
      id: "c-norteC",
      title: `Reubicar ${total} invitados en Pabellón Norte C`,
      area: "espacios",
      status: "propuesto",
      counterpart: "Recinto",
      conditions: [`Disponibilidad ${hhmm(readyAt)}`, "Traslado exterior Sur→Norte", "Aceptar retraso de apertura"],
    });
    actions.push({
      id: "a-norte",
      area: "espacios",
      channel: "llamada",
      counterpart: "Responsable de recinto",
      objective: `Confirmar Pabellón Norte C para ${total} desde ${hhmm(readyAt)}`,
      dueAt,
      dependsOn: [],
      reason: "Sin un único espacio en Sur hay que evaluar Norte C y su retraso.",
    });
    actions.push({
      id: "a-traslado",
      area: "transporte",
      channel: "llamada",
      counterpart: "Transportes Ibéricos",
      objective: "Preparar traslado exterior Sur→Norte; no hay paso a pie",
      dueAt: dueAt + 300,
      dependsOn: ["a-norte"],
      reason: "Reubicar entre zonas exige un traslado acordado.",
    });
    unverified.push("Aceptación del retraso 13:45 y de la lanzadera Sur→Norte");
  }

  operations.push(...applyAssignmentOps(groups, assignments));

  const dependsOn = twist === "reject_split" ? ["a-norte"] : [];
  for (const group of groups) {
    if (Number(group.informedCount ?? 0) <= 0) continue;
    if (staysPut(group, assignments, discarded)) continue;
    const name = String(group.name ?? group.id);
    actions.push({
      id: `recontact-${String(group.id)}`,
      area: "asistentes",
      channel: "sms",
      counterpart: name,
      objective: `Avisar a ${String(group.id)} (${Number(group.informedCount)} informados): la instrucción anterior ya no vale`,
      dueAt,
      dependsOn,
      reason: `${name} ya recibió un aviso y su assignedSpaceId cambia.`,
    });
  }
  const spaceDependency = actions.find((action) => action.area === "espacios")?.id;
  for (const group of groups) {
    const needs = typeof group.needs === "string" ? group.needs.trim() : "";
    if (!needs || staysPut(group, assignments, discarded)) continue;
    const id = String(group.id);
    actions.push({
      id: `verify-needs-${id}`,
      area: "asistentes",
      channel: "sms",
      counterpart: String(group.name ?? id),
      objective: `Confirmar para ${id} que la nueva alternativa cubre: ${needs}`,
      dueAt,
      dependsOn: spaceDependency ? [spaceDependency] : [],
      reason: "El cambio de sede exige volver a verificar accesibilidad y dieta por separado.",
    });
  }

  operations.push({ op: "log_event", kind: "accion", text: reading, area: "espacios" });
  operations.push({
    op: "set_agent",
    area: "asistentes",
    objective: actions.find((action) => action.area === "asistentes")?.objective ?? "Retener avisos hasta instrucción vigente",
    reason: "Solo se reavisa a quien ya tenía un aviso y cuya asignación cambia.",
    status: "activo",
  });

  return {
    reading,
    planVersion: Number(state.planVersion),
    coordinatorStatus: "replanificando",
    actions,
    commitments,
    assignments,
    decision: null,
    unverified,
    operations,
    queries: [],
    done: true,
  };
}
