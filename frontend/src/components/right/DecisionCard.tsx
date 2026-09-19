import type { Decision } from '../../domain/types'
import { fmtEur } from '../../domain/time'

export function DecisionCard({ d, onApprove, onReject, disabled }: { d: Decision | null; disabled?: boolean; onApprove: () => void; onReject: () => void }) {
  if (!d || d.kind !== 'operational') return null
  return (
    <section className="bg-panel border border-line border-t-[3px] border-t-amber p-4 flex flex-col gap-2.5 fade-in">
      <div className="flex items-center gap-2.5">
        <h3 className="label text-amber">Decisión pendiente</h3>
        <span className="ml-auto text-[11px] text-muted">requiere responsable</span>
      </div>
      <p className="display font-bold text-[17px] leading-tight m-0">{d.title}</p>
      <p className="text-[12px] text-text/80 leading-relaxed m-0">{d.summary}</p>
      <div className="flex items-baseline gap-2">
        <span className="display font-extrabold text-[26px] leading-none tracking-[-0.02em] num text-ink">{d.cost === null ? 'Sin estimar' : fmtEur(d.cost)}</span>
        <span className="text-[11px] text-muted">coste informativo · decisión operativa</span>
      </div>
      {d.conditions.length > 0 && (
        <ul className="text-[11px] text-amber space-y-0.5">
          {d.conditions.map((c) => <li key={c}>› {c}</li>)}
        </ul>
      )}
      <div className="grid grid-cols-2 gap-3 text-[11px] text-muted leading-snug">
        <div><span className="text-green font-semibold">Si apruebas</span><br />{d.effectApprove}</div>
        <div><span className="text-red font-semibold">Si rechazas</span><br />{d.effectReject}</div>
      </div>
      <div className="mt-1 grid grid-cols-2 gap-2.5">
        <button disabled={disabled} onClick={onApprove} className="chamfer-sm h-10 bg-ink text-bg display font-extrabold text-[12px] tracking-[0.06em] uppercase hover:bg-ink/90">Aprobar</button>
        <button disabled={disabled} onClick={onReject} className="h-10 border border-line-2 text-ink display font-bold text-[12px] tracking-[0.06em] uppercase hover:bg-ink/5">Rechazar</button>
      </div>
    </section>
  )
}
