import type { Tone } from './Pill'

const FILL: Record<Tone, string> = { cyan: 'bg-cyan', amber: 'bg-amber', red: 'bg-red', green: 'bg-green', muted: 'bg-muted' }

export function StatBar({ value, max, tone }: { value: number; max: number; tone: Tone }) {
  const pct = max > 0 ? Math.min(100, Math.round((value / max) * 100)) : 0
  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 h-1.5 rounded-full bg-white/5 overflow-hidden">
        <div className={`h-full rounded-full transition-all duration-700 ${FILL[tone]}`} style={{ width: `${pct}%` }} />
      </div>
      <span className="text-[11px] text-muted num w-9 text-right">{pct}%</span>
    </div>
  )
}
