import { PhoneCall, MessageSquareText, PhoneOff } from 'lucide-react'
import type { Call, CrisisState } from '../../domain/types'
import { fmtCountdown } from '../../domain/time'

const AGENT_NAME: Record<string, string> = { espacios: 'Espacios', catering: 'Catering', transporte: 'Transporte', asistentes: 'Asistentes' }

function Wave({ active }: { active: boolean }) {
  return (
    <div className="wave" aria-hidden>
      {Array.from({ length: 18 }).map((_, i) => (
        <i key={i} style={{ animationDelay: `${(i % 6) * 0.11}s`, animationPlayState: active ? 'running' : 'paused', height: active ? undefined : 4 }} />
      ))}
    </div>
  )
}

export function LlamadaCard({ s, call, onTake }: { s: CrisisState; call: Call | null; onTake: () => void }) {
  if (!call) {
    return (
      <section className="bg-panel border border-line px-4 py-3 text-[12px] text-muted flex items-center gap-2">
        <PhoneOff size={14} /> Sin conversaciones en curso
      </section>
    )
  }
  const elapsed = s.clock.simSeconds - call.startedAt
  const active = call.status === 'en_curso'
  const lines = call.transcript.filter((l) => l.at <= elapsed)
  const last = lines.slice(-3)
  const sms = call.channel === 'sms'
  return (
    <section className={`bg-panel border px-4 py-3.5 ${active ? 'border-ink' : 'border-line'}`}>
      <div className="flex items-center gap-2.5">
        {sms ? <MessageSquareText size={14} className="text-ink" /> : <PhoneCall size={14} className={active ? 'text-ink' : 'text-muted'} />}
        <h2 className="label">{sms ? 'Mensajes' : 'Llamada'} · {AGENT_NAME[call.agent]}</h2>
        <span className="ml-auto text-[11px] text-muted">
          {call.status === 'en_curso' ? 'en curso' : call.status === 'sin_respuesta' ? 'sin respuesta' : 'terminada'} · vía HappyRobot
        </span>
      </div>
      <div className="text-[11px] text-muted mt-0.5 truncate">{call.counterpart}</div>
      <div className="flex items-center gap-3 mt-2">
        <div className="flex-1"><Wave active={active && !sms} /></div>
        <span className="text-[13px] num text-muted">{fmtCountdown(Math.min(elapsed, call.endsAfter)).slice(3)}</span>
      </div>
      <div className="mt-2 space-y-1">
        {last.length === 0 && <div className="text-[12px] text-muted italic">Conectando…</div>}
        {last.map((l, i) => (
          <div key={i} className={`text-[12px] leading-snug fade-in ${l.who === 'humano' ? 'text-muted' : 'text-ink pl-2.5 border-l-2 border-line-2'}`}>
            “{l.text}”
          </div>
        ))}
      </div>
      {active && !sms && (
        <button onClick={onTake} className="mt-2.5 text-[11px] text-muted hover:text-ink underline underline-offset-[3px]">Hacerme cargo de la conversación</button>
      )}
    </section>
  )
}
