export type Tone = 'ink' | 'amber' | 'red' | 'green' | 'muted'

const TONES: Record<Tone, string> = {
  ink: 'text-ink',
  amber: 'text-amber',
  red: 'text-red',
  green: 'text-green',
  muted: 'text-muted',
}

const DOTS: Record<Tone, string> = { ink: 'bg-ink', amber: 'bg-amber', red: 'bg-red', green: 'bg-green', muted: 'bg-line-2' }

export function Pill({ tone, children, dot = true, pulse = false }: { tone: Tone; children: React.ReactNode; dot?: boolean; pulse?: boolean }) {
  return (
    <span className={`inline-flex items-center gap-1.5 text-[11px] uppercase tracking-[0.08em] whitespace-nowrap ${TONES[tone]}`}>
      {dot && <span className={`w-2 h-2 ${DOTS[tone]} ${pulse ? 'animate-pulse' : ''}`} />}
      {children}
    </span>
  )
}
