import type { Area, Call, Commitment, CommitmentStatus, CrisisState, Decision, EventKind, SpaceStatus, TranscriptLine } from './types'

let seq = 1000
export const uid = (p: string) => `${p}-${seq++}`

export const now = (s: CrisisState) => s.clock.simSeconds

export function pushEvent(s: CrisisState, kind: EventKind, text: string, area?: Area) {
  s.events.push({ id: uid('e'), time: now(s), kind, text, area })
}

export function setAgent(s: CrisisState, id: Area, patch: Partial<Omit<CrisisState['agents'][number], 'id'>>) {
  const a = s.agents.find((x) => x.id === id)
  if (a) Object.assign(a, patch)
}

export function setSpace(s: CrisisState, id: string, status: SpaceStatus, note?: string, capacity?: number) {
  const sp = s.spaces.find((x) => x.id === id)
  if (!sp) return
  sp.status = status
  if (note !== undefined) sp.note = note
  if (capacity !== undefined) sp.capacity = capacity
}

export function upsertCommitment(s: CrisisState, c: Omit<Commitment, 'planVersion' | 'updatedAt'> & { planVersion?: number }) {
  const existing = s.commitments.find((x) => x.id === c.id)
  const full: Commitment = { ...c, planVersion: c.planVersion ?? s.planVersion, updatedAt: now(s) }
  if (existing) Object.assign(existing, full)
  else s.commitments.push(full)
}

export function setCommitment(s: CrisisState, id: string, status: CommitmentStatus, note?: string, conditions?: string[]) {
  const c = s.commitments.find((x) => x.id === id)
  if (!c) return
  c.status = status
  c.updatedAt = now(s)
  if (note !== undefined) c.note = note
  if (conditions !== undefined) c.conditions = conditions
}

export function invalidate(s: CrisisState, id: string, reason: string) {
  const c = s.commitments.find((x) => x.id === id)
  if (!c || c.status === 'invalidado') return false
  c.status = 'invalidado'
  c.note = reason
  c.updatedAt = now(s)
  return true
}

export function startCall(s: CrisisState, agent: Area, counterpart: string, lines: Array<[TranscriptLine['who'], string]>, channel: Call['channel'] = 'llamada') {
  for (const c of s.calls) if (c.status === 'en_curso') c.status = 'terminada'
  const gap = 9
  const transcript: TranscriptLine[] = lines.map(([who, text], i) => ({ who, text, at: 3 + i * gap }))
  const call: Call = { id: uid('call'), agent, counterpart, channel, startedAt: now(s), endsAfter: 6 + lines.length * gap, status: 'en_curso', transcript }
  s.calls.push(call)
  setAgent(s, agent, { status: 'llamada' })
  return call
}

export function openDecision(s: CrisisState, d: Omit<Decision, 'status' | 'createdAt' | 'id'> & { id?: string }) {
  const id = d.id ?? uid('dec')
  s.decisions.push({ ...d, id, status: 'pendiente', createdAt: now(s) })
  s.waitingForDecision = id
  s.coordinatorStatus = 'esperando_decision'
  s.budget.forecast = d.cost
  pushEvent(s, 'decision', `Decisión operativa pendiente: ${d.title}`)
  return id
}

export function groups(s: CrisisState) {
  const g = (id: string) => s.guestGroups.find((x) => x.id === id)!
  return { acceso: g('g-acceso'), shuttles: g('g-shuttles'), propios: g('g-propios') }
}

/**
 * Techo de lo que la tarjeta aguanta en pantalla si nadie cierra la llamada. El backend la
 * cierra al llegar el resultado, pero un callback real perdido —túnel caído, workflow sin
 * publicar— dejaba «Llamada en curso» colgada encima del mapa para siempre.
 */
const CALL_SCREEN_CAP_SECONDS = 30

export function activeCall(s: CrisisState) {
  return s.calls.find((c) => {
    if (c.status !== 'en_curso') return false
    const elapsed = s.clock.simSeconds - c.startedAt
    return elapsed <= Math.max(c.endsAfter ?? 0, CALL_SCREEN_CAP_SECONDS)
  }) ?? null
}
