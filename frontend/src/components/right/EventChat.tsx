import { useState } from 'react'
import { Send } from 'lucide-react'

export function EventChat({
  disabled,
  pending,
  feedback,
  onSend,
  className = 'bg-panel border border-line p-3',
  placeholder = 'p. ej. no se puede entrar por el Acceso Sur',
}: {
  disabled: boolean
  pending: boolean
  feedback: string | null
  onSend: (text: string) => Promise<boolean>
  className?: string
  placeholder?: string
}) {
  const [text, setText] = useState('')
  const submit = async () => {
    const value = text.trim()
    if (!value || disabled || pending) return
    if (await onSend(value)) setText('')
  }
  return (
    <section className={className}>
      <h3 className="label mb-2">Evento libre</h3>
      <div className="flex gap-2">
        <input
          aria-label="Describir un evento"
          disabled={disabled || pending}
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') void submit() }}
          placeholder={placeholder}
          className="min-w-0 flex-1 h-9 px-2 bg-bg border border-line text-[12px] outline-none focus:border-ink"
        />
        <button
          disabled={disabled || pending || !text.trim()}
          onClick={() => void submit()}
          className="h-9 px-3 border border-ink text-ink disabled:opacity-40"
          aria-label="Enviar evento"
        >
          <Send size={14} />
        </button>
      </div>
      {feedback && <p role="status" className="mt-2 text-[11px] text-muted">{feedback}</p>}
    </section>
  )
}
