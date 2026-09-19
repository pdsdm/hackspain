import { ArrowUpDown, Ban, Bus, Truck, MapPin } from 'lucide-react'
import type { CrisisState, Space } from '../../domain/types'
import type { StateChange } from '../../domain/changes'
import { spaceLook } from '../ui/status'
import { fmtClock } from '../../domain/time'

export function PlanoOperativo({ s, changes, onSelect }: { s: CrisisState; changes: StateChange[]; onSelect: (id: string) => void }) {
  const changed = new Set(changes.map((c) => c.resourceId))
  const location = (id: string) => s.spaces.find((sp) => sp.id === id)?.name ?? id
  function card(sp: Space) {
    const status = spaceLook(sp.status)
    return <button key={sp.id} onClick={() => onSelect(sp.id)} aria-pressed={s.selectedId === sp.id} className={`site-node ${changed.has(sp.id) ? 'site-changed' : ''} ${s.selectedId === sp.id ? 'site-selected' : ''}`}>
      <span className="flex justify-between gap-2"><span className={`site-status status-${status.tone}`}>{status.label}</span>{changed.has(sp.id) && <span className="change-tag">Cambio</span>}</span>
      <strong>{sp.name}</strong>
      <span className="text-muted text-[12px]">{sp.capacity ? `${sp.capacity} ${sp.kind === 'espera' ? 'en espera' : 'plazas'}` : sp.kind === 'muelle' ? 'Descarga de catering' : 'Control de acceso'}{sp.readyAt ? ` · ${fmtClock(sp.readyAt)}` : ''}</span>
    </button>
  }
  return <div className="operative-plan">
    <div className="plan-zones">
      <section className="site-zone north" aria-label="Zona Norte">
        <header><h3>NORTE</h3><span>Requiere pase Norte y traslado exterior</span></header>
        <div className="site-grid north-grid">{s.spaces.filter((sp) => sp.zone === 'norte').map(card)}</div>
      </section>
      <div className="site-barrier"><Ban size={14} /><span>Sin conexión interior entre Norte y Sur</span></div>
      <section className="site-zone south" aria-label="Zona Sur">
        <header><h3>SUR</h3><span>Zona de los pases de los 600 invitados de la demo</span></header>
        <div className="site-grid">{s.spaces.filter((sp) => sp.zone === 'sur').map(card)}</div>
      </section>
    </div>
    <aside className="external-lane"><ArrowUpDown size={22} /><strong>Traslado exterior</strong><p>Vehículo + permiso + horario</p><span>Debe confirmarse antes de mover invitados</span></aside>
    <div className="plan-vehicles">
      <h3 className="label flex items-center gap-2"><MapPin size={14} /> Transporte y entregas · hora prevista</h3>
      <div className="vehicle-grid">{s.shuttles.map((sh) => <button key={sh.id} aria-pressed={s.selectedId === sh.id} className={`vehicle-item ${changed.has(sh.id) ? 'site-changed' : ''}`} onClick={() => onSelect(sh.id)}><Bus size={17} /><span><strong>{sh.name} · {sh.passengers} personas</strong><span>{location(sh.destinationId)} · {fmtClock(sh.arriveAt)}</span><span className={sh.status === 'retrasado' ? 'text-red' : 'text-muted'}>{sh.status.replaceAll('_', ' ')} · {sh.accepted ? 'coordinado' : 'sin confirmar'}</span></span>{changed.has(sh.id) && <span className="change-tag">Δ</span>}</button>)}</div>
      <div className="vehicle-grid deliveries">{s.deliveries.map((d) => <button key={d.id} aria-pressed={s.selectedId === d.id} className={`vehicle-item ${changed.has(d.id) ? 'site-changed' : ''}`} onClick={() => onSelect(d.id)}><Truck size={17} /><span><strong>{d.id} · {d.services} servicios</strong><span>{location(d.dockId)} · {fmtClock(d.arriveAt)}</span><span className={['bloqueada', 'invalidada', 'retrasada'].includes(d.status) ? 'text-red' : 'text-muted'}>{d.status}</span></span>{changed.has(d.id) && <span className="change-tag">Δ</span>}</button>)}</div>
    </div>
    <p className="plan-caption">Plano esquemático de demo · sin escala. «Cambio» compara con la referencia elegida; selecciona un recurso para ver el detalle.</p>
  </div>
}
