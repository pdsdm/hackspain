import { ArrowRight, History, CheckCheck } from 'lucide-react'
import type { CrisisState } from '../../domain/types'
import type { StateChange } from '../../domain/changes'
import { fmtClock } from '../../domain/time'

export function CambiosPanel({ reference, changes, onSelect, onReference }: { reference: CrisisState; changes: StateChange[]; onSelect: (id: string) => void; onReference: () => void }) {
  return (
    <section className="bg-panel border border-line" aria-labelledby="changes-title">
      <header className="flex flex-wrap items-center justify-between gap-3 p-4 border-b border-line">
        <div>
          <h2 id="changes-title" className="display font-bold text-[15px] flex items-center gap-2"><History size={17} /> Qué ha cambiado <span className="change-count">{changes.length}</span></h2>
          <p className="text-muted text-[12px] mt-1">Desde {fmtClock(reference.clock.simSeconds, true)} · plan v{reference.planVersion}. La referencia se mantiene hasta que la actualices.</p>
        </div>
        <button onClick={onReference} className="small-button" disabled={!changes.length}><CheckCheck size={15} /> Comparar desde ahora</button>
      </header>
      {changes.length === 0 ? <p className="p-5 text-muted">Sin cambios operativos desde la referencia.</p> : (
        <ul className="change-list">
          {changes.map((c) => (
            <li key={c.id}>
              <div className="flex gap-2 justify-between mb-1">
                {c.resourceId ? <button className="font-semibold text-left hover:underline" onClick={() => onSelect(c.resourceId!)}>{c.title} ↗</button> : <strong>{c.title}</strong>}
                <span className="text-muted text-[11px]">{c.category}</span>
              </div>
              <div className="change-values"><span><small>ANTES</small>{c.before}</span><ArrowRight size={15} aria-label="ahora" /><span><small>AHORA</small>{c.after}</span></div>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
