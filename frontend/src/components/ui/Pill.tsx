export type Tone = 'cyan' | 'amber' | 'red' | 'green' | 'muted'

const TONES: Record<Tone, string> = {
  cyan: 'bg-cyan/10 text-cyan border-cyan/30',
  amber: 'bg-amber/10 text-amber border-amber/30',
  red: 'bg-red/10 text-red border-red/30',
  green: 'bg-green/10 text-green border-green/30',
  muted: 'bg-white/5 text-muted border-line',
}

const DOTS: Record<Tone, string> = { cyan: 'bg-cyan', amber: 'bg-amber', red: 'bg-red', green: 'bg-green', muted: 'bg-muted' }

export function Pill({ tone, children, dot = true, pulse = false }: { tone: Tone; children: React.ReactNode; dot?: boolean; pulse?: boolean }) {
  return (
    <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md border text-[11px] font-medium whitespace-nowrap ${TONES[tone]}`}>
      {dot && <span className={`w-1.5 h-1.5 rounded-full ${DOTS[tone]} ${pulse ? 'animate-pulse' : ''}`} />}
      {children}
    </span>
  )
}
