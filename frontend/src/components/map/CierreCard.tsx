import { CheckCircle2, AlertTriangle } from 'lucide-react'
import type { CrisisState } from '../../domain/types'
import { kpis } from '../../domain/selectors'
import { Glass } from './Glass'

/**
 * El plano final. Aparece cuando el backend da la crisis por cerrada o cuando se queda sin
 * salida: dice lo conseguido y lo que sigue abierto, sin dar por resuelto lo que no lo está.
 */
export function CierreCard({ s, className = '' }: { s: CrisisState; className?: string }) {
  const stuck = s.coordinatorStatus === 'atascado'
  if (!s.resolved && !stuck) return null
  const k = kpis(s)
  const conditioned = stuck && k.assigned === k.total
  const agreed = s.commitments.filter((c) => c.planVersion === s.planVersion && c.status !== 'invalidado')
  const cost = s.budget.committed > 0 ? s.budget.committed : s.budget.forecast
  return (
    <Glass label="Resultado" className={className}>
      <div className="flex items-center gap-2 px-4 pt-3 pb-1">
        {stuck ? <AlertTriangle size={14} className={conditioned ? 'text-amber' : 'text-red'} /> : <CheckCircle2 size={14} className="text-green" />}
        <span className={`label ${stuck ? conditioned ? 'text-amber' : 'text-red' : 'text-green'}`}>{stuck ? conditioned ? 'Plan condicionado' : 'Plan incompleto' : 'Plan cerrado'} · v{s.planVersion}</span>
      </div>
      {stuck && s.closureSummary && <p className="px-4 pb-2 text-[12px] text-amber">{s.closureSummary}</p>}
      <div className="px-4 pb-3 grid grid-cols-4 gap-3">
        <Stat value={`${k.assigned}/${k.total}`} label="sede asignada" />
        <Stat value={`${k.confirmed}/${k.total}`} label="plaza confirmada" />
        <Stat value={String(agreed.length)} label="acuerdos vigentes" />
        <Stat value={cost ? `${cost.toLocaleString('es-ES')} €` : 'Sin estimar'} label="coste" />
      </div>
      {k.critical.length > 0 && (
        <div className="px-4 pb-3 border-t border-line pt-2">
          <p className="text-[11px] text-muted mb-1">Sigue abierto:</p>
          <ul className="space-y-0.5">
            {k.critical.slice(0, 3).map((c) => (
              <li key={`${c.commitment}-${c.cond}`} className="text-[11px] text-amber">› {c.cond}</li>
            ))}
          </ul>
        </div>
      )}
    </Glass>
  )
}

function Stat({ value, label }: { value: string; label: string }) {
  return (
    <div className="flex flex-col">
      <span className="display font-extrabold text-[18px] leading-none num">{value}</span>
      <span className="text-[10px] uppercase tracking-[0.08em] text-muted">{label}</span>
    </div>
  )
}
