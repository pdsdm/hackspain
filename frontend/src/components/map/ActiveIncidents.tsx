import { AlertTriangle, Building2, MessageSquareText, Phone, Radio, Truck, type LucideIcon } from 'lucide-react'
import type { Area, CrisisState, TimelineEvent } from '../../domain/types'
import { Glass } from './Glass'

type Incident = {
  id: string
  title: string
  detail: string
  impact: string
  area: Area
  icon: LucideIcon
  event?: TimelineEvent
}

const CHANNEL = {
  call: { label: 'Llamada', icon: Phone },
  webcall: { label: 'Web Call', icon: Radio },
  sms: { label: 'SMS', icon: MessageSquareText },
  api: { label: 'API', icon: Radio },
} as const

function latestEvent(s: CrisisState, area: Area, words: string[]): TimelineEvent | undefined {
  return [...s.events].reverse().find((event) => event.area === area && words.some((word) => event.text.toLowerCase().includes(word)))
}

function incidents(s: CrisisState): Incident[] {
  const result: Incident[] = []
  const totalGuests = s.guestGroups.reduce((sum, group) => sum + group.count, 0)
  const principal = s.spaces.find((space) => space.id === 'principal')
  if (principal && ['cerrado', 'descartado'].includes(principal.status)) {
    result.push({
      id: principal.id,
      title: principal.name,
      detail: principal.note ?? 'No disponible',
      impact: `${totalGuests.toLocaleString('es-ES')} VIP afectados`,
      area: 'espacios',
      icon: Building2,
      event: latestEvent(s, 'espacios', ['principal', 'tubería', 'agua']),
    })
  }

  const dock = s.spaces.find((space) => space.id === 'muelleEste')
  const blocked = s.deliveries.filter((delivery) => delivery.status === 'bloqueada' || delivery.status === 'invalidada')
  if ((dock && ['cerrado', 'descartado'].includes(dock.status)) || blocked.length > 0) {
    const affected = (blocked.length > 0 ? blocked : s.deliveries.filter((delivery) => delivery.status !== 'entregada'))
      .reduce((sum, delivery) => sum + delivery.services, 0)
    result.push({
      id: dock?.id ?? 'deliveries-blocked',
      title: dock?.name ?? 'Entregas de catering',
      detail: dock?.note ?? 'Entregas bloqueadas',
      impact: `${affected.toLocaleString('es-ES')} servicios afectados`,
      area: 'catering',
      icon: Truck,
      event: latestEvent(s, 'catering', ['muelle', 'camión', 'descarga']),
    })
  }

  return result.slice(0, 3)
}

export function ActiveIncidents({ s }: { s: CrisisState }) {
  const active = incidents(s)
  if (active.length === 0) return null
  return (
    <Glass label="Incidencias activas" className="w-[300px] max-h-[230px] overflow-hidden flex-none">
      <header className="flex items-center gap-2 px-4 py-2.5 border-b border-line">
        <AlertTriangle size={13} className="text-red" />
        <h2 className="label">Incidencias activas</h2>
        <span className="ml-auto text-[11px] num text-red">{active.length}</span>
      </header>
      <ul className="overflow-y-auto">
        {active.map((incident) => {
          const Icon = incident.icon
          const source = incident.event?.channel ? CHANNEL[incident.event.channel] : undefined
          const SourceIcon = source?.icon
          return (
            <li key={incident.id} className="px-4 py-2.5 border-b border-line last:border-0 bg-red/[0.035]">
              <div className="flex items-center gap-2">
                <Icon size={14} className="text-red flex-none" />
                <strong className="text-[12px] leading-tight truncate">{incident.title}</strong>
                {source && SourceIcon && (
                  <span className="ml-auto flex items-center gap-1 text-[9px] uppercase tracking-[0.08em] text-muted">
                    <SourceIcon size={10} /> {source.label}
                  </span>
                )}
              </div>
              <p className="mt-1 text-[11px] text-text/80 leading-snug">{incident.detail}</p>
              <p className="mt-1 text-[10px] text-red">{incident.impact}{incident.event?.actor ? ` · ${incident.event.actor}` : ''}</p>
            </li>
          )
        })}
      </ul>
    </Glass>
  )
}
