import type { Tone } from './Pill'

const FILL: Record<Tone, string> = { ink: 'bg-ink', amber: 'bg-amber', red: 'bg-red', green: 'bg-green', muted: 'bg-line-2' }

export function StatBar({ value, max, tone }: { value: number; max: number; tone: Tone }) {
  const pct = max > 0 ? Math.min(100, Math.round((value / max) * 100)) : 0
  return (
    <div className="h-1 bg-line flex">
      <div className={`h-full transition-all duration-700 ${FILL[tone]}`} style={{ width: `${pct}%` }} />
    </div>
  )
}
