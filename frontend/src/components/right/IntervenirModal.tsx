import { useState } from 'react'
import { X, Check, Ban, Split, Pause, Play, Lock, PhoneForwarded } from 'lucide-react'
import { Dialog } from '../ui/Dialog'
import type { CrisisState, Intervention } from '../../domain/types'

function Btn({ icon: I, label, sub, tone, onClick, disabled }: { icon: typeof X; label: string; sub: string; tone: string; disabled?: boolean; onClick: () => void }) {
  return (
    <button disabled={disabled} onClick={onClick} className={`w-full flex items-center gap-3 p-3 rounded-md border border-line hover:bg-ink/5 text-left ${tone}`}>
      <I size={18} className="flex-none" />
      <span><span className="block font-semibold text-text">{label}</span><span className="block text-[11px] text-muted">{sub}</span></span>
    </button>
  )
}

export function IntervenirModal({ s, onClose, onIntervene, disabled, feedback }: { s: CrisisState; disabled: boolean; feedback: string | null; onClose: () => void; onIntervene: (i: Intervention) => Promise<boolean> }) {
  const [text, setText] = useState('')
  const fire = async (i: Intervention) => { if (await onIntervene(i)) onClose() }
  const pend = s.decisions.find((d) => d.status === 'pendiente')
  const call = s.calls.find((c) => c.status === 'en_curso' && c.channel === 'llamada')
  return (
    <Dialog title="Intervenir · responsable de operaciones" onClose={onClose}>
        {feedback && <p role="status" className="action-feedback mb-3">{feedback}</p>}
        {pend && <p className="text-[12px] mb-3">{pend.effectApprove}</p>}
        <div className="space-y-2">
          <Btn disabled={disabled || !pend} icon={Check} label="Aprobar gasto" sub={pend ? `${pend.title} · ${pend.cost.toLocaleString('es-ES')} €` : 'No hay decisión pendiente'} tone="text-green" onClick={() => fire({ type: 'approve_spend', payload: { decisionId: pend!.id } })} />
          <Btn disabled={disabled || !pend} icon={Ban} label="Rechazar gasto adicional" sub="Mantener el límite autónomo de 1.500 €" tone="text-red" onClick={() => fire({ type: 'reject_spend', payload: { decisionId: pend!.id } })} />
          <Btn disabled={disabled || !pend} icon={Split} label="No dividir la hospitalidad" sub="Buscar un único espacio para 600 (Norte C)" tone="text-amber" onClick={() => fire({ type: 'reject_split', payload: { decisionId: pend!.id } })} />
          {s.agentsPaused
            ? <Btn disabled={disabled} icon={Play} label="Reanudar agentes" sub="Los agentes retoman sus tareas" tone="text-ink" onClick={() => fire({ type: 'resume' })} />
            : <Btn disabled={disabled} icon={Pause} label="Pausar nuevas acciones" sub="Los agentes no inician nuevas llamadas ni reservas" tone="text-ink" onClick={() => fire({ type: 'pause' })} />}
          <Btn disabled={disabled || !call} icon={PhoneForwarded} label="Hacerme cargo de la conversación" sub="Tomar la llamada en curso" tone="text-ink" onClick={() => fire({ type: 'take_call', payload: { callId: call!.id } })} />
          <div className="p-3 rounded-md border border-line">
            <div className="flex items-center gap-2 font-semibold"><Lock size={16} className="text-amber" /> Fijar restricción</div>
            <div className="flex gap-2 mt-2">
              <input aria-label="Nueva restricción" disabled={disabled} value={text} onChange={(e) => setText(e.target.value)} placeholder="p. ej. «Nadie cruza a Norte sin lanzadera»" className="min-w-0 flex-1 h-9 px-2 rounded-md bg-bg border border-line text-[12px] outline-none focus:border-ink" />
              <button disabled={disabled || !text.trim()} onClick={() => fire({ type: 'set_constraint', payload: { text: text.trim() } })} className="h-9 px-3 border border-amber text-amber disabled:opacity-40">Fijar</button>
            </div>
            {s.constraints.length > 0 && (
              <ul className="mt-2 text-[11px] text-muted space-y-0.5">{s.constraints.map((c) => <li key={c}>› {c}</li>)}</ul>
            )}
          </div>
        </div>
    </Dialog>
  )
}
