import { createContext, createElement, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import { api, getAuthToken, setAuthToken, type AuthPurpose, type AuthUser } from './apiClient'

interface AuthState {
  loading: boolean
  required: boolean
  user: AuthUser | null
  requestCode: (email: string, purpose: AuthPurpose) => Promise<{ code?: string }>
  verify: (email: string, code: string) => Promise<void>
  logout: () => Promise<void>
}

const AuthContext = createContext<AuthState | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [loading, setLoading] = useState(true)
  const [required, setRequired] = useState(false)
  const [user, setUser] = useState<AuthUser | null>(null)

  const restore = useCallback(async () => {
    try {
      const config = await api.getAuthConfig()
      setRequired(config.required)
      if (!config.required) {
        setUser(null)
        return
      }
      if (!getAuthToken()) {
        setUser(null)
        return
      }
      try {
        const me = await api.getMe()
        setUser(me.user)
      } catch {
        setAuthToken(null)
        setUser(null)
      }
    } catch {
      setRequired(false)
      setUser(null)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { void restore() }, [restore])
  useEffect(() => {
    const onExpired = () => {
      setUser(null)
      setRequired(true)
    }
    window.addEventListener('zhivel-auth-expired', onExpired)
    return () => window.removeEventListener('zhivel-auth-expired', onExpired)
  }, [])

  const value = useMemo(() => ({
    loading,
    required,
    user,
    requestCode: async (email: string, purpose: AuthPurpose) => {
      const result = await api.requestCode(email, purpose)
      return result.code ? { code: result.code } : {}
    },
    verify: async (email: string, code: string) => {
      const session = await api.verifyCode(email, code)
      setAuthToken(session.token)
      setUser(session.user)
    },
    logout: async () => {
      await api.logout()
      setUser(null)
    },
  }), [loading, required, user])

  return createElement(AuthContext, { value }, children)
}

export function useAuth(): AuthState {
  const value = useContext(AuthContext)
  if (!value) throw new Error('useAuth fuera de AuthProvider')
  return value
}
