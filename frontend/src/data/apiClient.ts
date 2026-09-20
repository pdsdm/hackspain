import type { Area, CrisisState, Intervention } from '../domain/types'

const configured = (import.meta.env.VITE_API_URL as string | undefined)?.trim()
const BASE = import.meta.env.DEV
  ? ''
  : (configured || 'http://127.0.0.1:8000').replace('://localhost', '://127.0.0.1')

async function req<T>(path: string, init?: RequestInit): Promise<T> {
  const ctrl = new AbortController()
  const t = setTimeout(() => ctrl.abort(), 8000)
  try {
    const res = await fetch(`${BASE}${path}`, { ...init, signal: ctrl.signal, headers: { 'Content-Type': 'application/json', ...(init?.headers ?? {}) } })
    if (!res.ok) {
      let msg = `HTTP ${res.status}`
      try { msg = ((await res.json()) as { error?: string }).error ?? msg } catch { /* noop */ }
      throw new Error(msg)
    }
    return (await res.json()) as T
  } finally {
    clearTimeout(t)
  }
}

export const api = {
  getState: () => req<CrisisState>('/state'),
  intervene: (intervention: Intervention) => req<{ ok: boolean }>('/interventions', { method: 'POST', body: JSON.stringify(intervention) }),
  clock: (body: { speed?: number; paused?: boolean }) => req<{ ok: boolean; speed: number; paused: boolean }>('/simulation/clock', { method: 'POST', body: JSON.stringify(body) }),
  reset: () => req<{ ok: boolean; runId: string; planVersion: number }>('/simulation/reset', { method: 'POST' }),
  requestCall: (input: { area: Area; counterpart: string; objective: string; commitmentId?: string }) =>
    req<{ ok: boolean; eventId: string }>('/events', { method: 'POST', body: JSON.stringify({
      source: 'human', kind: 'call_request', actorId: 'responsable',
      text: `Llamar a ${input.counterpart}: ${input.objective}`,
      payload: input,
    }) }),
  sendEvent: (text: string) =>
    req<{ ok: boolean; eventId: string }>('/events', { method: 'POST', body: JSON.stringify({ source: 'chat', kind: 'free_text', text }) }),
}
