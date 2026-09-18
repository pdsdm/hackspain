import { useState } from 'react'
import { FileText, Zap, WifiOff } from 'lucide-react'
import { useCrisisState } from './data/useCrisisState'
import { activeCall, pendingDecision } from './domain/selectors'
import { TopBar } from './components/layout/TopBar'
import { NavTabs } from './components/layout/NavTabs'
import { OperacionesPanel } from './components/left/OperacionesPanel'
import { IncidenciaCard } from './components/left/IncidenciaCard'
import { CompromisosList } from './components/left/CompromisosList'
import { CrisisMap } from './components/map/CrisisMap'
import { EstadoGlobal } from './components/center/EstadoGlobal'
import { CoordinadorPanel } from './components/right/CoordinadorPanel'
import { LlamadaCard } from './components/right/LlamadaCard'
import { DecisionCard } from './components/right/DecisionCard'
import { Cronologia } from './components/right/Cronologia'
import { IntervenirModal } from './components/right/IntervenirModal'
import { SimulacionPanel } from './components/right/SimulacionPanel'
import { Panel } from './components/ui/Panel'
import { COMMITMENT } from './components/ui/status'
import { fmtClock } from './domain/time'

export default function App() {
  const ctl = useCrisisState()
  const { state: s } = ctl
  const [modal, setModal] = useState<'intervenir' | 'decisiones' | null>(null)
  const decision = pendingDecision(s)
  const call = activeCall(s)

  return (
    <div className="h-full flex flex-col bg-bg text-text">
      <TopBar ctl={ctl} />
      <NavTabs />
      {ctl.error && (
        <div className="flex items-center gap-2 px-4 py-1.5 bg-red/10 border-b border-red/40 text-red text-[12px]">
          <WifiOff size={13} /> Backend sin respuesta ({ctl.error}). Se muestra el último estado recibido.
        </div>
      )}

      <main className="flex-1 min-h-0 grid grid-cols-12 gap-3 p-3">
        <aside className="col-span-12 lg:col-span-3 2xl:col-span-2 flex flex-col gap-3 min-h-0 overflow-y-auto">
          <OperacionesPanel s={s} onSelect={ctl.select} selected={s.selectedId} />
          <IncidenciaCard s={s} />
          <CompromisosList s={s} />
        </aside>

        <section className="col-span-12 lg:col-span-6 2xl:col-span-7 flex flex-col gap-3 min-h-0">
          <div className="flex-1 min-h-[360px]">
            <CrisisMap s={s} onSelect={ctl.select} selected={s.selectedId} />
          </div>
          <EstadoGlobal s={s} />
        </section>

        <aside className="col-span-12 lg:col-span-3 flex flex-col gap-3 min-h-0 overflow-y-auto">
          <CoordinadorPanel s={s} />
          <LlamadaCard s={s} call={call} onTake={() => ctl.intervene({ type: 'take_call' })} />
          <DecisionCard d={decision} authorized={s.budget.authorized} onApprove={() => ctl.intervene({ type: 'approve_spend' })} onReject={() => ctl.intervene({ type: decision?.id === 'd-plan-sur' ? 'reject_split' : 'reject_spend' })} />
          <Cronologia s={s} />
          <div className="grid grid-cols-2 gap-2">
            <button onClick={() => setModal('decisiones')} className="h-10 rounded-md border border-line bg-panel hover:bg-white/5 flex items-center justify-center gap-2 font-medium"><FileText size={15} /> Ver decisiones</button>
            <button onClick={() => setModal('intervenir')} className="h-10 rounded-md bg-cyan text-bg font-semibold hover:bg-cyan/90 flex items-center justify-center gap-2"><Zap size={15} /> Intervenir</button>
          </div>
          <SimulacionPanel s={s} onTwist={ctl.twist} />
        </aside>
      </main>

      {modal === 'intervenir' && <IntervenirModal s={s} onClose={() => setModal(null)} onIntervene={ctl.intervene} />}
      {modal === 'decisiones' && (
        <div className="fixed inset-0 z-[2000] bg-black/60 backdrop-blur-sm grid place-items-center p-4" onClick={() => setModal(null)}>
          <div className="w-full max-w-2xl max-h-[80vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <Panel title="Decisiones y compromisos · trazabilidad">
              <h4 className="text-[12px] font-semibold text-muted mb-1">Decisiones del responsable</h4>
              {s.decisions.length === 0 && <p className="text-[12px] text-muted">Todavía no hay decisiones.</p>}
              <ul className="space-y-1.5 mb-3">
                {s.decisions.map((d) => (
                  <li key={d.id} className="text-[12px] flex gap-2">
                    <span className="text-muted num">{fmtClock(d.createdAt)}</span>
                    <span className={d.status === 'aprobada' ? 'text-green' : d.status === 'rechazada' ? 'text-red' : 'text-amber'}>{d.status}</span>
                    <span>{d.title} · {d.cost.toLocaleString('es-ES')} €</span>
                  </li>
                ))}
              </ul>
              <h4 className="text-[12px] font-semibold text-muted mb-1">Restricciones vigentes</h4>
              <ul className="text-[12px] mb-3">{s.constraints.map((c) => <li key={c}>› {c}</li>)}</ul>
              <h4 className="text-[12px] font-semibold text-muted mb-1">Compromisos (plan v{s.planVersion})</h4>
              <ul className="space-y-1">
                {s.commitments.map((c) => (
                  <li key={c.id} className="text-[12px] flex gap-2">
                    <span className="text-muted num">{fmtClock(c.updatedAt)}</span>
                    <span className={`text-${COMMITMENT[c.status].tone === 'muted' ? 'muted' : COMMITMENT[c.status].tone}`}>{COMMITMENT[c.status].label}</span>
                    <span>{c.title} · {c.counterpart}</span>
                  </li>
                ))}
              </ul>
            </Panel>
          </div>
        </div>
      )}
    </div>
  )
}
