import type { CrisisState, Space } from './types'

/** Un espacio asignable; la confirmación se cuenta aparte. */
const ASSIGNABLE_SPACE = ['operativo', 'propuesto', 'pendiente', 'confirmado']
const CONFIRMED_SPACE = ['operativo', 'confirmado']
const HOSPITALITY_KIND = ['pabellon', 'lounge', 'espera']

export function kpis(s: CrisisState) {
  const total = s.guestGroups.reduce((a, g) => a + g.count, 0)
  const currentAssignments = (s.assignments ?? []).filter((item) => item.planVersion === s.planVersion)
  const coverage = s.guestGroups.map((g) => {
    const count = Math.max(0, g.count)
    const confirmedCount = Math.min(count, Math.max(0, g.confirmedCount))
    const proposed = currentAssignments.filter((item) => item.groupId === g.id).map((item) => ({ ...item, space: s.spaces.find((space) => space.id === item.spaceId) }))
    const legacySpace = typeof g.assignedSpaceId === 'string' ? s.spaces.find((space) => space.id === g.assignedSpaceId) : undefined
    if (!proposed.length) {
      const hospitality = legacySpace && HOSPITALITY_KIND.includes(legacySpace.kind)
      return {
        assigned: hospitality && ASSIGNABLE_SPACE.includes(legacySpace.status) ? count : legacySpace ? 0 : confirmedCount,
        confirmed: hospitality && CONFIRMED_SPACE.includes(legacySpace.status) ? confirmedCount : legacySpace ? 0 : confirmedCount,
      }
    }
    const assigned = proposed.filter((item) => item.space && HOSPITALITY_KIND.includes(item.space.kind) && ASSIGNABLE_SPACE.includes(item.space.status)).reduce((sum, item) => sum + item.count, 0)
    const confirmedCapacity = proposed.filter((item) => item.space && HOSPITALITY_KIND.includes(item.space.kind) && CONFIRMED_SPACE.includes(item.space.status)).reduce((sum, item) => sum + item.count, 0)
    return { assigned: Math.min(count, assigned), confirmed: Math.min(confirmedCount, confirmedCapacity) }
  })
  const assigned = coverage.reduce((a, item) => a + item.assigned, 0)
  const confirmed = coverage.reduce((a, item) => a + item.confirmed, 0)
  const informed = s.guestGroups.reduce((a, g) => a + g.informedCount, 0)
  const accepted = s.guestGroups.reduce((a, g) => a + g.acceptedCount, 0)
  const cateringTotal = s.deliveries.reduce((a, d) => a + d.services, 0)
  const cateringConfirmed = s.deliveries.filter((d) => d.status === 'confirmada' || d.status === 'entregada').reduce((a, d) => a + d.services, 0)
  const shuttlesOk = s.shuttles.filter((x) => x.accepted).length
  const critical = s.commitments
    .filter((c) => c.status === 'aceptado_condiciones' || c.status === 'en_consulta' || c.status === 'propuesto')
    .flatMap((c) => c.conditions.map((cond) => ({ commitment: c.title, cond })))
  const pendingDecisions = s.decisions.filter((d) => d.status === 'pendiente').length
  return { total, assigned, confirmed, informed, accepted, cateringTotal, cateringConfirmed, shuttlesOk, shuttlesTotal: s.shuttles.length, critical, pendingDecisions }
}

export function areaSummary(s: CrisisState) {
  const spacesConfirmed = s.spaces.filter((x) => x.kind !== 'acceso' && x.kind !== 'muelle' && x.status === 'confirmado').length
  const spacesPending = s.spaces.filter((x) => x.kind !== 'acceso' && x.kind !== 'muelle' && (x.status === 'pendiente' || x.status === 'propuesto')).length
  const deliveriesOk = s.deliveries.filter((d) => d.status === 'confirmada' || d.status === 'entregada').length
  const deliveriesBad = s.deliveries.filter((d) => d.status === 'retrasada' || d.status === 'bloqueada').length
  const shuttlesBad = s.shuttles.filter((x) => x.status === 'retrasado' || x.status === 'reasignado').length
  const shuttlesOk = s.shuttles.filter((x) => x.accepted).length
  const informed = s.guestGroups.reduce((a, g) => a + g.informedCount, 0)
  const pendingNeeds = s.commitments.filter((c) => c.area === 'asistentes' && c.status !== 'completado' && c.status !== 'invalidado').length
  return { spacesConfirmed, spacesPending, deliveriesOk, deliveriesBad, shuttlesOk, shuttlesBad, informed, pendingNeeds }
}

export function spaceById(s: CrisisState, id: string | null): Space | undefined {
  return s.spaces.find((x) => x.id === id)
}

export function pendingDecision(s: CrisisState) {
  const waiting = s.waitingForDecision ? s.decisions.find((d) => d.id === s.waitingForDecision && d.status === 'pendiente') : undefined
  return waiting ?? s.decisions.find((d) => d.status === 'pendiente') ?? null
}

export function displayCall(s: CrisisState) {
  const newestFirst = [...s.calls].reverse()
  return newestFirst.find((c) => c.status === 'en_curso')
    ?? newestFirst.find((c) => c.transcript.length > 0)
    ?? null
}

export function attendance(s: CrisisState) {
  const entered = s.gates.reduce((a, g) => a + g.entered, 0)
  const waiting = s.gates.reduce((a, g) => a + g.waiting, 0)
  return { entered, waiting, expected: s.attendanceExpected, saturated: s.gates.filter((g) => g.status === 'saturado').length }
}
