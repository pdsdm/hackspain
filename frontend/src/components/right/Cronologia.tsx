import { useEffect, useRef } from 'react'
import type { CrisisState } from '../../domain/types'
import { fmtClock } from '../../domain/time'
import { Panel } from '../ui/Panel'
import { EVENT_DOT } from '../ui/status'

export function Cronologia({ s }: { s: CrisisState }) {
  const ref = useRef<HTMLUListElement>(null)
  const n = s.events.length
  useEffect(() => {
    const el = ref.current
    if (el) el.scrollTop = el.scrollHeight
  }, [n])
  const items = s.events.slice(-40)
  return (
    <Panel title="Cronología" right={<span className="text-[11px] text-muted num">{n} eventos</span>} className="flex-1 min-h-[240px]" bodyClass="overflow-hidden p-0 flex-1">
      <ul ref={ref} className="h-full overflow-y-auto px-3 py-2">
        {items.map((e, i) => {
          const latest = i === items.length - 1
          return (
            <li key={e.id} className={`flex gap-2.5 py-1.5 ${latest ? 'fade-in' : ''}`}>
              <span className="flex flex-col items-center pt-1.5">
                <span className={`w-2 h-2 flex-none ${EVENT_DOT[e.kind]} ${latest ? 'animate-pulse' : ''}`} />
                <span className="w-px flex-1 bg-line mt-1" />
              </span>
              <div className="min-w-0">
                <span className="text-[11px] text-muted num mr-2">{fmtClock(e.time)}</span>
                <span className={`text-[12px] ${e.kind === 'fallo' || e.kind === 'incidencia' ? 'text-red/90' : e.kind === 'intervencion' ? 'text-ink font-semibold' : e.kind === 'decision' || e.kind === 'espera' ? 'text-amber' : latest ? 'text-text' : 'text-text/85'}`}>{e.text}</span>
              </div>
            </li>
          )
        })}
      </ul>
    </Panel>
  )
}
