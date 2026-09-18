import { useState } from 'react'
import { X, Check, Ban, Split, Pause, Play, Lock, PhoneForwarded } from 'lucide-react'
import type { CrisisState, Intervention } from '../../domain/types'

function Btn({ icon: I, label, sub, tone, onClick }: { icon: typeof X; label: string; sub: string; tone: string; onClick: () => void }) {
  return (
    <button onClick={onClick} className={`w-full flex items-center gap-3 p-3 rounded-md border border-line hover:bg-ink/5 text-left ${tone}`}>
      <I size={18} className="flex-none" />
      <span><span className="block font-semibold text-text">{label}</span><span className="block text-[11px] text-muted">{sub}</span></span>
    </button>
  )
}

export function IntervenirModal({ s, onClose, onIntervene }: { s: CrisisState; onClose: () => void; onIntervene: (i: Intervention) => void }) {
  const [text, setText] = useState('')
  const fire = (i: Intervention) => { onIntervene(i); onClose() }
  const pend = s.decisions.find((d) => d.status === 'pendiente')
  return (
    <div className="fixed inset-0 z-[2000] bg-ink/40 grid place-items-center p-4" onClick={onClose}>
      <div className="w-full max-w-md bg-panel border border-line rounded-lg p-4 fade-in" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-3">
          <h3 className="display font-bold text-[15px]">Intervenir · responsable de operaciones</h3>
          <button onClick={onClose} className="text-muted hover:text-text"><X size={16} /></button>
        </div>
        <div className="space-y-2">
          <Btn icon={Check} label="Aprobar gasto" sub={pend ? `${pend.title} · ${pend.cost.toLocaleString('es-ES')} €` : 'No hay decisión pendiente'} tone="text-green" onClick={() => fire({ type: 'approve_spend' })} />
          <Btn icon={Ban} label="Rechazar gasto adicional" sub="Mantener el límite autónomo de 1.500 €" tone="text-red" onClick={() => fire({ type: 'reject_spend' })} />
          <Btn icon={Split} label="No dividir la hospitalidad" sub="Buscar un único espacio para 600 (Norte C)" tone="text-amber" onClick={() => fire({ type: 'reject_split' })} />
          {s.agentsPaused
            ? <Btn icon={Play} label="Reanudar agentes" sub="Los agentes retoman sus tareas" tone="text-ink" onClick={() => fire({ type: 'resume' })} />
            : <Btn icon={Pause} label="Pausar nuevas acciones" sub="Los agentes no inician nuevas llamadas ni reservas" tone="text-ink" onClick={() => fire({ type: 'pause' })} />}
          <Btn icon={PhoneForwarded} label="Hacerme cargo de la conversación" sub="Tomar la llamada en curso" tone="text-ink" onClick={() => fire({ type: 'take_call' })} />
          <div className="p-3 rounded-md border border-line">
            <div className="flex items-center gap-2 font-semibold"><Lock size={16} className="text-amber" /> Fijar restricción</div>
            <div className="flex gap-2 mt-2">
              <input value={text} onChange={(e) => setText(e.target.value)} placeholder="p. ej. «Nadie cruza a Norte sin lanzadera»" className="flex-1 h-9 px-2 rounded-md bg-bg border border-line text-[12px] outline-none focus:border-ink" />
              <button disabled={!text.trim()} onClick={() => fire({ type: 'set_constraint', payload: { text: text.trim() } })} className="h-9 px-3 border border-amber text-amber disabled:opacity-40">Fijar</button>
            </div>
            {s.constraints.length > 0 && (
              <ul className="mt-2 text-[11px] text-muted space-y-0.5">{s.constraints.map((c) => <li key={c}>› {c}</li>)}</ul>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
