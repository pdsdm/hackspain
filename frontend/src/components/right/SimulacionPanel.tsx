import { useState } from 'react'
import { FlaskConical, ChevronDown, ChevronUp } from 'lucide-react'
import type { CrisisState, TwistId } from '../../domain/types'
import { TWISTS } from '../../domain/twists'

export function SimulacionPanel({ s, onTwist }: { s: CrisisState; onTwist: (t: TwistId) => void }) {
  const [open, setOpen] = useState(false)
  return (
    <section className="bg-panel border border-dashed border-line rounded-lg">
      <button onClick={() => setOpen(!open)} className="w-full flex items-center gap-2 px-3 py-2 text-[11px] uppercase tracking-[0.12em] text-muted hover:text-text">
        <FlaskConical size={13} className="text-amber" /> Control de simulación · jurado
        <span className="ml-auto">{open ? <ChevronUp size={14} /> : <ChevronDown size={14} />}</span>
      </button>
      {open && (
        <div className="px-2 pb-2 grid grid-cols-1 gap-1 max-h-64 overflow-y-auto">
          {TWISTS.map((t) => {
            const used = s.twistsApplied.includes(t.id)
            return (
              <button key={t.id} disabled={used} onClick={() => onTwist(t.id)} className="text-left px-2 py-1.5 rounded-md border border-line hover:border-amber/50 hover:bg-amber/5 disabled:opacity-40 disabled:hover:border-line disabled:hover:bg-transparent">
                <div className="text-[12px] font-medium">{t.label}</div>
                <div className="text-[11px] text-muted">{t.consequence}{used ? ' · aplicado' : ''}</div>
              </button>
            )
          })}
        </div>
      )}
    </section>
  )
}
