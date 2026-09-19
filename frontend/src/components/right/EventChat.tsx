import { useId, useState } from 'react'
import { ArrowUp, LoaderCircle, Plus } from 'lucide-react'

const EXAMPLE = 'Un shuttle pincha una rueda de camino al evento'

export function EventChat({
  disabled,
  pending,
  feedback,
  onSend,
  className = 'event-chat',
  placeholder = 'Describe qué está pasando…',
}: {
  disabled: boolean
  pending: boolean
  feedback: string | null
  onSend: (text: string) => Promise<boolean>
  className?: string
  placeholder?: string
}) {
  const [text, setText] = useState('')
  const hintId = useId()
  const submit = async () => {
    const value = text.trim()
    if (!value || disabled || pending) return
    if (await onSend(value)) setText('')
  }
  return (
    <section className={className} aria-label="Comunicar un evento">
      <div className="event-chat-heading"><h3>Comunicar un evento</h3><span>Al coordinador</span></div>
      <form className="event-composer" onSubmit={(e) => { e.preventDefault(); void submit() }}>
        <textarea
          aria-label="Describir un evento"
          aria-describedby={hintId}
          disabled={disabled || pending}
          value={text}
          rows={2}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
              e.preventDefault()
              void submit()
            }
          }}
          placeholder={placeholder}
        />
        <button type="submit" disabled={disabled || pending || !text.trim()} className="event-send" aria-label={pending ? 'Enviando evento' : 'Enviar evento'} title="Enviar evento">
          {pending ? <LoaderCircle size={18} className="animate-spin" /> : <ArrowUp size={20} strokeWidth={2} />}
        </button>
      </form>
      <button type="button" id={hintId} className="event-example" disabled={disabled || pending} onClick={() => setText(EXAMPLE)}>
        <Plus size={13} aria-hidden="true" /><span>Prueba: «{EXAMPLE}»</span>
      </button>
      {feedback && <p role="status" className="event-feedback">{feedback}</p>}
    </section>
  )
}
