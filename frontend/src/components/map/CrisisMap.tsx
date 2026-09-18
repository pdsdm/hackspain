import { Fragment, useState } from 'react'
import { MapContainer, TileLayer, Polygon, Polyline, Marker, Tooltip } from 'react-leaflet'
import type { CrisisState } from '../../domain/types'
import { ZONE_NORTE, ZONE_SUR } from '../../domain/initialState'
import { fmtClock } from '../../domain/time'
import { SPACE } from '../ui/status'
import { pinIcon, vehicleIcon, zoneLabelIcon } from './icons'
import { pointAlong, progress } from './geo'
import { MapLayersControl, type Layers } from './MapLayersControl'

const TILES = 'https://tile.openstreetmap.org/{z}/{x}/{y}.png'
const ATTR = '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'

export function CrisisMap({ s, onSelect, selected }: { s: CrisisState; onSelect: (id: string) => void; selected: string | null }) {
  const [layers, setLayers] = useState<Layers>({ transporte: true, proveedores: true, accesos: true })
  const now = s.clock.simSeconds

  return (
    <div className="relative h-full w-full overflow-hidden border border-line bg-panel">
      <MapContainer center={[40.4712, -3.6215]} zoom={15} zoomControl={false} attributionControl className="h-full w-full">
        <TileLayer url={TILES} attribution={ATTR} maxZoom={19} className="dark-tiles" />

        <Polygon positions={ZONE_SUR} pathOptions={{ color: '#1a1d24', weight: 1.5, fillColor: '#1a1d24', fillOpacity: 0.06, dashArray: '4 4' }} />
        <Polygon positions={ZONE_NORTE} pathOptions={{ color: '#a78bfa', weight: 1.5, fillColor: '#a78bfa', fillOpacity: 0.06, dashArray: '4 4' }} />
        <Marker position={[40.4602, -3.6190]} icon={zoneLabelIcon('MADRING Sur')} interactive={false} />
        <Marker position={[40.4826, -3.6145]} icon={zoneLabelIcon('MADRING Norte')} interactive={false} />
        <Polyline positions={[[40.4715, -3.6190], [40.4720, -3.6150]]} pathOptions={{ color: '#e5484d', weight: 3, dashArray: '6 6' }}>
          <Tooltip permanent direction="right" offset={[6, 0]}>Sin conexión interior Norte ↔ Sur</Tooltip>
        </Polyline>

        {s.spaces.map((sp) => {
          if (!layers.accesos && (sp.kind === 'acceso' || sp.kind === 'muelle')) return null
          if (sp.status === 'inactivo' && (sp.kind === 'espera')) return null
          const st = SPACE[sp.status]
          const sub = sp.capacity && sp.kind !== 'acceso' ? `${sp.capacity}` : undefined
          return (
            <Marker key={sp.id} position={sp.pos} icon={pinIcon(sp.name, `${st.cls}${selected === sp.id ? ' ring' : ''}`, sub)} eventHandlers={{ click: () => onSelect(sp.id) }}>
              <Tooltip direction="top" offset={[40, -8]}>
                <b>{sp.name}</b> · {st.label}{sp.note ? ` · ${sp.note}` : ''}
              </Tooltip>
            </Marker>
          )
        })}

        {layers.transporte && s.shuttles.map((sh) => {
          const t = progress(sh.departAt, sh.arriveAt, now)
          const pos = pointAlong(sh.route, t)
          const color = sh.status === 'retrasado' ? '#c47a00' : sh.accepted ? '#1a1d24' : '#1a1d24'
          return (
            <Fragment key={sh.id}>
              <Polyline positions={sh.route} pathOptions={{ color, weight: 2.5, opacity: sh.accepted ? 0.9 : 0.45, className: sh.status === 'llegado' ? '' : 'route-anim' }} />
              {sh.status !== 'llegado' && (
                <Marker position={pos} icon={vehicleIcon('bus', sh.status === 'retrasado')} eventHandlers={{ click: () => onSelect(sh.id) }} zIndexOffset={500}>
                  <Tooltip direction="top" offset={[0, -12]}>
                    <b>{sh.name}</b> · {sh.passengers} pax · llega {fmtClock(sh.arriveAt)}{sh.delayMin ? ` (+${sh.delayMin} min)` : ''}{sh.accepted ? ' · ruta aceptada' : ' · instrucción pendiente'}
                  </Tooltip>
                </Marker>
              )}
            </Fragment>
          )
        })}

        {layers.proveedores && s.deliveries.map((d) => {
          const t = progress(d.departAt, d.arriveAt, now)
          const pos = pointAlong(d.route, t)
          const bad = d.status === 'bloqueada' || d.status === 'retrasada'
          if (d.status === 'entregada') return null
          return (
            <Fragment key={d.id}>
              <Polyline positions={d.route} pathOptions={{ color: bad ? '#e5484d' : '#c47a00', weight: 2.5, opacity: 0.8, className: 'route-anim' }} />
              {t > 0 && (
                <Marker position={pos} icon={vehicleIcon('truck')} eventHandlers={{ click: () => onSelect(d.id) }} zIndexOffset={500}>
                  <Tooltip direction="top" offset={[0, -12]}><b>{d.name}</b> · {d.status} · llega {fmtClock(d.arriveAt)}</Tooltip>
                </Marker>
              )}
            </Fragment>
          )
        })}
      </MapContainer>

      <div className="absolute top-3 left-3 z-[1000] border border-line bg-panel/90 backdrop-blur px-3 py-2">
        <div className="label">Mapa · MADRING</div>
        <div className="text-[12px]">Plan v{s.planVersion} · {s.twistsApplied.length} giro{s.twistsApplied.length === 1 ? '' : 's'} aplicado{s.twistsApplied.length === 1 ? '' : 's'}</div>
      </div>

      <div className="absolute bottom-3 left-3 z-[1000] border border-line bg-panel/90 backdrop-blur px-3 py-2 text-[11px] text-muted space-y-1">
        <div className="flex items-center gap-2"><span className="w-6 h-0.5 bg-ink" /> Ruta shuttles</div>
        <div className="flex items-center gap-2"><span className="w-6 h-0.5 bg-amber" /> Ruta proveedores</div>
        <div className="flex items-center gap-2"><span className="w-6 h-0.5 bg-red" style={{ backgroundImage: 'repeating-linear-gradient(90deg,#e5484d 0 4px,transparent 4px 8px)', background: 'none' }} /> Sin conexión / bloqueado</div>
        <div className="flex items-center gap-2"><span className="w-2 h-2 bg-red" /> Cerrado <span className="w-2 h-2 bg-amber ml-1" /> Pendiente <span className="w-2 h-2 bg-green ml-1" /> Confirmado</div>
      </div>

      <MapLayersControl layers={layers} onChange={setLayers} />
    </div>
  )
}
