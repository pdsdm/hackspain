import { useCallback, useEffect, useRef, useState } from 'react'
import type { CrisisState, Intervention } from '../domain/types'
import { createFixtureState } from '../domain/fixtures'
import { api } from './apiClient'

export interface CrisisController {
  state: CrisisState
  ready: boolean
  error: string | null
  stale: boolean
  ageSeconds: number
  pending: boolean
  feedback: string | null
  intervene: (i: Intervention) => Promise<boolean>
  setSpeed: (n: number) => void
  togglePause: () => void
  select: (id: string | null) => void
  reset: () => void
  sendEvent: (text: string) => Promise<boolean>
}

export function useCrisisState(): CrisisController {
  const [state, setState] = useState<CrisisState>(() => createFixtureState('calm'))
  const [selectedId, select] = useState<string | null>('principal')
  const [ready, setReady] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [receivedAt, setReceivedAt] = useState<number | null>(null)
  const [now, setNow] = useState(Date.now)
  const [pending, setPending] = useState(false)
  const [feedback, setFeedback] = useState<string | null>(null)
  const requestInFlight = useRef(false)
  const pollInFlight = useRef(false)
  const ageSeconds = receivedAt === null ? 0 : Math.floor((now - receivedAt) / 1000)
  const stale = !ready || ageSeconds >= 10

  const receive = useCallback((s: CrisisState) => {
    setState(s)
    const at = Date.now()
    setReceivedAt(at); setNow(at); setReady(true); setError(null)
  }, [])

  useEffect(() => {
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
    const refresh = () => { if (document.visibilityState === 'visible') void poll() }
    void poll()
    const polling = setInterval(() => void poll(), 1000)
    const clock = setInterval(() => setNow(Date.now()), 1000)
    document.addEventListener('visibilitychange', refresh)
    window.addEventListener('focus', refresh)
    return () => {
      alive = false
      clearInterval(polling)
      clearInterval(clock)
      document.removeEventListener('visibilitychange', refresh)
      window.removeEventListener('focus', refresh)
    }
  }, [receive])

  const intervene = async (i: Intervention) => {
    if (requestInFlight.current || stale || state.clock.paused) {
      if (state.clock.paused) setFeedback('La operación está pausada. Iníciala antes de intervenir.')
      return false
    }
    setFeedback(null)
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
    state: { ...state, selectedId }, ready, error, stale, ageSeconds, pending, feedback,
    intervene,
    setSpeed: (speed) => {
      void api.clock({ speed }).catch((e) => setFeedback('No se pudo cambiar la velocidad: ' + (e instanceof Error ? e.message : 'error')))
    },
    togglePause: () => {
      void api.clock({ paused: !state.clock.paused }).catch((e) => setFeedback('No se pudo pausar el reloj: ' + (e instanceof Error ? e.message : 'error')))
    },
    select,
    reset: () => {
      if (requestInFlight.current) return
      requestInFlight.current = true
      setPending(true)
      void api.reset()
        .then(() => setFeedback('Ejecución reiniciada.'))
        .catch((e) => setFeedback('No se pudo reiniciar: ' + (e instanceof Error ? e.message : 'error')))
        .finally(() => { requestInFlight.current = false; setPending(false) })
    },
    sendEvent: async (text) => {
      if (state.clock.paused) {
        setFeedback('La operación está pausada. Iníciala antes de enviar un evento.')
        return false
      }
      if (requestInFlight.current) {
        setFeedback('Espera: hay un envío en curso (el coordinador va en serie).')
        return false
      }
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
  }
}
