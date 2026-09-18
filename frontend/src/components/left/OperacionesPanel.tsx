import { Building2, UtensilsCrossed, Bus, Users, ChevronRight } from 'lucide-react'
import type { CrisisState } from '../../domain/types'
import { areaSummary } from '../../domain/selectors'
import { Panel } from '../ui/Panel'

export function OperacionesPanel({ s, onSelect, selected }: { s: CrisisState; onSelect: (id: string) => void; selected: string | null }) {
  const a = areaSummary(s)
  const rows = [
    { id: 'area-espacios', icon: Building2, name: 'Espacios', main: `${a.spacesConfirmed} confirmados`, alt: a.spacesPending ? `${a.spacesPending} pendientes` : undefined, altTone: 'amber' },
    { id: 'area-catering', icon: UtensilsCrossed, name: 'Catering', main: `${a.deliveriesOk}/${s.deliveries.length} entregas`, alt: a.deliveriesBad ? `${a.deliveriesBad} incidencia${a.deliveriesBad > 1 ? 's' : ''}` : undefined, altTone: 'red' },
    { id: 'area-transporte', icon: Bus, name: 'Transporte', main: `${a.shuttlesOk}/${s.shuttles.length} shuttles`, alt: a.shuttlesBad ? `${a.shuttlesBad} incidencia${a.shuttlesBad > 1 ? 's' : ''}` : undefined, altTone: 'red' },
    { id: 'area-asistentes', icon: Users, name: 'Asistentes', main: `${a.informed}/600 informados`, alt: a.pendingNeeds ? `${a.pendingNeeds} necesidad pendiente` : undefined, altTone: 'amber' },
  ]
  return (
    <Panel title="Operaciones" bodyClass="p-2">
      <ul className="flex flex-col gap-1">
        {rows.map((r) => (
          <li key={r.id}>
            <button onClick={() => onSelect(r.id)} className={`w-full flex items-center gap-3 px-2 py-2 rounded-md border text-left hover:bg-white/5 ${selected === r.id ? 'border-cyan/40 bg-cyan/5' : 'border-transparent'}`}>
              <span className="w-9 h-9 grid place-items-center rounded-md bg-panel-2 border border-line text-cyan"><r.icon size={17} /></span>
              <span className="flex-1 min-w-0">
                <span className="block font-semibold">{r.name}</span>
                <span className="block text-[12px] text-muted">
                  {r.main}
                  {r.alt && <span className={r.altTone === 'red' ? 'text-red' : 'text-amber'}> · {r.alt}</span>}
                </span>
              </span>
              <ChevronRight size={14} className="text-muted" />
            </button>
          </li>
        ))}
      </ul>
    </Panel>
  )
}
