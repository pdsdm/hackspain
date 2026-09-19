import type { CrisisState } from '../../domain/types'
import { attendance } from '../../domain/selectors'
import { Glass } from './Glass'

const fmt = (n: number) => Math.round(n).toLocaleString('es-ES')

export function AforoOverlay({ s }: { s: CrisisState }) {
  const a = attendance(s)
  const pct = a.expected > 0 ? Math.min(100, Math.round((a.entered / a.expected) * 100)) : 0
  return (
    <Glass label="Aforo del circuito" className="w-[300px]">
      <header className="flex items-center justify-between px-4 py-2.5 border-b border-line">
        <h2 className="label">Aforo del circuito</h2>
        <span className={`text-[10px] uppercase tracking-[0.08em] ${a.saturated ? 'text-amber' : 'text-muted'}`}>{a.saturated ? `${a.saturated} puerta${a.saturated > 1 ? 's' : ''} saturada${a.saturated > 1 ? 's' : ''}` : 'flujo normal'}</span>
      </header>
      <div className="px-4 py-2.5 flex flex-col gap-1.5 border-b border-line">
        <div className="flex items-baseline gap-2">
          <span className="display font-extrabold text-[22px] tracking-[-0.02em] num">{fmt(a.entered)}</span>
          <span className="text-[11px] text-muted num">de {fmt(a.expected)} previstos · {fmt(a.waiting)} en cola</span>
        </div>
        <div className="h-[3px] bg-ink/10 flex"><span className="bg-ink transition-all duration-700" style={{ width: `${pct}%` }} /></div>
      </div>
      <ul>
        {s.gates.map((g) => {
          const sat = g.status === 'saturado'
          return (
            <li key={g.id} className="flex items-center gap-3 px-4 py-2 border-b border-line last:border-0">
              <span className={`w-2 h-2 flex-none ${g.status === 'cerrado' ? 'bg-red' : sat ? 'bg-amber' : 'bg-green'}`} />
              <span className="flex-1 min-w-0 flex flex-col">
                <span className="text-[12px] font-semibold truncate">{g.name}</span>
                <span className="text-[11px] text-muted num">{fmt(g.entered)} dentro · {fmt(g.throughputPerMin)}/min</span>
              </span>
              <span className={`display font-bold text-[13px] num ${sat ? 'text-amber' : 'text-ink'}`}>{fmt(g.waiting)} <span className="text-[10px] font-semibold text-muted uppercase tracking-[0.08em]">cola</span></span>
            </li>
          )
        })}
      </ul>
    </Glass>
  )
}
