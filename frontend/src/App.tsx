import { useState } from 'react'
import { Pause, Play, ArrowRight, WifiOff, CheckCircle2 } from 'lucide-react'
import { useCrisisState } from './data/useCrisisState'
import { activeCall, pendingDecision, kpis } from './domain/selectors'
import { compareStates } from './domain/changes'
import type { FixtureName } from './domain/fixtures'
import { TopBar } from './components/layout/TopBar'
import { NavTabs } from './components/layout/NavTabs'
import { PresupuestoCard } from './components/left/PresupuestoCard'
import { CompromisosList } from './components/left/CompromisosList'
import { CrisisMap } from './components/map/CrisisMap'
import { PlanoOperativo } from './components/map/PlanoOperativo'
import { EstadoGlobal } from './components/center/EstadoGlobal'
import { CambiosPanel } from './components/center/CambiosPanel'
import { ResourceDetail } from './components/center/ResourceDetail'
import { CoordinadorPanel } from './components/right/CoordinadorPanel'
import { LlamadaCard } from './components/right/LlamadaCard'
import { DecisionCard } from './components/right/DecisionCard'
import { Cronologia } from './components/right/Cronologia'
import { IntervenirModal } from './components/right/IntervenirModal'
import { SimulacionPanel } from './components/right/SimulacionPanel'
import { Dialog } from './components/ui/Dialog'
import { fmtClock } from './domain/time'

export default function App() {
  const ctl = useCrisisState()
  const { state: s } = ctl
  const [modal, setModal] = useState<'intervenir' | 'decisiones' | null>(null)
  const [detail, setDetail] = useState<string | null>(null)
  const [view, setView] = useState<'plano' | 'mapa'>('plano')
  const decision = pendingDecision(s)
  const call = activeCall(s)
  const k = kpis(s)
  const changes = ctl.reference ? compareStates(ctl.reference, s) : []
  const select = (id: string) => { ctl.select(id); setDetail(id) }
  const disabled = ctl.pending || ctl.stale
  const missing = k.total - k.confirmed

  if (!ctl.ready) return <main className="connection-screen">
    <img src="/brand/zhivel-logo-dark.png" alt="Zhivel" />
    <h1>Conectando con la operación</h1>
    <p>{ctl.error ? 'No se ha podido recibir el estado del backend. Reintentando automáticamente…' : 'Esperando el primer estado del backend…'}</p>
    <p className="text-muted">Los datos y las acciones estarán disponibles cuando se establezca la conexión.</p>
    {ctl.error && <p role="alert">{ctl.error}</p>}
  </main>

  return (
    <div className="dashboard-shell">
      <TopBar ctl={ctl} onIntervenir={() => setModal('intervenir')} />
      <NavTabs s={s} />
      {ctl.stale && <div role="alert" className="connection-alert"><WifiOff size={16} /> Datos sin actualizar · última recepción hace {ctl.ageSeconds} s. {ctl.error ?? 'Esperando conexión.'} Las acciones están deshabilitadas hasta recuperar el estado.</div>}
      <main className="dashboard-main">
        <section id="situacion" className="overview-strip">
          <div><p className="label">Operación MADRING / Plan v{s.planVersion}</p>
            <h1>{missing > 0 ? `${missing} invitados sin ubicación confirmada` : `${k.total} plazas confirmadas. Seguimos con la operación.`}</h1>
            <p className="text-muted">{decision ? 'El sistema necesita tu decisión para avanzar.' : s.agentsPaused ? 'Agentes pausados por el responsable.' : missing > 0 ? 'Espacios, catering y transporte coordinan una alternativa.' : `${Math.max(0, k.total - k.informed)} invitados pendientes de informar · verifica ejecución y condiciones.`}</p>
          </div>
          <div className="overview-state"><span className={decision ? 'text-amber' : 'text-muted'}>{decision ? '● REQUIERE DECISIÓN' : s.agentsPaused ? '● ACCIONES PAUSADAS' : '● SEGUIMIENTO ACTIVO'}</span><span>{ctl.source === 'sim' ? 'Demo local · sin llamadas reales' : `Última recepción hace ${ctl.ageSeconds} s`}</span></div>
        </section>
        <EstadoGlobal s={s} reference={ctl.reference} />
        {ctl.reference && <div className="reference-bar"><span>Comparación con <strong>{fmtClock(ctl.reference.clock.simSeconds, true)} · plan v{ctl.reference.planVersion}</strong>{ctl.source === 'sim' && ctl.reference.planVersion === 0 ? ' (antes de la crisis)' : ''}</span><a href="#cambios">{changes.length} cambios operativos <ArrowRight size={14} /></a></div>}

        <div className="dashboard-columns">
          <div className="dashboard-primary">
            <section className="bg-panel border border-line" aria-labelledby="plan-title">
              <header className="section-header"><div><h2 id="plan-title">Dónde está el problema</h2><p>Espacios, accesos y llegadas · selecciona para ver el detalle</p></div>
                <div className="view-switch" role="group" aria-label="Vista del recinto"><button aria-pressed={view === 'plano'} onClick={() => setView('plano')}>Plano</button><button aria-pressed={view === 'mapa'} onClick={() => setView('mapa')}>Mapa</button></div>
              </header>
              {view === 'plano' ? <PlanoOperativo s={s} changes={changes} onSelect={select} /> : <div className="geographic-map"><CrisisMap s={s} onSelect={select} selected={s.selectedId} /></div>}
            </section>
            <div id="cambios">{ctl.reference && <CambiosPanel reference={ctl.reference} changes={changes} onSelect={select} onReference={ctl.setReference} />}</div>
          </div>

          <aside className="dashboard-sidebar" aria-label="Control de la operación">
            <section className="operator-controls">
              <div className="label">Tu control de la operación</div>
              <div className="flex gap-2 mt-3"><button disabled={disabled} className="primary-button flex-1" onClick={() => setModal('intervenir')}>Intervenir</button><button disabled={disabled} className="small-button" onClick={() => void ctl.intervene({ type: s.agentsPaused ? 'resume' : 'pause' })}>{s.agentsPaused ? <Play size={15} /> : <Pause size={15} />}{s.agentsPaused ? 'Reanudar agentes' : 'Pausar agentes'}</button></div>
              <p className="text-muted text-[12px] mt-2">Pausar agentes detiene nuevas acciones; el reloj sigue.</p>
              {ctl.feedback && <p role="status" className="action-feedback">{ctl.feedback}</p>}
              {ctl.pending && <p role="status">Enviando intervención…</p>}
            </section>
            <DecisionCard d={decision} authorized={s.budget.authorized} disabled={disabled} onApprove={() => void ctl.intervene({ type: 'approve_spend', payload: { decisionId: decision!.id } })} onReject={() => void ctl.intervene({ type: decision?.id === 'd-plan-sur' ? 'reject_split' : 'reject_spend', payload: { decisionId: decision!.id } })} />
            {!decision && <div className="no-decision"><CheckCircle2 size={17} /><span>Sin decisiones pendientes de tu aprobación.</span></div>}
            <div id="actividad"><CoordinadorPanel s={s} /></div>
            <LlamadaCard s={s} call={call} disabled={disabled} onTake={() => { if (!disabled && call) void ctl.intervene({ type: 'take_call', payload: { callId: call.id } }) }} />
            <PresupuestoCard s={s} />
            <button className="small-button justify-center" onClick={() => setModal('decisiones')}>Ver decisiones y compromisos</button>
            <details className="bg-panel border border-line p-3"><summary className="font-semibold cursor-pointer">Cronología de la operación · {s.events.length} eventos</summary><div className="h-72 mt-3"><Cronologia s={s} /></div></details>
            {ctl.source === 'sim' && <details className="demo-tools"><summary>Ensayar escenario · datos simulados</summary><label className="block mt-3 text-[12px]">Cargar un momento de la demo<select aria-label="Cargar estado de demo" className="fixture-select" value="" onChange={(e) => { if (e.target.value) { ctl.loadFixture(e.target.value as FixtureName); setDetail(null) } }}><option value="">Elige un estado…</option><option value="normal">Antes de la crisis · 600 plazas</option><option value="crisis">Cierre del Principal · 0 plazas</option><option value="proposal">Propuesta · aprobación pendiente</option><option value="recovered">Plan Sur confirmado · 600 plazas</option><option value="lounge_unavailable">Lounge no disponible · 450 plazas</option><option value="pabellon_b_400">Aforo B reducido · 550 plazas</option></select></label><p className="text-[12px] text-muted my-2">Se carga un estado pausado. La referencia se conserva para comparar.</p><SimulacionPanel s={s} onTwist={ctl.twist} /></details>}
          </aside>
        </div>
      </main>
      <div className="mobile-intervention"><span>{decision ? 'Decisión pendiente' : s.agentsPaused ? 'Agentes pausados' : 'Control de la operación'}</span><button disabled={disabled} className="primary-button" onClick={() => setModal('intervenir')}>Intervenir</button></div>
      {detail && <ResourceDetail s={s} id={detail} changes={changes} onClose={() => setDetail(null)} />}
      {modal === 'intervenir' && <IntervenirModal s={s} disabled={disabled} feedback={ctl.feedback} onClose={() => setModal(null)} onIntervene={ctl.intervene} />}
      {modal === 'decisiones' && <Dialog title="Decisiones y compromisos" onClose={() => setModal(null)}>
        {s.decisions.length === 0 && <p className="text-muted mb-3">Todavía no hay decisiones.</p>}
        <ul className="space-y-3 mb-5">{s.decisions.map((d) => <li key={d.id}><strong>{d.title}</strong><p>{d.status} · {d.cost.toLocaleString('es-ES')} € · {fmtClock(d.createdAt)}</p></li>)}</ul>
        <CompromisosList s={s} />
        <h3 className="font-semibold mt-4">Restricciones vigentes</h3><ul>{s.constraints.map((c) => <li key={c}>• {c}</li>)}</ul>
      </Dialog>}
    </div>
  )
}
