import type { CrisisState } from '../../domain/types'
import { fmtClock } from '../../domain/time'
import { attendance } from '../../domain/selectors'

export function NavTabs({ s }: { s: CrisisState }) {
  const total = s.guestGroups.reduce((a, g) => a + g.count, 0)
  const a = attendance(s)
  return (
    <nav className="flex items-stretch px-6 h-11 border-b border-line bg-bg flex-none">
      <ul className="flex items-stretch gap-1">
        <li className="flex items-center px-3.5 display text-[12px] tracking-[0.04em] uppercase border-b-2 font-bold border-ink text-ink">
          Vista general
        </li>
      </ul>
      <div className="ml-auto flex items-center gap-[18px] text-[12px] text-muted num">
        <span>{Math.round(a.entered).toLocaleString('es-ES')} / {a.expected.toLocaleString('es-ES')} asistentes</span>
        <span>{total.toLocaleString('es-ES')} invitados hospitalidad</span>
        <span>Plan v{s.planVersion}</span>
        <span className="text-ink font-semibold">{fmtClock(s.clock.simSeconds, true)}</span>
      </div>
    </nav>
  )
}
