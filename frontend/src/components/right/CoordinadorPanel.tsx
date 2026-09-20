import { useEffect, useRef, useState, type ReactNode } from 'react'
import { Bot, Building2, Bus, Network, Users, Utensils } from 'lucide-react'
import type { Area, CrisisState } from '../../domain/types'
import type { AgentFocus } from '../map/AgentDetailCard'
import { useStopMapEvents } from '../map/overlay'
import { Pill, type Tone } from '../ui/Pill'
import { agentCorrection } from '../../domain/selectors'
import { AGENT, COORD } from '../ui/status'

const ICONS = { espacios: Building2, catering: Utensils, transporte: Bus, asistentes: Users }
const ORDER: Area[] = ['espacios', 'catering', 'transporte', 'asistentes']

function AgentMark({ corrected }: { corrected: boolean }) {
  return (
    <span className="agent-learned" title={corrected ? 'El agente corrigió su plan anterior' : 'Agente de IA'}>
      <Bot size={12} aria-hidden="true" />
      Agente{corrected ? ' · corrigió' : ''}
    </span>
  )
}

function useStatusFlash(status: string, tone: Tone) {
  const prev = useRef<string | null>(null)
  const [flash, setFlash] = useState<Tone | null>(null)
  useEffect(() => {
    if (prev.current === null) {
      prev.current = status
      return
    }
    if (prev.current === status) return
    prev.current = status
    setFlash(null)
    const id = requestAnimationFrame(() => setFlash(tone))
    return () => cancelAnimationFrame(id)
  }, [status, tone])
  return { flash, clear: () => setFlash(null) }
}

function Tile({
  open,
  onSelect,
  tone,
  status,
  coordinator,
  children,
}: {
  open: boolean
  onSelect: () => void
  tone: Tone
  status: string
  coordinator?: boolean
  children: ReactNode
}) {
  const { flash, clear } = useStatusFlash(status, tone)
  return (
    <li>
      <button
        type="button"
        className={`agent-tile${coordinator ? ' agent-tile--coordinator' : ''}${open ? ' is-open' : ''}${flash ? ` is-flash is-flash-${flash}` : ''}`}
        aria-pressed={open}
        onClick={onSelect}
        onAnimationEnd={(e) => { if (e.target === e.currentTarget) clear() }}
      >
        {children}
      </button>
    </li>
  )
}

export function CoordinadorPanel({ s, selected, onSelect, className = '' }: {
  s: CrisisState
  selected: AgentFocus | null
  onSelect: (id: AgentFocus) => void
  className?: string
}) {
  const ref = useStopMapEvents<HTMLElement>()
  const c = COORD[s.coordinatorStatus] ?? COORD.replanificando
  return (
    <section ref={ref} className={`agents-panel glass ${className}`} aria-label="Panel de agentes">
      <header className="agents-panel-heading">
        <h2 className="label">Panel de agentes</h2>
        <span>Coordinación y especialistas · Plan v{s.planVersion}</span>
      </header>
      <ul className="agents-grid">
        <Tile open={selected === 'coordinador'} onSelect={() => onSelect('coordinador')} tone={c.tone} status={s.coordinatorStatus} coordinator>
          <div className="agent-tile-heading"><Network size={16} /><h3>Coordinador</h3><AgentMark corrected={Boolean(agentCorrection(s))} /></div>
          <Pill tone={c.tone} pulse={s.coordinatorStatus === 'replanificando'}>{c.label}</Pill>
          <div className="agent-tile-detail" aria-label="Función del coordinador">
            <p>Coordina a los especialistas y adapta el plan de la operación.</p>
          </div>
        </Tile>
        {ORDER.map((area) => {
          const a = s.agents.find((agent) => agent.id === area)
          if (!a) return null
          const st = AGENT[a.status] ?? AGENT.activo
          const Icon = ICONS[area]
          return (
            <Tile key={a.id} open={selected === a.id} onSelect={() => onSelect(a.id)} tone={st.tone} status={a.status}>
              <div className="agent-tile-heading"><Icon size={16} /><h3>{a.name}</h3><AgentMark corrected={Boolean(agentCorrection(s, a.id))} /></div>
              <Pill tone={st.tone} pulse={a.status === 'llamada'}>{st.label}</Pill>
              <div className="agent-tile-detail" aria-label={`Actividad de ${a.name}`}>
                <p>{a.objective}</p>
                {a.reason && <p className="agent-role">{a.reason}</p>}
                {a.lastResult && <p className="agent-result"><span>Último resultado</span>{a.lastResult}</p>}
              </div>
            </Tile>
          )
        })}
      </ul>
    </section>
  )
}
