import { useCallback, useEffect, useReducer, useRef, useState } from 'react'
import type { CrisisState, Intervention, TwistId } from '../domain/types'
import { createInitialState } from '../domain/initialState'
import { reducer } from '../domain/reducer'
import { api } from './apiClient'

export type DataSource = 'sim' | 'api'

export interface CrisisController {
  state: CrisisState
  source: DataSource
  error: string | null
  intervene: (i: Intervention) => void
  twist: (t: TwistId) => void
  setSpeed: (n: number) => void
  togglePause: () => void
  select: (id: string | null) => void
  reset: () => void
}

const SOURCE: DataSource = (import.meta.env.VITE_DATA_SOURCE as string) === 'api' ? 'api' : 'sim'
const TICK_MS = 250

export function useCrisisState(): CrisisController {
  const [state, dispatch] = useReducer(reducer, undefined, createInitialState)
  const [error, setError] = useState<string | null>(null)
  const last = useRef<number>(0)

  useEffect(() => {
    if (SOURCE !== 'sim') return
    last.current = performance.now()
    const id = setInterval(() => {
      const t = performance.now()
      const delta = Math.min(2, (t - last.current) / 1000)
      last.current = t
      dispatch({ type: 'TICK', deltaSeconds: delta })
    }, TICK_MS)
    return () => clearInterval(id)
  }, [])

  useEffect(() => {
    if (SOURCE !== 'api') return
    let alive = true
    const poll = async () => {
      try {
        const s = await api.getState()
        if (!alive) return
        dispatch({ type: 'REPLACE', state: { ...s, simulated: s.simulated ?? false } })
        setError(null)
      } catch (e) {
        if (alive) setError(e instanceof Error ? e.message : 'Backend no disponible')
      }
    }
    void poll()
    const id = setInterval(() => void poll(), 2000)
    return () => { alive = false; clearInterval(id) }
  }, [])

  const intervene = useCallback((i: Intervention) => {
    if (SOURCE === 'api') { api.intervene(i).catch((e: Error) => setError(e.message)); return }
    dispatch({ type: 'INTERVENE', intervention: i })
  }, [])

  const twist = useCallback((t: TwistId) => {
    if (SOURCE === 'api') { api.twist(t).catch((e: Error) => setError(e.message)); return }
    dispatch({ type: 'TWIST', twist: t })
  }, [])

  return {
    state,
    source: SOURCE,
    error,
    intervene,
    twist,
    setSpeed: (n) => dispatch({ type: 'SET_SPEED', speed: n }),
    togglePause: () => dispatch({ type: 'TOGGLE_PAUSE' }),
    select: (id) => dispatch({ type: 'SELECT', id }),
    reset: () => dispatch({ type: 'RESET' }),
  }
}
