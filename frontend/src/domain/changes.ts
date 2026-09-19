import type { CrisisState } from './types'
import { fmtClock, fmtEur } from './time'

export interface StateChange {
  id: string
  resourceId: string | null
  title: string
  category: string
  before: string
  after: string
}

const words = (value: string) => value.replaceAll('_', ' ')

/** Compare operational facts only. Clock ticks, selection and heartbeat timestamps are not changes. */
export function compareStates(before: CrisisState, after: CrisisState): StateChange[] {
  const changes: StateChange[] = []
  function collection<T extends { id: string }>(category: string, old: T[], now: T[], describe: (v: T, state: CrisisState) => string, title: (v: T) => string, selectable = true) {
    const previous = new Map(old.map((v) => [v.id, v]))
    const current = new Map(now.map((v) => [v.id, v]))
    for (const id of new Set([...previous.keys(), ...current.keys()])) {
      const a = previous.get(id), b = current.get(id)
      const from = a ? describe(a, before) : 'No existía'
      const to = b ? describe(b, after) : 'Retirado del estado'
      if (from !== to) changes.push({ id: `${category}-${id}`, resourceId: selectable && b ? id : null, title: title((b ?? a)!), category, before: from, after: to })
    }
  }
  const place = (state: CrisisState, id?: string) => state.spaces.find((s) => s.id === id)?.name ?? id ?? 'Sin espacio único'
  collection('Espacios', before.spaces, after.spaces, (s) => [words(s.status), s.capacity === undefined ? '' : `${s.capacity} plazas`, s.readyAt ? `desde ${fmtClock(s.readyAt)}` : ''].filter(Boolean).join(' · '), (s) => s.name)
  collection('Transporte', before.shuttles, after.shuttles, (s, state) => `${words(s.status)} · ${place(state, s.destinationId)} · ${fmtClock(s.arriveAt)} · ${s.passengers} pasajeros · ${s.accepted ? 'ruta aceptada' : 'sin confirmar'}`, (s) => s.name)
  collection('Catering', before.deliveries, after.deliveries, (d, state) => `${words(d.status)} · ${d.services} servicios · ${place(state, d.dockId)} · ${fmtClock(d.arriveAt)}`, (d) => d.name)
  collection('Acuerdos', before.commitments, after.commitments, (c) => `${words(c.status)}${c.conditions.length ? ` · ${c.conditions.join('; ')}` : ''}`, (c) => c.title)
  collection('Asistentes', before.guestGroups, after.guestGroups, (g, state) => `${g.confirmedCount}/${g.count} ubicados · ${g.informedCount} informados · ${g.acceptedCount} aceptan · ${place(state, g.assignedSpaceId)}${g.needs ? ` · ${g.needs}` : ''}`, (g) => g.name)
  collection('Decisiones', before.decisions, after.decisions, (d) => `${words(d.status)} · ${fmtEur(d.cost)}`, (d) => d.title)
  const money = (s: CrisisState) => `Previsto ${fmtEur(s.budget.forecast)} · comprometido ${fmtEur(s.budget.committed)} · autorizado ${fmtEur(s.budget.authorized)} · límite autónomo ${fmtEur(s.budget.autonomousLimit)} · fondo ${fmtEur(s.budget.contingency)}`
  if (money(before) !== money(after)) changes.push({ id: 'budget', resourceId: null, category: 'Presupuesto', title: 'Presupuesto de contingencia', before: money(before), after: money(after) })
  if (before.constraints.join('|') !== after.constraints.join('|')) changes.push({ id: 'constraints', resourceId: null, category: 'Restricciones', title: 'Instrucciones del responsable', before: before.constraints.join(' · ') || 'Sin restricciones', after: after.constraints.join(' · ') || 'Sin restricciones' })
  if (before.agentsPaused !== after.agentsPaused) changes.push({ id: 'agent-control', resourceId: null, category: 'Control', title: 'Acciones de los agentes', before: before.agentsPaused ? 'Nuevas acciones pausadas' : 'Acciones habilitadas', after: after.agentsPaused ? 'Nuevas acciones pausadas' : 'Acciones habilitadas' })
  return changes
}
