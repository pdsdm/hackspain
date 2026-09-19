import type { CrisisState } from '../../domain/types'
import { kpis } from '../../domain/selectors'
import type { Tone } from '../ui/Pill'
import { Glass } from './Glass'

const TEXT: Record<Tone, string> = { ink: 'text-ink', amber: 'text-amber', red: 'text-red', green: 'text-green', muted: 'text-muted' }
const FILL: Record<Tone, string> = { ink: 'bg-ink', amber: 'bg-amber', red: 'bg-red', green: 'bg-green', muted: 'bg-line-2' }

function Cell({ label, value, total, note, tone }: { label: string; value: number; total: number; note: string; tone: Tone }) {
  const pct = total > 0 ? Math.min(100, Math.round((value / total) * 100)) : 0
  return (
    <div className="flex flex-col gap-1 px-4 py-2.5 min-w-[150px] border-l border-line first:border-l-0">
      <span className="text-[10px] uppercase tracking-[0.08em] text-muted whitespace-nowrap">{label}</span>
      <span className="flex items-baseline gap-1.5">
        <span className="display font-extrabold text-[22px] leading-none tracking-[-0.02em] num">{value}</span>
        <span className="text-[12px] text-muted num">/ {total}</span>
      </span>
      <span className="h-[3px] bg-ink/10 flex"><span className={`transition-all duration-700 ${FILL[tone]}`} style={{ width: `${pct}%` }} /></span>
      <span className={`text-[11px] whitespace-nowrap ${TEXT[tone]}`}>{note}</span>
    </div>
  )
}

export function KpiOverlay({ s }: { s: CrisisState }) {
  const k = kpis(s)
  const pendingSeats = k.total - k.assigned
  const pendingConfirmed = k.total - k.confirmed
  const critical = k.critical.length + k.pendingDecisions
  return (
    <Glass label="Indicadores" className="flex-row">
      <Cell label="Sede asignada" value={k.assigned} total={k.total} note={pendingSeats ? `${pendingSeats} sin sede` : pendingConfirmed ? `${k.confirmed} con plaza confirmada` : s.resolved ? 'plan cerrado' : `${k.critical.length} condiciones abiertas`} tone={pendingSeats ? (k.assigned ? 'amber' : 'red') : s.resolved ? 'green' : 'amber'} />
      <Cell label="Informados" value={k.informed} total={k.total} note={`${k.accepted} aceptan`} tone={k.informed >= k.total ? 'green' : 'ink'} />
      <Cell label="Catering confirmado" value={k.cateringConfirmed} total={k.cateringTotal} note={k.cateringConfirmed >= k.cateringTotal ? 'completo' : `${k.cateringTotal - k.cateringConfirmed} sin confirmar`} tone={k.cateringConfirmed >= k.cateringTotal ? 'green' : k.cateringConfirmed ? 'amber' : 'red'} />
      <Cell label="Shuttles coordinados" value={k.shuttlesOk} total={k.shuttlesTotal} note={critical ? `${critical} ${critical > 1 ? 'condiciones críticas' : 'condición crítica'}` : 'sin condiciones críticas'} tone={k.shuttlesOk >= k.shuttlesTotal ? 'green' : 'amber'} />
    </Glass>
  )
}
