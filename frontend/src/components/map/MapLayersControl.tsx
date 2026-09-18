export interface Layers { transporte: boolean; proveedores: boolean; accesos: boolean }

const ITEMS: Array<{ key: keyof Layers; label: string; cls: string }> = [
  { key: 'transporte', label: 'Transporte', cls: 'bg-ink' },
  { key: 'proveedores', label: 'Proveedores', cls: 'bg-amber' },
  { key: 'accesos', label: 'Accesos y muelles', cls: 'bg-green' },
]

export function MapLayersControl({ layers, onChange }: { layers: Layers; onChange: (l: Layers) => void }) {
  return (
    <div className="absolute bottom-3 right-3 z-[1000] border border-line bg-panel/90 backdrop-blur px-3 py-2">
      <div className="label mb-1">Capas</div>
      {ITEMS.map((it) => (
        <label key={it.key} className="flex items-center gap-2 py-0.5 text-[12px] cursor-pointer">
          <button role="switch" aria-checked={layers[it.key]} onClick={() => onChange({ ...layers, [it.key]: !layers[it.key] })} className={`w-8 h-4 rounded-full relative transition-colors ${layers[it.key] ? it.cls : 'bg-ink/10'}`}>
            <span className={`absolute top-0.5 w-3 h-3 rounded-full bg-bg transition-all ${layers[it.key] ? 'left-4' : 'left-0.5'}`} />
          </button>
          {it.label}
        </label>
      ))}
    </div>
  )
}
