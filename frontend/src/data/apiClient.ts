import type { Area, ContactRole, CrisisState, Intervention } from '../domain/types'

const configured = (import.meta.env.VITE_API_URL as string | undefined)?.trim()
const BASE = import.meta.env.DEV
  ? ''
  : (configured || 'http://127.0.0.1:8000').replace('://localhost', '://127.0.0.1')

const TOKEN_KEY = 'zhivel.auth.token'

export function getAuthToken(): string | null {
  return localStorage.getItem(TOKEN_KEY)
}

export function setAuthToken(token: string | null): void {
  if (token) localStorage.setItem(TOKEN_KEY, token)
  else localStorage.removeItem(TOKEN_KEY)
}

export type AuthPurpose = 'register' | 'login'
export type AuthUser = { id: string; email: string }

async function req<T>(path: string, init?: RequestInit, timeoutMs = 8000): Promise<T> {
  const ctrl = new AbortController()
  const t = setTimeout(() => ctrl.abort(), timeoutMs)
  const token = getAuthToken()
  try {
    const res = await fetch(`${BASE}${path}`, {
      ...init,
      signal: ctrl.signal,
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...(init?.headers ?? {}),
      },
    })
    if (res.status === 401) {
      if (token) setAuthToken(null)
      if (token && !path.startsWith('/auth/')) {
        window.dispatchEvent(new Event('zhivel-auth-expired'))
      }
    }
    if (!res.ok) {
      let msg = `HTTP ${res.status}`
      try { msg = ((await res.json()) as { error?: string }).error ?? msg } catch { /* noop */ }
      throw new Error(msg)
    }
    if (res.status === 204) return undefined as T
    return (await res.json()) as T
  } finally {
    clearTimeout(t)
  }
}

export const api = {
  getState: () => req<CrisisState>('/state'),
  getAuthConfig: () => req<{ required: boolean }>('/auth/config'),
  getMe: () => req<{ user: AuthUser }>('/auth/me'),
  requestCode: (email: string, purpose: AuthPurpose) =>
    req<{ ok: true; expiresInSeconds: number; code?: string }>('/auth/request-code', {
      method: 'POST',
      body: JSON.stringify({ email, purpose }),
    }, 15000),
  verifyCode: (email: string, code: string) =>
    req<{ token: string; user: AuthUser }>('/auth/verify', {
      method: 'POST',
      body: JSON.stringify({ email, code }),
    }),
  logout: async () => {
    try { await req<{ ok: boolean }>('/auth/logout', { method: 'POST' }) } catch { /* sesión ya inválida */ }
    setAuthToken(null)
  },
  intervene: (intervention: Intervention) => req<{ ok: boolean }>('/interventions', { method: 'POST', body: JSON.stringify(intervention) }),
  clock: (body: { speed?: number; paused?: boolean }) => req<{ ok: boolean; speed: number; paused: boolean }>('/simulation/clock', { method: 'POST', body: JSON.stringify(body) }),
  reset: () => req<{ ok: boolean; runId: string; planVersion: number }>('/simulation/reset', { method: 'POST' }),
  requestCall: (input: { area: Area; counterpart: string; objective: string; commitmentId?: string }) =>
    req<{ ok: boolean; eventId: string }>('/events', { method: 'POST', body: JSON.stringify({
      source: 'human', kind: 'call_request', actorId: 'responsable',
      text: `Llamar a ${input.counterpart}: ${input.objective}`,
      payload: input,
    }) }),
  setAgentPhone: (area: ContactRole, phone: string | null) =>
    req<{ ok: boolean; area: ContactRole; phone: string | null }>(`/agents/${area}/phone`, {
      method: 'POST',
      body: JSON.stringify({ phone }),
    }),
  getAgentPhones: () => req<{ phones: Record<ContactRole, string | null>; complete: boolean }>('/agents/phones'),
  setAgentPhones: (phones: Record<ContactRole, string>) =>
    req<{ ok: true; phones: Record<ContactRole, string | null>; complete: boolean }>('/agents/phones', {
      method: 'POST',
      body: JSON.stringify(phones),
    }),
  sendEvent: (text: string) =>
    req<{ ok: boolean; eventId: string }>('/events', { method: 'POST', body: JSON.stringify({ source: 'chat', kind: 'free_text', text }) }),
}
