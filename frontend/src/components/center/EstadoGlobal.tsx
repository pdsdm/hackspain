import { Users, MessageSquareCheck, UtensilsCrossed, Bus, Euro, ShieldAlert } from 'lucide-react'
import type { CrisisState } from '../../domain/types'
import { kpis } from '../../domain/selectors'
import { fmtEur } from '../../domain/time'
import { StatBar } from '../ui/StatBar'
import type { Tone } from '../ui/Pill'

function Tile({ icon: I, label, value, sub, bar, tone }: { icon: typeof Users; label: string; value: string; sub?: string; bar?: [number, number]; tone: Tone }) {
  const color = { cyan: 'text-cyan', amber: 'text-amber', red: 'text-red', green: 'text-green', muted: 'text-muted' }[tone]
  return (
    <div className="flex gap-3 min-w-0">
      <span className={`w-10 h-10 grid place-items-center rounded-md bg-panel-2 border border-line flex-none ${color}`}><I size={19} /></span>
      <div className="min-w-0 flex-1">
        <div className="text-[20px] font-bold leading-none num">{value}</div>
        <div className="text-[11px] text-muted mt-1 leading-tight">{label}{sub ? <span className={`${color}`}> · {sub}</span> : null}</div>
        {bar && <div className="mt-1.5"><StatBar value={bar[0]} max={bar[1]} tone={tone} /></div>}
      </div>
    </div>
  )
}

export function EstadoGlobal({ s }: { s: CrisisState }) {
  const k = kpis(s)
  const pendingSeats = k.total - k.confirmed
  const overBudget = s.budget.forecast > s.budget.authorized
  return (
    <section className="bg-panel border border-line rounded-lg px-4 py-3">
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-[11px] font-semibold uppercase tracking-[0.12em] text-muted">Estado operativo global</h2>
        <span className="text-[11px] text-muted">Confirmado ≠ informado · cada cifra remonta a una evidencia</span>
      </div>
      <div className="grid grid-cols-3 xl:grid-cols-6 gap-x-5 gap-y-4">
        <Tile icon={Users} label="ubicación confirmada" value={`${k.confirmed}/${k.total}`} sub={pendingSeats ? `${pendingSeats} sin plaza` : 'completo'} bar={[k.confirmed, k.total]} tone={pendingSeats ? (k.confirmed ? 'amber' : 'red') : 'green'} />
        <Tile icon={MessageSquareCheck} label="informados (entrega verif.)" value={`${k.informed}/${k.total}`} sub={`${k.accepted} aceptan`} bar={[k.informed, k.total]} tone={k.informed >= k.total ? 'green' : 'cyan'} />
        <Tile icon={UtensilsCrossed} label="catering confirmado" value={`${k.cateringConfirmed}/${k.cateringTotal}`} bar={[k.cateringConfirmed, k.cateringTotal]} tone={k.cateringConfirmed >= k.cateringTotal ? 'green' : k.cateringConfirmed ? 'amber' : 'red'} />
        <Tile icon={Bus} label="grupos llegada coordinada" value={`${k.shuttlesOk}/${k.shuttlesTotal}`} bar={[k.shuttlesOk, k.shuttlesTotal]} tone={k.shuttlesOk >= k.shuttlesTotal ? 'green' : 'amber'} />
        <Tile icon={Euro} label={`previsto · compr. ${fmtEur(s.budget.committed)}`} value={fmtEur(s.budget.forecast)} sub={`autorizado ${fmtEur(s.budget.authorized)}`} bar={[s.budget.committed, s.budget.contingency]} tone={overBudget ? 'red' : 'cyan'} />
        <Tile icon={ShieldAlert} label="condiciones críticas" value={String(k.critical.length + k.pendingDecisions)} sub={k.pendingDecisions ? `${k.pendingDecisions} decisión` : undefined} tone={k.critical.length + k.pendingDecisions === 0 ? 'green' : 'amber'} />
      </div>
    </section>
  )
}
