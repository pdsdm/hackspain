import { useState, type FormEvent } from 'react'
import { Building2, Bus, Network, Users, Utensils } from 'lucide-react'
import { CONTACT_ROLES, type ContactRole } from '../../domain/types'
import { api } from '../../data/apiClient'

const E164 = /^\+[1-9]\d{7,14}$/

const META: Record<ContactRole, { name: string; hint: string; Icon: typeof Network }> = {
  coordinador: { name: 'Coordinador', hint: 'Número del coordinador de la operación', Icon: Network },
  espacios: { name: 'Espacios', hint: 'Al que llama el agente de espacios', Icon: Building2 },
  catering: { name: 'Catering', hint: 'Al que llama el agente de catering', Icon: Utensils },
  transporte: { name: 'Transporte', hint: 'Al que llama el agente de transporte', Icon: Bus },
  asistentes: { name: 'Asistentes', hint: 'Al que llama el agente de asistentes', Icon: Users },
}

function emptyDraft(): Record<ContactRole, string> {
  return { coordinador: '', espacios: '', catering: '', transporte: '', asistentes: '' }
}

export function OnboardingScreen({
  initial,
  onDone,
}: {
  initial: Record<ContactRole, string | null>
  onDone: () => void
}) {
  const [draft, setDraft] = useState<Record<ContactRole, string>>(() => {
    const next = emptyDraft()
    for (const role of CONTACT_ROLES) next[role] = initial[role] ?? ''
    return next
  })
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const valid = CONTACT_ROLES.every((role) => E164.test(draft[role].trim()))

  const onSubmit = async (event: FormEvent) => {
    event.preventDefault()
    if (!valid) {
      setError('Los cinco números tienen que ir en formato internacional, por ejemplo +34600000000.')
      return
    }
    setPending(true)
    setError(null)
    try {
      const phones = {} as Record<ContactRole, string>
      for (const role of CONTACT_ROLES) phones[role] = draft[role].trim()
      await api.setAgentPhones(phones)
      onDone()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudieron guardar los teléfonos')
    } finally {
      setPending(false)
    }
  }

  return (
    <main className="auth-screen">
      <img src="/brand/zhivel-logo-dark.png" alt="Zhivel" />
      <p className="label">MADRING · Hospitalidad</p>
      <h1>Teléfonos de la operación</h1>
      <p className="auth-lead">
        Cada agente y el coordinador necesitan un número. Sin ellos no se entra al panel.
      </p>
      <form className="auth-form onboarding-form" onSubmit={(e) => void onSubmit(e)}>
        {CONTACT_ROLES.map((role) => {
          const meta = META[role]
          const Icon = meta.Icon
          const value = draft[role]
          const ok = value.trim() === '' || E164.test(value.trim())
          return (
            <label key={role}>
              <span className="onboarding-role"><Icon size={12} aria-hidden="true" /> {meta.name}</span>
              <input
                type="tel"
                inputMode="tel"
                name={role}
                autoComplete="tel"
                required
                value={value}
                placeholder="+34600000000"
                aria-invalid={!ok}
                onChange={(e) => {
                  setDraft((current) => ({ ...current, [role]: e.target.value }))
                  setError(null)
                }}
              />
              <span className={`onboarding-hint${ok ? '' : ' is-bad'}`}>{ok ? meta.hint : 'Formato E.164: + y 8 a 15 dígitos'}</span>
            </label>
          )
        })}
        <button type="submit" className="primary-button auth-submit" disabled={pending || !valid}>
          {pending ? 'Guardando…' : 'Entrar al panel'}
        </button>
      </form>
      {error && <p className="auth-error" role="alert">{error}</p>}
    </main>
  )
}
