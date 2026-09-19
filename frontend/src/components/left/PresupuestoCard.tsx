import type { CrisisState } from '../../domain/types'
import { fmtEur } from '../../domain/time'

export function PresupuestoCard({ s }: { s: CrisisState }) {
  return (
    <section className="bg-panel border border-line px-4 py-3.5 flex flex-col gap-2">
      <h2 className="label">Coste de recuperación</h2>
      <div className="flex items-baseline gap-2">
        <span className="display font-extrabold text-[22px] tracking-[-0.02em] num text-ink">{s.budget.forecast === null ? 'Sin estimar' : fmtEur(s.budget.forecast)}</span>
        <span className="text-[12px] text-muted">previsto</span>
      </div>
      <span className="text-[11px] text-muted">comprometido {fmtEur(s.budget.committed)}</span>
      <span className="text-[11px] text-muted">Informativo · no bloquea la recuperación del servicio</span>
    </section>
  )
}
