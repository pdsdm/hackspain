import type { CrisisState } from '../../domain/types'
import { Pill } from '../ui/Pill'
import { AGENT, COORD } from '../ui/status'

const DOT: Record<string, string> = { ink: 'bg-ink', amber: 'bg-amber', red: 'bg-red', green: 'bg-green', muted: 'bg-line-2' }

export function CoordinadorPanel({ s }: { s: CrisisState }) {
  const c = COORD[s.coordinatorStatus]
  return (
    <section className="bg-panel border border-line flex flex-col">
      <header className="flex items-center gap-2.5 px-4 py-3 border-b border-line">
        <h2 className="label">Coordinador</h2>
        <span className="ml-auto" />
        <Pill tone={c.tone} pulse={s.coordinatorStatus !== 'estable'}>{c.label}</Pill>
      </header>
      <ul>
        {s.agents.map((a) => {
          const st = AGENT[a.status]
          return (
            <li key={a.id} className="flex items-center gap-3 px-4 py-3 border-b border-line last:border-0">
              <span className={`w-2 h-2 flex-none ${DOT[st.tone]} ${a.status === 'llamada' ? 'animate-pulse' : ''}`} />
              <div className="min-w-0 flex-1 flex flex-col gap-0.5">
                <div className="display font-bold text-[13px] leading-tight">{a.name}</div>
                <div className="text-[11px] text-muted leading-relaxed">{a.objective}</div>
                {a.lastResult && <div className="text-[11px] text-text/70 leading-relaxed">↳ {a.lastResult}</div>}
              </div>
              <Pill tone={st.tone} dot={false}>{st.label}</Pill>
            </li>
          )
        })}
      </ul>
    </section>
  )
}
