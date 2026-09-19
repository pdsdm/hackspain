export interface Layers { transporte: boolean; proveedores: boolean; accesos: boolean }

const ITEMS: Array<{ key: keyof Layers; label: string; cls: string }> = [
  { key: 'transporte', label: 'Transporte', cls: 'bg-ink' },
  { key: 'proveedores', label: 'Proveedores', cls: 'bg-amber' },
  { key: 'accesos', label: 'Accesos y muelles', cls: 'bg-green' },
]

export function MapLayersControl({ layers, onChange }: { layers: Layers; onChange: (l: Layers) => void }) {
  return (
    <div className="absolute bottom-3 right-[428px] z-[1000] glass px-3 py-2 group">
      <div className="label flex items-center gap-2">Capas
        <span className="flex gap-1 group-hover:hidden group-focus-within:hidden">{ITEMS.map((it) => <span key={it.key} className={`w-2 h-2 ${layers[it.key] ? it.cls : 'bg-ink/10'}`} />)}</span>
      </div>
      <div className="max-h-0 overflow-hidden opacity-0 transition-all duration-200 group-hover:max-h-64 group-hover:opacity-100 group-hover:mt-1 group-focus-within:max-h-64 group-focus-within:opacity-100 group-focus-within:mt-1">
      {ITEMS.map((it) => (
        <label key={it.key} className="flex items-center gap-2 py-0.5 text-[12px] cursor-pointer">
          <button role="switch" aria-checked={layers[it.key]} onClick={() => onChange({ ...layers, [it.key]: !layers[it.key] })} className={`w-8 h-4 rounded-full relative transition-colors ${layers[it.key] ? it.cls : 'bg-ink/10'}`}>
            <span className={`absolute top-0.5 w-3 h-3 rounded-full bg-bg transition-all ${layers[it.key] ? 'left-4' : 'left-0.5'}`} />
          </button>
          {it.label}
        </label>
      ))}
      <div className="mt-2 pt-2 border-t border-line text-[11px] text-muted space-y-1">
        <div className="flex items-center gap-2"><span className="w-6 h-1 bg-ink" /> Circuito MADRING</div>
        <div className="flex items-center gap-2"><span className="w-6 h-0.5 bg-red" style={{ backgroundImage: 'repeating-linear-gradient(90deg,#e5484d 0 4px,transparent 4px 8px)', background: 'none' }} /> Sin conexión / bloqueado</div>
        <div className="flex items-center gap-2"><span className="w-2 h-2 bg-red" /> Cerrado <span className="w-2 h-2 bg-amber ml-1" /> Pendiente <span className="w-2 h-2 bg-green ml-1" /> Confirmado</div>
        <div className="flex items-center gap-2"><span className="w-3 h-3 bg-ink" style={{ clipPath: 'polygon(0 0, 100% 0, 100% 70%, 70% 100%, 0 100%)' }} /> Puerta · dentro / cola</div>
      </div>
      </div>
    </div>
  )
}
