import { Scale, Check, X } from 'lucide-react'
import type { Decision } from '../../domain/types'
import { fmtEur } from '../../domain/time'

export function DecisionCard({ d, authorized, onApprove, onReject }: { d: Decision | null; authorized: number; onApprove: () => void; onReject: () => void }) {
  if (!d) return null
  const over = d.cost > authorized
  return (
    <section className="bg-panel border border-amber/60 rounded-lg px-3 py-3 pulse-amber fade-in">
      <div className="flex items-center gap-2">
        <Scale size={15} className="text-amber" />
        <h3 className="font-semibold">Decisión pendiente</h3>
        <span className="ml-auto text-[11px] text-amber">requiere responsable</span>
      </div>
      <div className="mt-1.5 font-medium">{d.title}</div>
      <p className="text-[12px] text-text/80 mt-1">{d.summary}</p>
      <div className="mt-2 flex items-baseline gap-2">
        <span className={`text-[20px] font-bold num ${over ? 'text-amber' : 'text-green'}`}>{fmtEur(d.cost)}</span>
        <span className="text-[11px] text-muted">límite autorizado {fmtEur(authorized)}{over ? ' · supera el límite' : ''}</span>
      </div>
      {d.conditions.length > 0 && (
        <ul className="mt-2 text-[11px] text-amber/90 space-y-0.5">
          {d.conditions.map((c) => <li key={c}>› {c}</li>)}
        </ul>
      )}
      <div className="mt-2 grid grid-cols-2 gap-2 text-[11px] text-muted">
        <div><span className="text-green">Si apruebas:</span> {d.effectApprove}</div>
        <div><span className="text-red">Si rechazas:</span> {d.effectReject}</div>
      </div>
      <div className="mt-3 flex gap-2">
        <button onClick={onApprove} className="flex-1 h-9 rounded-md bg-green/15 border border-green/50 text-green font-semibold hover:bg-green/25 flex items-center justify-center gap-1.5"><Check size={15} /> Aprobar</button>
        <button onClick={onReject} className="flex-1 h-9 rounded-md bg-red/10 border border-red/50 text-red font-semibold hover:bg-red/20 flex items-center justify-center gap-1.5"><X size={15} /> Rechazar</button>
      </div>
    </section>
  )
}
