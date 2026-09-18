import { Building2, UtensilsCrossed, Bus, Users, Bot } from 'lucide-react'
import type { Area, CrisisState } from '../../domain/types'
import { Pill } from '../ui/Pill'
import { AGENT, COORD } from '../ui/status'

const ICONS: Record<Area, typeof Building2> = { espacios: Building2, catering: UtensilsCrossed, transporte: Bus, asistentes: Users }

export function CoordinadorPanel({ s }: { s: CrisisState }) {
  const c = COORD[s.coordinatorStatus]
  return (
    <section className="bg-panel border border-line rounded-lg">
      <header className="flex items-center gap-2 px-3 py-2 border-b border-line">
        <Bot size={16} className="text-cyan" />
        <h2 className="text-[14px] font-semibold">Coordinador · HappyRobot</h2>
        <span className="ml-auto" />
        <Pill tone={c.tone} pulse={s.coordinatorStatus !== 'estable'}>{c.label}</Pill>
      </header>
      <ul className="px-2 py-1">
        {s.agents.map((a) => {
          const I = ICONS[a.id]
          const st = AGENT[a.status]
          return (
            <li key={a.id} className="flex items-center gap-3 px-1 py-2 border-b border-line last:border-0">
              <span className="w-8 h-8 grid place-items-center rounded-md bg-panel-2 border border-line text-text/80 flex-none"><I size={16} /></span>
              <div className="min-w-0 flex-1">
                <div className="font-semibold leading-tight">{a.name}</div>
                <div className="text-[11px] text-muted truncate" title={a.objective}>{a.objective}</div>
                {a.lastResult && <div className="text-[11px] text-text/70 truncate" title={a.lastResult}>↳ {a.lastResult}</div>}
              </div>
              <Pill tone={st.tone} pulse={a.status === 'llamada'}>{st.label}</Pill>
            </li>
          )
        })}
      </ul>
    </section>
  )
}
