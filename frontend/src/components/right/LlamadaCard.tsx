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
      <section className="bg-panel border border-line rounded-lg px-3 py-3 text-[12px] text-muted flex items-center gap-2">
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
    <section className={`bg-panel border rounded-lg px-3 py-3 ${active ? 'border-cyan/50' : 'border-line'}`}>
      <div className="flex items-center gap-2 text-[12px]">
        {sms ? <MessageSquareText size={14} className="text-cyan" /> : <PhoneCall size={14} className={active ? 'text-cyan' : 'text-muted'} />}
        <span className="font-semibold">{sms ? 'Mensajes' : 'Llamada'} · agente {AGENT_NAME[call.agent]}</span>
        <span className="ml-auto text-[11px] text-muted">
          {call.status === 'en_curso' ? 'en curso' : call.status === 'sin_respuesta' ? 'sin respuesta' : 'terminada'} · vía HappyRobot
        </span>
      </div>
      <div className="text-[11px] text-muted mt-0.5 truncate">{call.counterpart}</div>
      <div className="flex items-center gap-3 mt-2">
        <span className={`w-9 h-9 grid place-items-center rounded-full ${active ? 'bg-cyan/15 text-cyan' : 'bg-white/5 text-muted'} ${active && !sms ? 'pulse-amber' : ''}`} style={active ? { animationName: 'pulse-ring', boxShadow: '0 0 0 0 #22d3ee55' } : undefined}>
          {sms ? <MessageSquareText size={16} /> : <PhoneCall size={16} />}
        </span>
        <div className="flex-1"><Wave active={active && !sms} /></div>
        <span className="text-[13px] num text-muted">{fmtCountdown(Math.min(elapsed, call.endsAfter)).slice(3)}</span>
      </div>
      <div className="mt-2 space-y-1">
        {last.length === 0 && <div className="text-[12px] text-muted italic">Conectando…</div>}
        {last.map((l, i) => (
          <div key={i} className={`text-[12px] leading-snug fade-in ${l.who === 'humano' ? 'text-text' : 'text-cyan/90'}`}>
            <span className="text-muted">{l.who === 'humano' ? (sms ? '' : '👤 ') : '🤖 '}</span>“{l.text}”
          </div>
        ))}
      </div>
      {active && !sms && (
        <button onClick={onTake} className="mt-2 text-[11px] text-muted hover:text-cyan underline underline-offset-2">Hacerme cargo de la conversación</button>
      )}
    </section>
  )
}
