import { Building2, Bus, Network, Users, Utensils } from 'lucide-react'
import type { Area, CrisisState } from '../../domain/types'
import { Pill } from '../ui/Pill'
import { AGENT, COORD } from '../ui/status'

const ICONS = { espacios: Building2, catering: Utensils, transporte: Bus, asistentes: Users }
const ORDER: Area[] = ['espacios', 'catering', 'transporte', 'asistentes']

export function CoordinadorPanel({ s, className = '' }: { s: CrisisState; className?: string }) {
  const c = COORD[s.coordinatorStatus] ?? COORD.replanificando
  return (
    <section className={`agents-panel glass ${className}`} aria-label="Panel de agentes">
      <header className="agents-panel-heading">
        <h2 className="label">Panel de agentes</h2>
        <span>Coordinación y especialistas · Plan v{s.planVersion}</span>
      </header>
      <ul className="agents-grid">
        <li className="agent-tile agent-tile--coordinator">
          <div className="agent-tile-heading"><Network size={16} /><h3>Coordinador</h3></div>
          <Pill tone={c.tone} pulse={s.coordinatorStatus === 'replanificando'}>{c.label}</Pill>
          <div className="agent-tile-detail" tabIndex={0} aria-label="Función del coordinador">
            <p>Coordina a los especialistas y adapta el plan de la operación.</p>
            <p className="agent-role">Coordinación global · Plan v{s.planVersion}</p>
          </div>
        </li>
        {ORDER.map((area) => {
          const a = s.agents.find((agent) => agent.id === area)
          if (!a) return null
          const st = AGENT[a.status] ?? AGENT.activo
          const Icon = ICONS[area]
          return (
            <li key={a.id} className="agent-tile">
              <div className="agent-tile-heading"><Icon size={16} /><h3>{a.name}</h3></div>
              <Pill tone={st.tone} pulse={a.status === 'llamada'}>{st.label}</Pill>
              <div className="agent-tile-detail" tabIndex={0} aria-label={`Actividad de ${a.name}`}>
                <p>{a.objective}</p>
                {a.reason && <p className="agent-role">{a.reason}</p>}
                {a.lastResult && <p className="agent-result"><span>Último resultado</span>{a.lastResult}</p>}
              </div>
            </li>
          )
        })}
      </ul>
    </section>
  )
}
