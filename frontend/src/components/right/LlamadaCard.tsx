import { PhoneCall, MessageSquareText, PhoneOff } from 'lucide-react'
import type { Call, CrisisState } from '../../domain/types'
import { fmtElapsed } from '../../domain/time'
import { callCapSeconds } from '../../domain/helpers'

const AGENT_NAME: Record<string, string> = { espacios: 'Espacios', catering: 'Catering', transporte: 'Transporte', asistentes: 'Asistentes' }

/** Antes de esto, una llamada real todavía está marcando: no hay nada que esperar aún. */
const DIALING_SECONDS = 8

function Wave({ active }: { active: boolean }) {
  return (
    <div className="wave" aria-hidden>
      {Array.from({ length: 18 }).map((_, i) => (
        <i key={i} style={{ animationDelay: `${(i % 6) * 0.11}s`, animationPlayState: active ? 'running' : 'paused', height: active ? undefined : 4 }} />
      ))}
    </div>
  )
}

export function LlamadaCard({ s, call, onTake, disabled, className = '' }: { s: CrisisState; call: Call | null; onTake: () => void; disabled?: boolean; className?: string }) {
  if (!call) return null
  const elapsed = Math.max(0, s.clock.simSeconds - call.startedAt)
  const active = call.status === 'en_curso'
  const simulated = s.simulated || call.simulated
  const sms = call.channel === 'sms'

  const visible = active && simulated ? call.transcript.filter((l) => l.at <= elapsed) : call.transcript
  const lines = active ? visible.slice(-3) : visible

  // El techo esperado marca cuándo la llamada se está alargando de más. En las simuladas
  // lo fija el propio backend; en las reales, el timeout que acaba en no_answer.
  const expected = Math.max(1, callCapSeconds(s, call))
  const overrun = active && elapsed > expected
  const pct = Math.min(100, Math.round((elapsed / expected) * 100))

  const title = active
    ? (sms ? 'Mensajes en curso' : 'Llamada en curso')
    : (sms ? 'Mensajes finalizados' : 'Llamada finalizada')

  // Una llamada real no trae transcripción hasta que vuelve el callback, así que sin esto
  // el panel se quedaba en «Conectando…» todo el rato sin decir qué se está esperando.
  const waiting = elapsed < DIALING_SECONDS
    ? (sms ? 'Enviando…' : 'Marcando…')
    : simulated
      ? (sms ? 'Esperando respuesta…' : 'Hablando…')
      : 'Esperando a que conteste · la transcripción llega al cerrar la llamada'

  const outcome = s.agents.find((a) => a.id === call.agent)?.lastResult
  const noAnswer = call.status === 'sin_respuesta'

  return (
    <section className={`glass px-4 py-3.5 fade-in ${className}`}>
      <div className="flex items-center gap-2.5">
        <span className={`w-2 h-2 flex-none ${active ? (overrun ? 'bg-amber animate-pulse' : 'bg-green animate-pulse') : noAnswer ? 'bg-red' : 'bg-muted'}`} />
        {noAnswer ? <PhoneOff size={14} className="text-red" /> : sms ? <MessageSquareText size={14} className="text-ink" /> : <PhoneCall size={14} className="text-ink" />}
        <h2 className="label text-ink truncate">{title} · {AGENT_NAME[call.agent]}</h2>
        <span className={`ml-auto flex-none text-[11px] ${simulated ? 'text-muted' : 'text-ink'}`}>{simulated ? 'simulada' : 'vía HappyRobot'}</span>
      </div>
      <div className="text-[11px] text-muted mt-0.5 truncate">{call.counterpart}</div>

      {active && (
        <>
          <div className="flex items-center gap-3 mt-2">
            <div className="flex-1 min-w-0"><Wave active={!sms} /></div>
            <span
              role="timer"
              aria-live="off"
              aria-label={`Duración de la llamada: ${elapsed} segundos`}
              className={`text-[15px] num font-semibold tabular-nums ${overrun ? 'text-amber' : 'text-ink'}`}
            >
              {fmtElapsed(elapsed)}
            </span>
          </div>
          {/* Cuánto queda antes de darla por perdida. Sin esto, 00:47 no dice nada. */}
          <div className="h-1 bg-line flex mt-1.5" aria-hidden>
            <div
              className={`h-full transition-all duration-700 ${overrun ? 'bg-amber' : 'bg-green'}`}
              style={{ width: `${pct}%` }}
            />
          </div>
          {overrun && (
            <div className="text-[11px] text-amber mt-1">Se está alargando · sin respuesta a los {fmtElapsed(expected)}</div>
          )}
        </>
      )}

      <div className="mt-2 space-y-1 max-h-40 overflow-y-auto">
        {lines.length === 0 && (
          <div className="text-[12px] text-muted italic">{active ? waiting : 'Sin transcripción'}</div>
        )}
        {lines.map((l, i) => (
          <div key={`${l.who}-${l.at}-${i}`} className={`text-[12px] leading-snug fade-in ${l.who === 'humano' ? 'text-muted' : 'text-ink pl-2.5 border-l-2 border-line-2'}`}>
            “{l.text}”
          </div>
        ))}
      </div>

      {/* Al cerrar, lo que importa no es la duración sino en qué quedó. */}
      {!active && outcome && (
        <div className={`text-[12px] mt-2 pt-2 border-t border-line ${noAnswer ? 'text-red' : 'text-ink'}`}>
          {noAnswer ? 'Sin respuesta · ' : ''}{outcome}
        </div>
      )}

      {active && !sms && (
        <button disabled={disabled} onClick={onTake} className="mt-2.5 text-[11px] text-muted hover:text-ink underline underline-offset-[3px] disabled:opacity-40">Hacerme cargo de la conversación</button>
      )}
    </section>
  )
}
