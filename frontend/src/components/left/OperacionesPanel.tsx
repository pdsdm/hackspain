import type { CrisisState } from '../../domain/types'
import { areaSummary } from '../../domain/selectors'

export function OperacionesPanel({ s, onSelect, selected }: { s: CrisisState; onSelect: (id: string) => void; selected: string | null }) {
  const a = areaSummary(s)
  const rows = [
    { id: 'area-espacios', name: 'Espacios', value: `${a.spacesConfirmed}`, sub: `${a.spacesConfirmed} confirmados${a.spacesPending ? ` · ${a.spacesPending} pendientes` : ''}`, tone: a.spacesPending ? 'text-amber' : 'text-ink' },
    { id: 'area-catering', name: 'Catering', value: `${a.deliveriesOk}/${s.deliveries.length}`, sub: `entregas${a.deliveriesBad ? ` · ${a.deliveriesBad} incidencia${a.deliveriesBad > 1 ? 's' : ''}` : ''}`, tone: a.deliveriesBad ? 'text-red' : 'text-ink' },
    { id: 'area-transporte', name: 'Transporte', value: `${a.shuttlesOk}/${s.shuttles.length}`, sub: `shuttles${a.shuttlesBad ? ` · ${a.shuttlesBad} incidencia${a.shuttlesBad > 1 ? 's' : ''}` : ''}`, tone: a.shuttlesBad ? 'text-red' : 'text-ink' },
    { id: 'area-asistentes', name: 'Asistentes', value: `${a.informed}`, sub: `informados de 600${a.pendingNeeds ? ` · ${a.pendingNeeds} necesidad pendiente` : ''}`, tone: a.pendingNeeds ? 'text-amber' : 'text-ink' },
  ]
  return (
    <section className="bg-panel border border-line flex flex-col">
      <h2 className="label px-4 py-3 border-b border-line">Operaciones</h2>
      <ul className="flex flex-col">
        {rows.map((r) => {
          const on = selected === r.id
          return (
            <li key={r.id}>
              <button onClick={() => onSelect(r.id)} className={`w-full flex items-center gap-3.5 px-4 py-3.5 border-b border-line border-l-[3px] text-left hover:bg-ink/5 ${on ? 'border-l-ink bg-panel-2' : 'border-l-transparent'}`}>
                <span className="flex-1 min-w-0 flex flex-col gap-0.5">
                  <span className="display font-bold text-[14px]">{r.name}</span>
                  <span className="text-[12px] text-muted">{r.sub}</span>
                </span>
                <span className={`display font-extrabold text-[22px] tracking-[-0.02em] num ${r.tone}`}>{r.value}</span>
              </button>
            </li>
          )
        })}
      </ul>
    </section>
  )
}
