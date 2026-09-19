import { useEffect, useRef, type ReactNode } from 'react'
import { Activity, AlertTriangle, ArrowUpRight, Check, Clock3, MessageSquare, UserRound, Users, Utensils, Bus, Building2, GitBranch, type LucideIcon } from 'lucide-react'
import type { Area, CrisisState, EventKind } from '../../domain/types'
import { fmtClock } from '../../domain/time'
import { Glass } from './Glass'

const EVENT: Record<EventKind, { label: string; tone: string; icon: LucideIcon }> = {
  incidencia: { label: 'Incidencia', tone: 'rose', icon: AlertTriangle },
  fallo: { label: 'Atención', tone: 'rose', icon: AlertTriangle },
  accion: { label: 'Acción', tone: 'lilac', icon: ArrowUpRight },
  acuerdo: { label: 'Acuerdo', tone: 'mint', icon: Check },
  espera: { label: 'En espera', tone: 'sand', icon: Clock3 },
  decision: { label: 'Decisión', tone: 'sand', icon: GitBranch },
  intervencion: { label: 'Intervención', tone: 'white', icon: UserRound },
  info: { label: 'Actualización', tone: 'white', icon: Activity },
  mensaje: { label: 'Mensaje', tone: 'lilac', icon: MessageSquare },
}
const AREA: Record<Area, { label: string; icon: LucideIcon }> = {
  espacios: { label: 'Espacios', icon: Building2 },
  catering: { label: 'Catering', icon: Utensils },
  transporte: { label: 'Transporte', icon: Bus },
  asistentes: { label: 'Asistentes', icon: Users },
}

export function CronologiaChat({ s, className = 'w-[460px] h-[230px]', footer }: { s: CrisisState; className?: string; footer?: ReactNode }) {
  const ref = useRef<HTMLUListElement>(null)
  const follow = useRef(true)
  const n = s.events.length
  useEffect(() => {
    const el = ref.current
    if (el && follow.current) el.scrollTo({ top: el.scrollHeight, behavior: 'instant' })
  }, [n])
  const items = s.events.slice(-40)
  return (
    <Glass label="Cronología" className={`chronology-panel ${className}`}>
      <header className="chronology-heading">
        <div><h2>Cronología</h2><p>La operación, paso a paso.</p></div>
        <span className="chronology-count num">{n} {n === 1 ? 'evento' : 'eventos'}</span>
      </header>
      <ul ref={ref} className="chat-log" aria-label="Eventos de la operación" onScroll={() => {
        const el = ref.current
        if (el) follow.current = el.scrollHeight - el.scrollTop - el.clientHeight < 64
      }}>
        {items.length === 0 && <li className="chronology-empty">
          <span className="chronology-empty-icon"><Activity size={22} strokeWidth={1.5} /></span>
          <h3>Todo empieza aquí</h3>
          <p>Los avisos, las acciones y las decisiones aparecerán en esta cronología.</p>
        </li>}
        {items.map((e) => {
          const look = EVENT[e.kind] ?? EVENT.info
          const area = e.area ? AREA[e.area] : undefined
          const Icon = area?.icon ?? look.icon
          const name = e.kind === 'intervencion' ? 'Responsable' : area?.label ?? (e.kind === 'mensaje' ? 'Evento recibido' : 'Zhivel')
          return (
            <li key={e.id} className={`timeline-card timeline-card--${look.tone}`}>
              <div className="timeline-card-heading">
                <span className="timeline-avatar"><Icon size={16} strokeWidth={1.7} /></span>
                <span className="timeline-author">{name}</span>
                <time className="timeline-time num">{fmtClock(e.time)}</time>
              </div>
              <p className="timeline-text">{e.text}</p>
              <span className="timeline-kind"><look.icon size={11} aria-hidden="true" />{look.label}</span>
            </li>
          )
        })}
      </ul>
      {footer}
    </Glass>
  )
}
