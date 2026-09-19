import type { CrisisState } from '../../domain/types'
import { fmtClock } from '../../domain/time'

const TABS = [{ label: 'Situación', id: 'situacion' }, { label: 'Qué ha cambiado', id: 'cambios' }, { label: 'Actividad de agentes', id: 'actividad' }]

export function NavTabs({ s }: { s: CrisisState }) {
  const total = s.guestGroups.reduce((a, g) => a + g.count, 0)
  return (
    <nav className="dashboard-nav">
      <ul className="flex items-stretch gap-1">
        {TABS.map((t, i) => (
          <li key={t.id} className={`flex items-center px-3.5 display text-[12px] tracking-[0.04em] uppercase border-b-2 ${i === 0 ? 'font-bold border-ink text-ink' : 'font-semibold border-transparent text-muted'}`}><a href={`#${t.id}`}>{t.label}</a></li>
        ))}
      </ul>
      <div className="ml-auto flex items-center gap-[18px] text-[12px] text-muted num">
        <span>{total.toLocaleString('es-ES')} invitados</span>
        <span>Plan v{s.planVersion}</span>
        <span className="text-ink font-semibold">{fmtClock(s.clock.simSeconds, true)}</span>
      </div>
    </nav>
  )
}
