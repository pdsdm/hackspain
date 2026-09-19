import type { CrisisState, Intervention, TwistId } from '../domain/types'

const BASE = (import.meta.env.VITE_API_URL as string | undefined) ?? 'http://localhost:8000'

async function req<T>(path: string, init?: RequestInit): Promise<T> {
  const ctrl = new AbortController()
  const t = setTimeout(() => ctrl.abort(), 4000)
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
  twist: (twist: TwistId) => req<{ ok: boolean }>('/simulation/twists', { method: 'POST', body: JSON.stringify({ twist }) }),
  reset: () => req<{ ok: boolean; runId: string; planVersion: number }>('/simulation/reset', { method: 'POST' }),
}
