import type { CrisisState } from '../../domain/types'
import { kpis } from '../../domain/selectors'
import type { Tone } from '../ui/Pill'

const TEXT: Record<Tone, string> = { ink: 'text-ink', amber: 'text-amber', red: 'text-red', green: 'text-green', muted: 'text-muted' }
const FILL: Record<Tone, string> = { ink: 'bg-ink', amber: 'bg-amber', red: 'bg-red', green: 'bg-green', muted: 'bg-line-2' }

function Tile({ label, value, previous, total, note, tone }: { label: string; value: number; previous?: number; total: number; note?: string; tone: Tone }) {
  const pct = total > 0 ? Math.min(100, Math.round((value / total) * 100)) : 0
  return (
    <div className="bg-panel border border-line px-4 py-3.5 flex flex-col gap-2 min-w-0">
      <span className="text-[11px] uppercase tracking-[0.08em] text-muted">{label}</span>
      <span className="flex items-baseline gap-1.5">
        <span className="display font-extrabold text-[28px] leading-none tracking-[-0.02em] num">{value}</span>
        <span className="text-[13px] text-muted num">/ {total}</span>
      </span>
      <span className="h-1 bg-line flex"><span className={`transition-all duration-700 ${FILL[tone]}`} style={{ width: `${pct}%` }} /></span>
      <span className={`text-[11px] ${TEXT[tone]}`}>{note ?? '\u00a0'}</span>
      {previous !== undefined && <span className={`metric-delta ${value > previous ? 'text-green' : value < previous ? 'text-red' : 'text-muted'}`}>{previous} → {value} <strong>{value === previous ? 'sin cambio' : `${value > previous ? '+' : '−'}${Math.abs(value - previous)}`}</strong></span>}
    </div>
  )
}

export function EstadoGlobal({ s, reference }: { s: CrisisState; reference: CrisisState | null }) {
  const k = kpis(s)
  const previous = reference ? kpis(reference) : null
  const pendingSeats = k.total - k.confirmed
  return (
    <section className="grid grid-cols-2 xl:grid-cols-4 gap-3 flex-none" aria-label="Indicadores y cambios">
      <Tile label="Ubicación confirmada" previous={previous?.confirmed} value={k.confirmed} total={k.total} note={pendingSeats ? `${pendingSeats} sin plaza` : 'completo'} tone={pendingSeats ? (k.confirmed ? 'amber' : 'red') : 'green'} />
      <Tile label="Informados" previous={previous?.informed} value={k.informed} total={k.total} note={`${k.accepted} aceptan`} tone={k.informed >= k.total ? 'green' : 'ink'} />
      <Tile label="Catering confirmado" previous={previous?.cateringConfirmed} value={k.cateringConfirmed} total={k.cateringTotal} note={k.cateringConfirmed >= k.cateringTotal ? 'completo' : `${k.cateringTotal - k.cateringConfirmed} sin confirmar`} tone={k.cateringConfirmed >= k.cateringTotal ? 'green' : k.cateringConfirmed ? 'amber' : 'red'} />
      <Tile label="Shuttles coordinados" previous={previous?.shuttlesOk} value={k.shuttlesOk} total={k.shuttlesTotal} note={k.critical.length + k.pendingDecisions ? `${k.critical.length + k.pendingDecisions} ${k.critical.length + k.pendingDecisions > 1 ? 'condiciones' : 'condición'} crítica${k.critical.length + k.pendingDecisions > 1 ? 's' : ''}` : 'sin condiciones críticas'} tone={k.shuttlesOk >= k.shuttlesTotal ? 'green' : 'amber'} />
    </section>
  )
}
