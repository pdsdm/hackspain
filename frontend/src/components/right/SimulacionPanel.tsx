import { useState } from 'react'
import { FlaskConical, ChevronDown, ChevronUp, Radio } from 'lucide-react'
import type { CrisisState, TwistId } from '../../domain/types'
import { TWISTS } from '../../domain/twists'

export function SimulacionPanel({ s, onTwist, onLive }: { s: CrisisState; onTwist: (t: TwistId) => void; onLive: (enabled: boolean, seed?: number) => void }) {
  const [open, setOpen] = useState(false)
  const [seed, setSeed] = useState('')
  const live = s.clock.live === true
  return (
    <section className="bg-panel border border-dashed border-line-2">
      <button onClick={() => setOpen(!open)} className="w-full flex items-center gap-2 px-4 py-2.5 label hover:text-ink">
        <FlaskConical size={13} className="text-amber" /> Control de simulación · jurado
        <span className="ml-auto">{open ? <ChevronUp size={14} /> : <ChevronDown size={14} />}</span>
      </button>
      {open && (
        <div className="px-2 pb-2 grid grid-cols-1 gap-1 max-h-64 overflow-y-auto">
          <div className={`flex items-center gap-2 px-3 py-2 border ${live ? 'border-amber bg-amber/5' : 'border-line'}`}>
            <Radio size={13} className={live ? 'text-amber' : 'text-muted'} />
            <div className="flex-1 min-w-0">
              <div className="text-[12px] font-medium">Modo vivo{live ? ' · activo' : ''}</div>
              <div className="text-[11px] text-muted">{s.clock.liveMode === 'catalog' ? 'Catálogo fijo' : 'El LLM inventa la incidencia'} cada 3 min, intercalado con un giro del jurado · semilla {live ? s.clock.liveSeed ?? '—' : (seed || 'aleatoria')}</div>
            </div>
            {!live && <input aria-label="Semilla del Modo vivo" inputMode="numeric" placeholder="semilla" value={seed} onChange={(e) => setSeed(e.target.value.replace(/\D/g, ''))} className="w-16 text-[11px] px-1.5 py-1 border border-line bg-transparent num" />}
            <button onClick={() => onLive(!live, seed ? Number(seed) : undefined)} className={`text-[11px] px-2 py-1 border ${live ? 'border-amber text-amber' : 'border-line hover:border-amber'}`}>{live ? 'Apagar' : 'Encender'}</button>
          </div>
          {TWISTS.map((t) => {
            const used = s.twistsApplied.includes(t.id)
            return (
              <button key={t.id} disabled={used} onClick={() => onTwist(t.id)} className="text-left px-3 py-2 border border-line hover:border-amber hover:bg-amber/5 disabled:opacity-40 disabled:hover:border-line disabled:hover:bg-transparent">
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
