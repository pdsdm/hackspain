import { useEffect, useRef, type ReactNode } from 'react'
import type { CrisisState } from '../../domain/types'
import { fmtClock } from '../../domain/time'
import { EVENT_DOT } from '../ui/status'
import { Glass } from './Glass'

const BORDER: Record<string, string> = { 'bg-red': '#e5484d', 'bg-amber': '#c47a00', 'bg-green': '#1f9d55', 'bg-ink': '#1a1d24', 'bg-line-2': '#b8b8b2', 'bg-muted': '#6b7079' }

export function CronologiaChat({ s, className = 'w-[460px] h-[230px]', footer }: { s: CrisisState; className?: string; footer?: ReactNode }) {
  const ref = useRef<HTMLUListElement>(null)
  const n = s.events.length
  useEffect(() => {
    const el = ref.current
    if (el) el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' })
  }, [n])
  const items = s.events.slice(-40)
  return (
    <Glass label="Cronología" className={className}>
      <header className="flex items-center justify-between px-4 py-2 border-b border-line">
        <h2 className="label">Cronología</h2>
        <span className="text-[11px] text-muted num">{n} eventos</span>
      </header>
      <ul ref={ref} className="chat-log flex-1 min-h-0 overflow-y-auto px-3 pt-8 pb-2 flex flex-col">
        {items.map((e, i) => {
          const latest = i === items.length - 1
          const dot = EVENT_DOT[e.kind] ?? 'bg-ink'
          return (
            <li key={e.id} className={`chat-msg ${latest ? 'fade-in' : ''}`} style={{ borderLeftColor: BORDER[dot] ?? '#1a1d24' }}>
              <span className="text-[11px] text-muted num flex-none">{fmtClock(e.time)}</span>
              <span className={`text-[12px] leading-snug ${e.kind === 'fallo' || e.kind === 'incidencia' ? 'text-red/90' : e.kind === 'intervencion' ? 'text-ink font-semibold' : e.kind === 'decision' || e.kind === 'espera' ? 'text-amber' : 'text-text'}`}>{e.text}</span>
            </li>
          )
        })}
      </ul>
      {footer}
    </Glass>
  )
}
