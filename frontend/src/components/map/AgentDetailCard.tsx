import { useEffect } from 'react'
import { Building2, Bus, Network, Users, Utensils, X } from 'lucide-react'
import type { Area, CrisisState } from '../../domain/types'
import { fmtClock } from '../../domain/time'
import { Pill, type Tone } from '../ui/Pill'
import { AGENT, COMMITMENT, COORD } from '../ui/status'

const TONE: Record<Tone, string> = { ink: 'text-ink', amber: 'text-amber', red: 'text-red', green: 'text-green', muted: 'text-muted' }
import { Glass } from './Glass'

export type AgentFocus = 'coordinador' | Area

const ICONS = { coordinador: Network, espacios: Building2, catering: Utensils, transporte: Bus, asistentes: Users } as const

function focusOf(s: CrisisState, id: AgentFocus) {
  if (id === 'coordinador') {
    const st = COORD[s.coordinatorStatus] ?? COORD.replanificando
    return {
      name: 'Coordinador',
      status: st,
      objective: 'Coordina a los especialistas y adapta el plan de la operación.',
      reason: `Coordinación global · Plan v${s.planVersion}`,
      lastResult: undefined as string | undefined,
      area: undefined as Area | undefined,
    }
  }
  const a = s.agents.find((agent) => agent.id === id)
  const st = AGENT[a?.status ?? 'activo'] ?? AGENT.activo
  return {
    name: a?.name ?? id,
    status: st,
    objective: a?.objective ?? 'Sin objetivo publicado.',
    reason: a?.reason,
    lastResult: a?.lastResult,
    area: id,
  }
}

export function AgentDetailCard({ s, id, onClose }: { s: CrisisState; id: AgentFocus; onClose: () => void }) {
  const focus = focusOf(s, id)
  const Icon = ICONS[id]
  const commitments = (focus.area ? s.commitments.filter((c) => c.area === focus.area) : s.commitments).slice(0, 4)
  const events = [...s.events].reverse().filter((e) => (focus.area ? e.area === focus.area : !e.area || e.kind === 'decision' || e.kind === 'intervencion')).slice(0, 3)

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  return (
    <Glass label={`Detalle de ${focus.name}`} className="w-[300px] agent-detail">
      <header className="agent-detail-heading">
        <div className="agent-detail-title"><Icon size={15} /><h2>{focus.name}</h2></div>
        <Pill tone={focus.status.tone}>{focus.status.label}</Pill>
        <button type="button" className="agent-detail-close" onClick={onClose} aria-label="Cerrar detalle del agente">
          <X size={14} />
        </button>
      </header>
      <div className="agent-detail-body">
        <p className="agent-detail-objective">{focus.objective}</p>
        {focus.reason && <p className="agent-role">{focus.reason}</p>}
        {focus.lastResult && (
          <p className="agent-result"><span>Último resultado</span>{focus.lastResult}</p>
        )}
        {commitments.length > 0 && (
          <section>
            <h3>Compromisos</h3>
            <ul>
              {commitments.map((c) => {
                const meta = COMMITMENT[c.status] ?? COMMITMENT.propuesto
                return (
                  <li key={c.id}>
                    <span>{c.title}</span>
                    <small className={TONE[meta.tone]}>{meta.label} · {c.counterpart}</small>
                  </li>
                )
              })}
            </ul>
          </section>
        )}
        {events.length > 0 && (
          <section>
            <h3>Última actividad</h3>
            <ul>
              {events.map((e) => (
                <li key={e.id}>
                  <span>{e.text}</span>
                  <small>{fmtClock(e.time)}{e.actor ? ` · ${e.actor}` : ''}</small>
                </li>
              ))}
            </ul>
          </section>
        )}
      </div>
    </Glass>
  )
}
