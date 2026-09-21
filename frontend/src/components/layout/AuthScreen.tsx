import { useEffect, useRef, useState, type FormEvent } from 'react'
import { useAuth } from '../../data/useAuth'
import type { AuthPurpose } from '../../data/apiClient'

export function AuthScreen() {
  const auth = useAuth()
  const [purpose, setPurpose] = useState<AuthPurpose>('login')
  const [step, setStep] = useState<'email' | 'code'>('email')
  const [email, setEmail] = useState('')
  const [code, setCode] = useState('')
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [info, setInfo] = useState<string | null>(null)
  const [wait, setWait] = useState(0)
  const codeRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (step === 'code') codeRef.current?.focus()
  }, [step])

  useEffect(() => {
    if (wait <= 0) return
    const timer = setTimeout(() => setWait((n) => n - 1), 1000)
    return () => clearTimeout(timer)
  }, [wait])

  const sendCode = async (target = email, nextPurpose = purpose) => {
    setPending(true)
    setError(null)
    setInfo(null)
    try {
      const result = await auth.requestCode(target, nextPurpose)
      setStep('code')
      setWait(60)
      setInfo(result.code
        ? `Modo local: tu código es ${result.code}`
        : `Te hemos enviado un código de 6 dígitos a ${target.trim().toLowerCase()}`)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo enviar el código')
    } finally {
      setPending(false)
    }
  }

  const onEmail = (event: FormEvent) => {
    event.preventDefault()
    void sendCode()
  }

  const onCode = async (event: FormEvent) => {
    event.preventDefault()
    setPending(true)
    setError(null)
    try {
      await auth.verify(email, code)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo verificar el código')
    } finally {
      setPending(false)
    }
  }

  const switchPurpose = (next: AuthPurpose) => {
    setPurpose(next)
    setStep('email')
    setCode('')
    setError(null)
    setInfo(null)
  }

  return (
    <main className="auth-screen">
      <img src="/brand/zhivel-logo-dark.png" alt="Zhivel" />
      <p className="label">MADRING · Hospitalidad</p>
      <h1>{purpose === 'login' ? 'Entrar' : 'Crear cuenta'}</h1>
      <p className="auth-lead">
        {purpose === 'login'
          ? 'Te enviamos un código de 6 dígitos al correo. Sin contraseña.'
          : 'Regístrate con tu correo. Te llega un código de 6 dígitos para confirmar.'}
      </p>

      <div className="auth-tabs" role="tablist">
        <button type="button" role="tab" aria-selected={purpose === 'login'} className={purpose === 'login' ? 'is-active' : ''} onClick={() => switchPurpose('login')}>Entrar</button>
        <button type="button" role="tab" aria-selected={purpose === 'register'} className={purpose === 'register' ? 'is-active' : ''} onClick={() => switchPurpose('register')}>Crear cuenta</button>
      </div>

      {step === 'email' ? (
        <form className="auth-form" onSubmit={onEmail}>
          <label>
            Correo
            <input
              type="email"
              name="email"
              autoComplete="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="tu@correo.com"
            />
          </label>
          <button type="submit" className="primary-button auth-submit" disabled={pending || !email.trim()}>
            {pending ? 'Enviando…' : 'Enviar código'}
          </button>
        </form>
      ) : (
        <form className="auth-form" onSubmit={(e) => void onCode(e)}>
          <p className="auth-email-line">{email}</p>
          <label>
            Código de 6 dígitos
            <input
              ref={codeRef}
              className="auth-code num"
              inputMode="numeric"
              autoComplete="one-time-code"
              pattern="\d{6}"
              maxLength={6}
              required
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
              placeholder=""
            />
          </label>
          <button type="submit" className="primary-button auth-submit" disabled={pending || code.length !== 6}>
            {pending ? 'Comprobando…' : purpose === 'login' ? 'Entrar' : 'Crear cuenta'}
          </button>
          <div className="auth-resend">
            <button type="button" onClick={() => { setStep('email'); setCode(''); setError(null) }}>Cambiar correo</button>
            <button type="button" disabled={pending || wait > 0} onClick={() => void sendCode()}>
              {wait > 0 ? `Reenviar en ${wait}s` : 'Reenviar código'}
            </button>
          </div>
        </form>
      )}

      {info && <p className="auth-info">{info}</p>}
      {error && <p className="auth-error" role="alert">{error}</p>}
    </main>
  )
}
