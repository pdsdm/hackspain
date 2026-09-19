import { useState } from 'react'
import { WifiOff } from 'lucide-react'
import { useCrisisState } from './data/useCrisisState'
import { activeCall, pendingDecision } from './domain/selectors'
import type { FixtureName } from './domain/fixtures'
import { TopBar } from './components/layout/TopBar'
import { NavTabs } from './components/layout/NavTabs'
import { OperacionesPanel } from './components/left/OperacionesPanel'
import { IncidenciaCard } from './components/left/IncidenciaCard'
import { PresupuestoCard } from './components/left/PresupuestoCard'
import { AforoCard } from './components/left/AforoCard'
import { CrisisMap } from './components/map/CrisisMap'
import { EstadoGlobal } from './components/center/EstadoGlobal'
import { CoordinadorPanel } from './components/right/CoordinadorPanel'
import { LlamadaCard } from './components/right/LlamadaCard'
import { DecisionCard } from './components/right/DecisionCard'
import { Cronologia } from './components/right/Cronologia'
import { IntervenirModal } from './components/right/IntervenirModal'
import { EventChat } from './components/right/EventChat'
import { SimulacionPanel } from './components/right/SimulacionPanel'
import { Panel } from './components/ui/Panel'
import { COMMITMENT } from './components/ui/status'

const TONE_TEXT: Record<string, string> = { ink: 'text-ink', amber: 'text-amber', red: 'text-red', green: 'text-green', muted: 'text-muted' }
import { fmtClock } from './domain/time'

export default function App() {
  const ctl = useCrisisState()
  const { state: s } = ctl
  const [modal, setModal] = useState<'intervenir' | 'decisiones' | null>(null)
  const decision = pendingDecision(s)
  const call = activeCall(s)
  const disabled = ctl.pending || ctl.stale

  if (!ctl.ready) return <main className="connection-screen">
    <img src="/brand/zhivel-logo-dark.png" alt="Zhivel" />
    <h1>Conectando con la operación</h1>
    <p>{ctl.error ? 'No se ha podido recibir el estado del backend. Reintentando automáticamente…' : 'Esperando el primer estado del backend…'}</p>
    <p className="text-muted">Los datos y las acciones estarán disponibles cuando se establezca la conexión.</p>
    {ctl.error && <p role="alert">{ctl.error}</p>}
  </main>

  return (
    <div className="h-full flex flex-col bg-bg text-text">
      <TopBar ctl={ctl} onIntervenir={() => setModal('intervenir')} />
      <NavTabs s={s} />
      {ctl.stale && (
        <div role="alert" className="flex items-center gap-2 px-4 py-1.5 bg-red/10 border-b border-red/40 text-red text-[12px]">
          <WifiOff size={13} /> Datos sin actualizar · última recepción hace {ctl.ageSeconds} s. {ctl.error ?? 'Esperando conexión.'} Las acciones están deshabilitadas hasta recuperar el estado.
        </div>
      )}

      <main className="flex-1 min-h-0 grid grid-cols-1 lg:grid-cols-[300px_minmax(0,1fr)_372px] gap-5 px-6 pt-5 pb-6">
        <aside className="flex flex-col gap-5 min-h-0 overflow-y-auto [&>*]:flex-none">
          <OperacionesPanel s={s} onSelect={ctl.select} selected={s.selectedId} />
          <IncidenciaCard s={s} />
          <AforoCard s={s} />
          <div className="flex-1" />
          <PresupuestoCard s={s} />
        </aside>

        <section className="flex flex-col gap-5 min-h-0">
          <div className="flex-1 min-h-[360px]">
            <CrisisMap s={s} onSelect={ctl.select} selected={s.selectedId} />
          </div>
          <EstadoGlobal s={s} reference={ctl.reference} />
        </section>

        <aside className="flex flex-col gap-5 min-h-0 overflow-y-auto [&>*]:flex-none">
          <DecisionCard d={decision} authorized={s.budget.authorized} disabled={disabled} onApprove={() => void ctl.intervene({ type: 'approve_spend', payload: { decisionId: decision!.id } })} onReject={() => void ctl.intervene({ type: decision?.id === 'd-plan-sur' ? 'reject_split' : 'reject_spend', payload: { decisionId: decision!.id } })} />
          <CoordinadorPanel s={s} />
          <LlamadaCard s={s} call={call} disabled={disabled} onTake={() => { if (!disabled && call) void ctl.intervene({ type: 'take_call', payload: { callId: call.id } }) }} />
          {ctl.feedback && <p role="status" className="text-[12px] text-muted">{ctl.feedback}</p>}
          <Cronologia s={s} />
          <button onClick={() => setModal('decisiones')} className="self-start text-[11px] text-muted hover:text-ink underline underline-offset-[3px]">Ver decisiones y compromisos</button>
          {ctl.source === 'api' && (
            <EventChat disabled={disabled} pending={ctl.pending} feedback={ctl.feedback} onSend={ctl.sendEvent} />
          )}
          {ctl.source === 'sim' && (
            <>
              <label className="block text-[12px]">Cargar un momento de la demo<select aria-label="Cargar estado de demo" className="fixture-select" value="" onChange={(e) => { if (e.target.value) ctl.loadFixture(e.target.value as FixtureName) }}><option value="">Elige un estado…</option><option value="calm">Estable · 12:00</option><option value="normal">Antes de la crisis · 600 plazas</option><option value="crisis">Cierre del Principal · 0 plazas</option><option value="proposal">Propuesta · aprobación pendiente</option><option value="recovered">Plan Sur confirmado · 600 plazas</option><option value="lounge_unavailable">Lounge no disponible · 450 plazas</option><option value="pabellon_b_400">Aforo B reducido · 550 plazas</option></select></label>
            </>
          )}
          <SimulacionPanel s={s} onTwist={ctl.twist} />
        </aside>
      </main>

      {modal === 'intervenir' && <IntervenirModal s={s} disabled={disabled} feedback={ctl.feedback} onClose={() => setModal(null)} onIntervene={ctl.intervene} />}
      {modal === 'decisiones' && (
        <div className="fixed inset-0 z-[2000] bg-ink/40 grid place-items-center p-4" onClick={() => setModal(null)}>
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
                    <span className={TONE_TEXT[COMMITMENT[c.status].tone]}>{COMMITMENT[c.status].label}</span>
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
