import { useCallback, useEffect, useState } from 'react'
import App from '../../App'
import { api } from '../../data/apiClient'
import { useAuth } from '../../data/useAuth'
import type { ContactRole } from '../../domain/types'
import { AuthScreen } from './AuthScreen'
import { OnboardingScreen } from './OnboardingScreen'

const EMPTY: Record<ContactRole, string | null> = {
  coordinador: null,
  espacios: null,
  catering: null,
  transporte: null,
  asistentes: null,
}

export function AuthGate() {
  const auth = useAuth()
  const [phonesLoading, setPhonesLoading] = useState(true)
  const [complete, setComplete] = useState(false)
  const [phones, setPhones] = useState(EMPTY)

  const loadPhones = useCallback(async () => {
    setPhonesLoading(true)
    try {
      const snapshot = await api.getAgentPhones()
      setPhones(snapshot.phones)
      setComplete(snapshot.complete)
    } catch {
      setComplete(false)
    } finally {
      setPhonesLoading(false)
    }
  }, [])

  const readyForPhones = !auth.loading && (!auth.required || Boolean(auth.user))
  useEffect(() => {
    if (!readyForPhones) return
    void loadPhones()
  }, [readyForPhones, loadPhones])

  if (auth.loading || (readyForPhones && phonesLoading)) {
    return (
      <main className="connection-screen">
        <img src="/brand/zhivel-logo-dark.png" alt="Zhivel" />
        <h1>Conectando</h1>
        <p>Comprobando la sesión…</p>
      </main>
    )
  }
  if (auth.required && !auth.user) return <AuthScreen />
  if (!complete) return <OnboardingScreen initial={phones} onDone={() => setComplete(true)} />
  return <App />
}
