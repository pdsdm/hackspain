import { useState } from 'react'
import { WifiOff } from 'lucide-react'
import { useCrisisState } from './data/useCrisisState'
import { displayCall, pendingDecision } from './domain/selectors'
import { TopBar } from './components/layout/TopBar'
import { CrisisMap } from './components/map/CrisisMap'
import { AforoOverlay } from './components/map/AforoOverlay'
import { AgentDetailCard, type AgentFocus } from './components/map/AgentDetailCard'
import { ActiveIncidents } from './components/map/ActiveIncidents'
import { CronologiaChat } from './components/map/CronologiaChat'
import { CierreCard } from './components/map/CierreCard'
import { CoordinadorPanel } from './components/right/CoordinadorPanel'
import { LlamadaCard } from './components/right/LlamadaCard'
import { DecisionCard } from './components/right/DecisionCard'
import { EventChat } from './components/right/EventChat'

import { fmtClock } from './domain/time'

export default function App() {
  const ctl = useCrisisState()
  const { state: s } = ctl
  const [openAgent, setOpenAgent] = useState<AgentFocus | null>(null)
  const decision = pendingDecision(s)
  const call = displayCall(s)
  const disabled = ctl.pending || ctl.stale || s.clock.paused

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
        <TopBar ctl={ctl} />
        {ctl.stale && (
          <div role="alert" className="flex items-center gap-2 px-4 py-1.5 bg-red/10 border-b border-red/40 text-red text-[12px]">
            <WifiOff size={13} /> Datos sin actualizar · última recepción hace {ctl.ageSeconds} s. {ctl.error ?? 'Esperando conexión.'} Las acciones están deshabilitadas hasta recuperar el estado.
          </div>
        )}

        <main className="flex-1 min-h-0 relative flex flex-col">
          <div className="flex-1 min-h-0">
          <CrisisMap s={s} onSelect={ctl.select} selected={s.selectedId}>
            <div className="map-overlays">
              <div className="absolute top-3 left-3 bottom-[calc(var(--footer-rail)+24px)] w-[300px] flex flex-col gap-3 min-h-0">
                <AforoOverlay s={s} />
                {openAgent && <AgentDetailCard s={s} id={openAgent} onClose={() => setOpenAgent(null)} onSavePhone={ctl.setAgentPhone} />}
                <ActiveIncidents s={s} />
              </div>
              <div className="absolute top-3 left-[324px] right-[428px] flex flex-col items-center gap-3">
                <CierreCard s={s} className="w-[440px] max-w-full" />
                <DecisionCard className="glass w-[440px] max-w-full" d={decision} disabled={disabled} onApprove={() => void ctl.intervene({ type: 'approve_plan', payload: { decisionId: decision!.id } })} onReject={() => void ctl.intervene({ type: 'reject_plan', payload: { decisionId: decision!.id } })} />
              </div>

              <CoordinadorPanel s={s} selected={openAgent} onSelect={(id) => setOpenAgent((cur) => cur === id ? null : id)} className="absolute left-3 right-[428px] bottom-3 h-[var(--footer-rail)]" />
            </div>
          </CrisisMap>
          </div>
              <div className="absolute z-[1000] top-3 right-3 bottom-3 w-[404px] flex flex-col justify-end gap-3 pointer-events-none [&>*]:pointer-events-auto">
                <LlamadaCard s={s} call={call} disabled={disabled} className="mx-[14px]" onTake={() => { if (!disabled && call) void ctl.intervene({ type: 'take_call', payload: { callId: call.id } }) }} />
                <CronologiaChat s={s} className="min-h-0 max-h-full" footer={
                  <EventChat className="event-chat border-t border-line p-3 flex-none" disabled={disabled} pending={ctl.pending} onSend={ctl.sendEvent} placeholder="Describe qué está pasando…" />
                } />
              </div>
        </main>

      </div>

      <main className="mobile-chronology" aria-label="Cronología móvil">
        <header className="mobile-operation-header">
          <div><img src="/brand/zhivel-logo-dark.png" alt="Zhivel" /><span>MADRING · Hospitality</span></div>
          <div className="mobile-operation-status">
            <span className={ctl.stale ? 'connection-stale' : ''}><i />{ctl.stale ? 'Sin conexión' : 'Conectado'}</span>
            <time className="num">{fmtClock(s.clock.simSeconds)}</time>
          </div>
        </header>
        {ctl.stale && (
          <div role="alert" className="flex items-center gap-2 px-4 py-2 bg-red/10 border-b border-red/40 text-red text-[12px]">
            <WifiOff size={13} /> Datos sin actualizar
          </div>
        )}
        <CronologiaChat s={s} className="mobile-chronology-panel" footer={
          <EventChat className="event-chat border-t border-line p-4 flex-none" disabled={disabled} pending={ctl.pending} onSend={ctl.sendEvent} placeholder="Describe qué está pasando…" />
        } />
      </main>
    </div>
  )
}
