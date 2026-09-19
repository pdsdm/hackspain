import { useCallback, useEffect, useReducer, useRef, useState } from 'react'
import type { CrisisState, Intervention, TwistId } from '../domain/types'
import { createInitialState } from '../domain/initialState'
import { createFixtureState, type FixtureName } from '../domain/fixtures'
import { reducer } from '../domain/reducer'
import { api } from './apiClient'

export type DataSource = 'sim' | 'api'
export interface CrisisController {
  state: CrisisState
  source: DataSource
  ready: boolean
  error: string | null
  stale: boolean
  ageSeconds: number
  pending: boolean
  feedback: string | null
  reference: CrisisState | null
  setReference: () => void
  intervene: (i: Intervention) => Promise<boolean>
  twist: (t: TwistId) => void
  setSpeed: (n: number) => void
  togglePause: () => void
  select: (id: string | null) => void
  reset: () => void
  sendEvent: (text: string) => Promise<boolean>
  loadFixture: (name: FixtureName) => void
}

const SOURCE: DataSource = import.meta.env.VITE_DATA_SOURCE === 'api' ? 'api' : 'sim'

export function useCrisisState(): CrisisController {
  const [state, dispatch] = useReducer(reducer, undefined, createInitialState)
  const [reference, setReference] = useState<CrisisState | null>(() => SOURCE === 'sim' ? createFixtureState('normal') : null)
  const [selectedId, select] = useState<string | null>('principal')
  const [ready, setReady] = useState(SOURCE === 'sim')
  const [error, setError] = useState<string | null>(null)
  const [receivedAt, setReceivedAt] = useState<number | null>(null)
  const [now, setNow] = useState(Date.now)
  const [pending, setPending] = useState(false)
  const [feedback, setFeedback] = useState<string | null>(null)
  const requestInFlight = useRef(false)
  const previous = useRef<CrisisState | null>(null)
  const pollInFlight = useRef(false)
  const ageSeconds = receivedAt === null ? 0 : Math.floor((now - receivedAt) / 1000)
  const stale = SOURCE === 'api' && (!ready || !!error || ageSeconds >= 10)

  const receive = useCallback((s: CrisisState) => {
    // A server reset begins a new comparison. Do not compare two different runs.
    const old = previous.current
    const reset = old && s.clock.simSeconds < old.clock.simSeconds && s.planVersion <= old.planVersion
    setReference((ref) => !ref || reset ? structuredClone(s) : ref)
    previous.current = s
    dispatch({ type: 'REPLACE', state: s })
    const at = Date.now()
    setReceivedAt(at); setNow(at); setReady(true); setError(null)
  }, [])

  useEffect(() => {
    if (SOURCE !== 'sim') return
    let last = performance.now()
    const id = setInterval(() => {
      const time = performance.now()
      dispatch({ type: 'TICK', deltaSeconds: Math.min(2, (time - last) / 1000) })
      last = time
    }, 250)
    return () => clearInterval(id)
  }, [])

  useEffect(() => {
    if (SOURCE !== 'api') return
    let alive = true
    const poll = async () => {
      if (pollInFlight.current) return
      pollInFlight.current = true
      try {
        const s = await api.getState()
        if (alive) receive(s)
      } catch (e) {
        if (alive) setError(e instanceof Error ? e.message : 'Backend no disponible')
      } finally { pollInFlight.current = false }
    }
    void poll()
    const polling = setInterval(() => void poll(), 2000)
    const clock = setInterval(() => setNow(Date.now()), 1000)
    return () => { alive = false; clearInterval(polling); clearInterval(clock) }
  }, [receive])

  const intervene = async (i: Intervention) => {
    if (requestInFlight.current || stale) return false
    setFeedback(null)
    if (SOURCE === 'sim') {
      dispatch({ type: 'INTERVENE', intervention: i })
      setFeedback('Intervención aplicada en la simulación.')
      return true
    }
    requestInFlight.current = true; setPending(true)
    try {
      await api.intervene(i)
      setFeedback('Solicitud enviada. El estado se actualizará con la respuesta del sistema.')
      return true
    } catch (e) {
      setFeedback('No se pudo enviar: ' + (e instanceof Error ? e.message : 'error de conexión') + '. Puedes reintentarlo.')
      return false
    } finally { requestInFlight.current = false; setPending(false) }
  }

  return {
    state: { ...state, selectedId }, source: SOURCE, ready, error, stale, ageSeconds, pending, feedback, reference,
    setReference: () => setReference(structuredClone(state)),
    intervene,
    twist: (twist) => {
      if (SOURCE === 'sim') {
        dispatch({ type: 'TWIST', twist })
        return
      }
      if (requestInFlight.current || stale) return
      requestInFlight.current = true
      setPending(true)
      void api.twist(twist)
        .then(() => setFeedback('Giro enviado al backend.'))
        .catch((e) => setFeedback('No se pudo enviar el giro: ' + (e instanceof Error ? e.message : 'error')))
        .finally(() => { requestInFlight.current = false; setPending(false) })
    },
    setSpeed: (speed) => { if (SOURCE === 'sim') dispatch({ type: 'SET_SPEED', speed }) },
    togglePause: () => { if (SOURCE === 'sim') dispatch({ type: 'TOGGLE_PAUSE' }) },
    select,
    reset: () => {
      if (SOURCE === 'sim') {
        dispatch({ type: 'RESET' }); setReference(createFixtureState('normal')); select('principal'); setFeedback(null)
        return
      }
      if (requestInFlight.current) return
      requestInFlight.current = true
      setPending(true)
      void api.reset()
        .then(() => setFeedback('Ejecución reiniciada.'))
        .catch((e) => setFeedback('No se pudo reiniciar: ' + (e instanceof Error ? e.message : 'error')))
        .finally(() => { requestInFlight.current = false; setPending(false) })
    },
    sendEvent: async (text) => {
      if (SOURCE !== 'api' || requestInFlight.current || stale) return false
      requestInFlight.current = true
      setPending(true)
      setFeedback(null)
      try {
        await api.sendEvent(text)
        setFeedback('Evento enviado. El coordinador está trabajando.')
        return true
      } catch (e) {
        setFeedback('No se pudo enviar: ' + (e instanceof Error ? e.message : 'error de conexión'))
        return false
      } finally {
        requestInFlight.current = false
        setPending(false)
      }
    },
    loadFixture: (name) => {
      if (SOURCE !== 'sim') return
      dispatch({ type: 'REPLACE', state: createFixtureState(name) }); select(null); setFeedback(null)
    },
  }
}
