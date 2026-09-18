import type { CrisisState } from '../../domain/types'
import { fmtEur } from '../../domain/time'

export function PresupuestoCard({ s }: { s: CrisisState }) {
  const over = s.budget.forecast > s.budget.authorized
  const pct = s.budget.authorized > 0 ? Math.min(100, Math.round((s.budget.forecast / s.budget.authorized) * 100)) : 0
  return (
    <section className="bg-panel border border-line px-4 py-3.5 flex flex-col gap-2">
      <h2 className="label">Presupuesto</h2>
      <div className="flex items-baseline gap-2">
        <span className={`display font-extrabold text-[22px] tracking-[-0.02em] num ${over ? 'text-red' : 'text-ink'}`}>{fmtEur(s.budget.forecast)}</span>
        <span className="text-[12px] text-muted">de {fmtEur(s.budget.authorized)} autorizados</span>
      </div>
      <div className="h-1 bg-line flex">
        <span className={over ? 'bg-red' : 'bg-ink'} style={{ width: `${pct}%` }} />
      </div>
      <span className="text-[11px] text-muted">comprometido {fmtEur(s.budget.committed)}{over ? ' · supera el límite' : ''}</span>
    </section>
  )
}
