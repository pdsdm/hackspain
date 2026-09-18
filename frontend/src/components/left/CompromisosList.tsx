import { CheckCircle2, Clock, XCircle, PhoneCall, CircleDashed, PlayCircle } from 'lucide-react'
import type { Commitment, CommitmentStatus, CrisisState } from '../../domain/types'
import { Panel } from '../ui/Panel'
import { COMMITMENT } from '../ui/status'

const ICON: Record<CommitmentStatus, { I: typeof CheckCircle2; cls: string }> = {
  propuesto: { I: CircleDashed, cls: 'text-ink' },
  en_consulta: { I: PhoneCall, cls: 'text-ink' },
  aceptado_condiciones: { I: Clock, cls: 'text-amber' },
  confirmado: { I: CheckCircle2, cls: 'text-green' },
  en_ejecucion: { I: PlayCircle, cls: 'text-green' },
  completado: { I: CheckCircle2, cls: 'text-green' },
  invalidado: { I: XCircle, cls: 'text-red' },
}

const ORDER: CommitmentStatus[] = ['aceptado_condiciones', 'en_consulta', 'propuesto', 'confirmado', 'en_ejecucion', 'completado', 'invalidado']

function Row({ c }: { c: Commitment }) {
  const { I, cls } = ICON[c.status]
  const meta = COMMITMENT[c.status]
  return (
    <li className="flex items-start gap-2.5 py-2 border-b border-line last:border-0 fade-in">
      <I size={18} className={`${cls} mt-0.5 flex-none`} />
      <div className="min-w-0 flex-1">
        <div className={`font-medium leading-tight ${c.status === 'invalidado' ? 'line-through text-muted' : ''}`}>{c.title}</div>
        <div className="text-[11px] mt-0.5">
          <span className={cls}>{meta.label}</span>
          <span className="text-muted"> · {c.counterpart} · plan v{c.planVersion}</span>
        </div>
        {c.conditions.length > 0 && c.status !== 'invalidado' && (
          <ul className="mt-1 text-[11px] text-amber/90 space-y-0.5">
            {c.conditions.map((x) => <li key={x}>› {x}</li>)}
          </ul>
        )}
        {c.note && c.status === 'invalidado' && <div className="text-[11px] text-red/80 mt-0.5">{c.note}</div>}
      </div>
    </li>
  )
}

export function CompromisosList({ s }: { s: CrisisState }) {
  const list = [...s.commitments].sort((a, b) => ORDER.indexOf(a.status) - ORDER.indexOf(b.status) || b.updatedAt - a.updatedAt)
  const ok = s.commitments.filter((c) => c.status === 'confirmado' || c.status === 'completado' || c.status === 'en_ejecucion').length
  const bad = s.commitments.filter((c) => c.status === 'invalidado').length
  return (
    <Panel title="Compromisos" right={<span className="text-[11px] num"><span className="text-green">{ok} ok</span> · <span className="text-red">{bad} inv.</span></span>} className="flex-1" bodyClass="overflow-y-auto pt-0">
      <ul>{list.map((c) => <Row key={c.id} c={c} />)}</ul>
    </Panel>
  )
}
