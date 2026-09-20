import { KIND_COLOR, TRACK_COLOR } from './icons'

export interface Layers { transporte: boolean; proveedores: boolean; accesos: boolean; contexto: boolean }

const ITEMS: Array<{ key: keyof Layers; label: string; cls: string }> = [
  { key: 'transporte', label: 'Shuttles, taxis y VIP', cls: 'bg-ink' },
  { key: 'proveedores', label: 'Proveedores y reparto', cls: 'bg-amber' },
  { key: 'accesos', label: 'Accesos y muelles', cls: 'bg-green' },
  { key: 'contexto', label: 'Parkings', cls: 'bg-line-2' },
]

export function MapLayersControl({ layers, onChange }: { layers: Layers; onChange: (l: Layers) => void }) {
  return (
    <div className="map-legend glass group">
      <div className="label flex items-center gap-2">Capas
        <span className="flex gap-1 group-hover:hidden group-focus-within:hidden">{ITEMS.map((it) => <span key={it.key} className={`w-2 h-2 ${layers[it.key] ? it.cls : 'bg-ink/10'}`} />)}</span>
      </div>
      <div className="max-h-0 overflow-hidden opacity-0 transition-all duration-200 group-hover:max-h-80 group-hover:opacity-100 group-hover:mt-1.5 group-focus-within:max-h-80 group-focus-within:opacity-100 group-focus-within:mt-1.5">
        {ITEMS.map((it) => (
          <label key={it.key} className="flex items-center gap-2 py-0.5 text-[12px] cursor-pointer">
            <button role="switch" aria-checked={layers[it.key]} onClick={() => onChange({ ...layers, [it.key]: !layers[it.key] })} className={`w-8 h-4 rounded-full relative transition-colors flex-none ${layers[it.key] ? it.cls : 'bg-ink/10'}`}>
              <span className={`absolute top-0.5 w-3 h-3 rounded-full bg-bg transition-all ${layers[it.key] ? 'left-4' : 'left-0.5'}`} />
            </button>
            {it.label}
          </label>
        ))}
        <div className="mt-2 pt-2 border-t border-line text-[11px] text-muted flex flex-col gap-1.5">
          <div className="flex items-center gap-2"><span className="legend-swatch legend-closed" /> Cerrado</div>
          <div className="flex items-center gap-2"><span className="legend-swatch legend-pending" /> Pendiente de confirmar</div>
          <div className="flex items-center gap-2"><span className="legend-swatch legend-ok" /> Confirmado u operativo</div>
          <div className="flex items-center gap-2"><span className="legend-swatch legend-idle" /> Sin usar en el plan</div>
          <div className="flex items-center gap-2 pt-1.5 border-t border-line"><span className="legend-dots" style={{ color: KIND_COLOR.bus }} /> Shuttles y autocares</div>
          <div className="flex items-center gap-2"><span className="legend-dots" style={{ color: KIND_COLOR.taxi }} /> Taxis</div>
          <div className="flex items-center gap-2"><span className="legend-dots" style={{ color: KIND_COLOR.vip }} /> Traslados VIP</div>
          <div className="flex items-center gap-2"><span className="legend-dots" style={{ color: KIND_COLOR.truck }} /> Catering</div>
          <div className="flex items-center gap-2"><span className="legend-dots" style={{ color: KIND_COLOR.van }} /> Reparto de última hora</div>
          <div className="flex items-center gap-2"><span className="legend-dots" style={{ color: '#e5484d' }} /> Retenido o con retraso</div>
          <div className="flex items-center gap-2 pt-1.5 border-t border-line"><span className="w-6 h-[4px]" style={{ background: TRACK_COLOR }} /> Trazado del circuito</div>
          <div className="flex items-center gap-2"><span className="legend-barrier" /> Norte y Sur no conectan</div>
        </div>
      </div>
    </div>
  )
}
