import { useEffect, useRef, type ReactNode } from 'react'
import { AlertTriangle, ArrowUpRight, Check, Clock3, MessageSquare, Phone, Radio, UserRound, Users, Utensils, Bus, Building2, GitBranch, type LucideIcon } from 'lucide-react'
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
const CHANNEL = {
  call: { label: 'Llamada', icon: Phone },
  webcall: { label: 'Web Call', icon: Radio },
  sms: { label: 'SMS', icon: MessageSquare },
  api: { label: 'API', icon: Radio },
} as const

const RAW: Array<[RegExp, string]> = [
  [/^happyrobot:call_result$/i, 'Resultado de llamada recibido de HappyRobot'],
  [/^happyrobot:sms_result$/i, 'Resultado de SMS recibido de HappyRobot'],
  [/^happyrobot:(\w+)$/i, 'Evento de HappyRobot'],
]

function renderText(text: string) {
  const hit = RAW.find(([re]) => re.test(text.trim()))
  if (!hit) return text
  return <><code>{text.trim()}</code> {hit[1]}</>
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
  const lastId = items[items.length - 1]?.id
  return (
    <Glass label={`Cronología · ${n} ${n === 1 ? 'evento' : 'eventos'}`} className={`chronology-panel ${className}`}>
      <ul ref={ref} className="chat-log" aria-label="Eventos de la operación" onScroll={() => {
        const el = ref.current
        if (el) follow.current = el.scrollHeight - el.scrollTop - el.clientHeight < 64
      }}>
        {items.map((e) => {
          const look = EVENT[e.kind] ?? EVENT.info
          const area = e.area ? AREA[e.area] : undefined
          const source = e.channel ? CHANNEL[e.channel] : undefined
          const Icon = area?.icon ?? look.icon
          const name = e.actor ?? (e.kind === 'intervencion' ? 'Responsable' : area?.label ?? (e.kind === 'mensaje' ? 'Evento recibido' : 'Zhivel'))
          const simulated = e.simulated || e.actor?.startsWith('SIMULACIÓN')
          const tone = e.kind === 'intervencion' ? 'intervencion' : look.tone
          return (
              <li key={e.id} className={`timeline-item timeline-item--${tone}${e.id === lastId ? ' is-new' : ''}`}>
                <div className="timeline-card">
                  <div className="timeline-card-heading">
                    <span className="timeline-avatar"><Icon size={13} strokeWidth={1.8} /></span>
                    <span className="timeline-author">{name}</span>
                    <span className="timeline-chip"><look.icon aria-hidden="true" />{look.label}</span>
                    <time className="timeline-time num">{fmtClock(e.time)}</time>
                  </div>
                  <p className="timeline-text">{renderText(e.text)}</p>
                  {(source || simulated) && (
                    <span className="timeline-meta">
                      {source && <><source.icon aria-hidden="true" />{source.label}</>}
                      {simulated && <span className="sim">simulado</span>}
                    </span>
                  )}
                </div>
              </li>
          )
        })}
      </ul>
      {footer}
    </Glass>
  )
}
