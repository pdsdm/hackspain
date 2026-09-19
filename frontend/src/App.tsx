import { useState } from 'react'
import { WifiOff } from 'lucide-react'
import { useCrisisState } from './data/useCrisisState'
import { activeCall, pendingDecision } from './domain/selectors'
import type { FixtureName } from './domain/fixtures'
import { TopBar } from './components/layout/TopBar'
import { NavTabs } from './components/layout/NavTabs'
import { Drawer } from './components/layout/Drawer'
import { CrisisMap } from './components/map/CrisisMap'
import { KpiOverlay } from './components/map/KpiOverlay'
import { AforoOverlay } from './components/map/AforoOverlay'
import { ActiveIncidents } from './components/map/ActiveIncidents'
import { CronologiaChat } from './components/map/CronologiaChat'
import { CierreCard } from './components/map/CierreCard'
import { CoordinadorPanel } from './components/right/CoordinadorPanel'
import { LlamadaCard } from './components/right/LlamadaCard'
import { AvisarPanel } from './components/right/AvisarPanel'
import { DecisionCard } from './components/right/DecisionCard'
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
  const [drawer, setDrawer] = useState(false)
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
    <div className="app-shell h-full bg-bg text-text">
      <div className="desktop-dashboard h-full flex flex-col">
        <TopBar ctl={ctl} onIntervenir={() => setModal('intervenir')} onDrawer={() => setDrawer((v) => !v)} drawerOpen={drawer} />
        <NavTabs s={s} />
        {ctl.stale && (
          <div role="alert" className="flex items-center gap-2 px-4 py-1.5 bg-red/10 border-b border-red/40 text-red text-[12px]">
            <WifiOff size={13} /> Datos sin actualizar · última recepción hace {ctl.ageSeconds} s. {ctl.error ?? 'Esperando conexión.'} Las acciones están deshabilitadas hasta recuperar el estado.
          </div>
        )}

        <main className="flex-1 min-h-0 relative flex flex-col">
          <div className="flex-1 min-h-0">
          <CrisisMap s={s} onSelect={ctl.select} selected={s.selectedId}>
            <div className="map-overlays">
              <div className="absolute top-3 left-3 w-[300px] flex flex-col gap-3">
                <AforoOverlay s={s} />
                <ActiveIncidents s={s} />
              </div>
              <div className="absolute top-3 left-[324px] right-[428px] flex flex-col items-center gap-3">
                <KpiOverlay s={s} />
                <CierreCard s={s} className="w-[440px] max-w-full" />
                <DecisionCard className="glass w-[440px] max-w-full" d={decision} disabled={disabled} onApprove={() => void ctl.intervene({ type: 'approve_plan', payload: { decisionId: decision!.id } })} onReject={() => void ctl.intervene({ type: 'reject_plan', payload: { decisionId: decision!.id } })} />
              </div>

              <CoordinadorPanel s={s} className="absolute left-3 right-[428px] bottom-3" />
            </div>
          </CrisisMap>
          </div>
              <div className="absolute z-[1000] top-3 right-3 bottom-3 w-[404px] flex flex-col justify-end gap-3 pointer-events-none [&>*]:pointer-events-auto">
                <LlamadaCard s={s} call={call} disabled={disabled} onTake={() => { if (!disabled && call) void ctl.intervene({ type: 'take_call', payload: { callId: call.id } }) }} />
                <CronologiaChat s={s} className="min-h-0 max-h-full" footer={
                  <EventChat className="event-chat border-t border-line p-3 flex-none" disabled={disabled || ctl.source !== 'api'} pending={ctl.pending} feedback={ctl.feedback} onSend={ctl.sendEvent} placeholder={ctl.source === 'api' ? 'Describe qué está pasando…' : 'Eventos libres solo contra el backend'} />
                } />
              </div>
        </main>

        <Drawer open={drawer} onClose={() => setDrawer(false)}>
          {ctl.source === 'api' && <AvisarPanel disabled={disabled} />}
          {ctl.source === 'sim' && (
            <label className="block text-[12px]">Cargar un momento de la demo<select aria-label="Cargar estado de demo" className="fixture-select" value="" onChange={(e) => { if (e.target.value) ctl.loadFixture(e.target.value as FixtureName) }}><option value="">Elige un estado…</option><option value="calm">Estable · 12:00</option><option value="normal">Antes de la crisis · 600 plazas</option><option value="crisis">Cierre del Principal · 0 plazas</option><option value="proposal">Propuesta · aprobación pendiente</option><option value="recovered">Plan Sur confirmado · 600 plazas</option><option value="lounge_unavailable">Lounge no disponible · 450 plazas</option><option value="pabellon_b_400">Aforo B reducido · 550 plazas</option></select></label>
          )}
          <SimulacionPanel s={s} onTwist={ctl.twist} onLive={ctl.setLive} />
          <button onClick={() => { setDrawer(false); setModal('decisiones') }} className="self-start text-[11px] text-muted hover:text-ink underline underline-offset-[3px]">Ver decisiones y compromisos</button>
        </Drawer>

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
                      <span>{d.title} · {d.cost === null ? 'Sin estimar' : `${d.cost.toLocaleString('es-ES')} €`}</span>
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

      <main className="mobile-chronology" aria-label="Cronología móvil">
        <header className="mobile-operation-header">
          <div><img src="/brand/zhivel-logo-dark.png" alt="Zhivel" /><span>MADRING · Hospitality</span></div>
          <div className="mobile-operation-status">
            <span className={ctl.stale ? 'connection-stale' : ''}><i />{ctl.stale ? 'Sin conexión' : ctl.source === 'sim' ? 'Simulación' : 'Conectado'}</span>
            <time className="num">{fmtClock(s.clock.simSeconds)}</time>
          </div>
        </header>
        {ctl.stale && (
          <div role="alert" className="flex items-center gap-2 px-4 py-2 bg-red/10 border-b border-red/40 text-red text-[12px]">
            <WifiOff size={13} /> Datos sin actualizar
          </div>
        )}
        <CronologiaChat s={s} className="mobile-chronology-panel" footer={
          <EventChat className="event-chat border-t border-line p-4 flex-none" disabled={disabled || ctl.source !== 'api'} pending={ctl.pending} feedback={ctl.feedback} onSend={ctl.sendEvent} placeholder={ctl.source === 'api' ? 'Describe qué está pasando…' : 'Eventos libres solo contra el backend'} />
        } />
      </main>
    </div>
  )
}
