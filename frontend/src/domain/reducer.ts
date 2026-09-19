import type { Action, CrisisState } from './types'
import { createInitialState } from './initialState'
import { SCRIPTS } from './script'
import { applyIntervention, applyTwist } from './twists'

const MAX_EVENTS = 80

function tick(s: CrisisState, delta: number) {
  if (s.clock.paused) return
  s.clock.simSeconds += delta * s.clock.speed
  const now = s.clock.simSeconds

  for (const c of s.calls) {
    if (c.status === 'en_curso' && now - c.startedAt >= c.endsAfter) {
      c.status = 'terminada'
      const a = s.agents.find((x) => x.id === c.agent)
      if (a && a.status === 'llamada') a.status = 'activo'
    }
  }

  for (const sh of s.shuttles) {
    if (now >= sh.arriveAt && sh.status !== 'llegado') {
      sh.status = 'llegado'
      s.events.push({ id: `arr-${sh.id}-${Math.floor(now)}`, time: now, kind: 'info', text: `${sh.name} llega a ${sh.destinationId === 'accesoNorte' ? 'Acceso Norte' : 'P2 · Acceso Sur'} (${sh.passengers} personas)`, area: 'transporte' })
    }
  }
  for (const d of s.deliveries) {
    if (now >= d.arriveAt && (d.status === 'confirmada' || d.status === 'retrasada')) {
      d.status = 'entregada'
      s.events.push({ id: `del-${d.id}-${Math.floor(now)}`, time: now, kind: 'acuerdo', text: `${d.name} descargado`, area: 'catering' })
    }
  }

  const mins = (delta * s.clock.speed) / 60
  for (const g of s.gates) {
    if (g.status === 'cerrado') continue
    const room = Math.max(0, g.capacity - g.entered)
    const arrivals = g.arrivalsPerMin * mins
    const served = Math.min(g.throughputPerMin * mins, g.waiting + arrivals, room)
    g.waiting = Math.max(0, g.waiting + arrivals - served)
    g.entered = Math.min(g.capacity, g.entered + served)
    g.status = g.waiting > 2500 ? 'saturado' : 'abierto'
  }

  if (s.agentsPaused || s.waitingForDecision) return
  const script = SCRIPTS[s.scriptId]
  while (s.nextScriptAt !== null && now >= s.nextScriptAt && s.scriptCursor < script.length && !s.waitingForDecision) {
    const step = script[s.scriptCursor]
    step.run(s)
    s.scriptCursor += 1
    const next = script[s.scriptCursor]
    s.nextScriptAt = next ? s.clock.simSeconds + next.after : null
  }
  if (s.scriptCursor >= script.length) s.nextScriptAt = null
}

export function reducer(state: CrisisState, action: Action): CrisisState {
  if (action.type === 'RESET') return createInitialState()
  if (action.type === 'REPLACE') return action.state
  if (action.type === 'SELECT') return { ...state, selectedId: action.id }
  if (action.type === 'SET_SPEED') return { ...state, clock: { ...state.clock, speed: action.speed, paused: false } }
  if (action.type === 'TOGGLE_PAUSE') return { ...state, clock: { ...state.clock, paused: !state.clock.paused } }

  const s: CrisisState = structuredClone(state)
  switch (action.type) {
    case 'TICK':
      tick(s, action.deltaSeconds)
      break
    case 'TWIST':
      applyTwist(s, action.twist)
      break
    case 'INTERVENE':
      applyIntervention(s, action.intervention.type, action.intervention.payload?.text)
      break
  }
  if (s.events.length > MAX_EVENTS) s.events = s.events.slice(-MAX_EVENTS)
  return s
}
