import { Fragment, useMemo, useState } from 'react'
import { MapContainer, TileLayer, Polygon, Polyline, Marker, Tooltip } from 'react-leaflet'
import type { CrisisState } from '../../domain/types'
import { ZONE_NORTE, ZONE_SUR } from '../../domain/initialState'
import { PIT_LANE, TRACK } from '../../domain/track'
import { spaceLook } from '../ui/status'
import { gateIcon, pinIcon, vehicleIcon, zoneLabelIcon } from './icons'
import { pointAlong } from './geo'
import { MapLayersControl, type Layers } from './MapLayersControl'
import { useOsrmRoutes } from './routing'
import { vehicleViews, vehicleRowsHtml, type VehicleView } from './vehicles'

const TILES = 'https://tile.openstreetmap.org/{z}/{x}/{y}.png'
const ATTR = '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
const COLOR = { ink: '#1a1d24', amber: '#c47a00', red: '#e5484d', green: '#1f9d55', muted: '#b8b8b2' }

function VehicleTip({ v }: { v: VehicleView }) {
  return (
    <Tooltip direction="top" offset={[0, -12]} className="veh" sticky>
      <div className="row"><span className="tag">{v.name}</span><span>{v.load}</span></div>
      <div className="row"><span className={v.tone}>{v.status}</span></div>
      <div className="row"><span className="muted">Destino</span><span>{v.destName}</span></div>
      <div className="row"><span className="muted">Llegada</span><b>{v.etaLabel}</b><span className="muted">· {v.pct}% del trayecto</span></div>
    </Tooltip>
  )
}

export function CrisisMap({ s, onSelect, selected }: { s: CrisisState; onSelect: (id: string) => void; selected: string | null }) {
  const [layers, setLayers] = useState<Layers>({ transporte: true, proveedores: true, accesos: true })
  const [hover, setHover] = useState<string | null>(null)
  const vehicles = useMemo(() => vehicleViews(s), [s])
  const routes = useOsrmRoutes(vehicles.map((v) => ({ id: v.id, waypoints: v.waypoints, fallback: v.fallback })))

  return (
    <div className="relative h-full w-full overflow-hidden border border-line bg-panel">
      <MapContainer center={[40.4732, -3.6195]} zoom={15} zoomControl={false} attributionControl className="h-full w-full">
        <TileLayer url={TILES} attribution={ATTR} maxZoom={19} className="dark-tiles" />

        <Polygon positions={ZONE_SUR} pathOptions={{ color: '#1a1d24', weight: 1.5, fillColor: '#1a1d24', fillOpacity: 0.06, dashArray: '4 4' }} />
        <Polygon positions={ZONE_NORTE} pathOptions={{ color: '#1a1d24', weight: 1.5, fillColor: '#1a1d24', fillOpacity: 0.04, dashArray: '4 4' }} />
        <Polyline positions={TRACK} pathOptions={{ color: '#ffffff', weight: 9, opacity: 0.9, lineJoin: 'round', interactive: false }} />
        <Polyline positions={TRACK} pathOptions={{ color: '#1a1d24', weight: 5, opacity: 0.95, lineJoin: 'round', interactive: false }} />
        <Polyline positions={PIT_LANE} pathOptions={{ color: '#1a1d24', weight: 2, opacity: 0.7, dashArray: '2 4', interactive: false }} />
        <Marker position={[40.4646, -3.6232]} icon={zoneLabelIcon('MADRING Sur')} interactive={false} />
        <Marker position={[40.4800, -3.6235]} icon={zoneLabelIcon('MADRING Norte')} interactive={false} />
        <Polyline positions={[[40.4720, -3.6255], [40.4720, -3.6145]]} pathOptions={{ color: '#e5484d', weight: 3, dashArray: '6 6' }}>
          <Tooltip permanent direction="right" offset={[6, 0]}>Sin conexión interior Norte ↔ Sur</Tooltip>
        </Polyline>

        {layers.accesos && s.gates.map((g) => (
          <Marker key={g.id} position={g.pos} icon={gateIcon(g.name.split(' · ')[0], g.entered, g.waiting, g.status)} zIndexOffset={300}>
            <Tooltip direction="top" offset={[0, -6]} className="veh">
              <div className="row"><span className="tag">{g.name}</span><span className={g.status === 'saturado' ? 'amber' : g.status === 'cerrado' ? 'red' : 'green'}>{g.status}</span></div>
              <div className="row"><span className="muted">Dentro</span><b>{Math.round(g.entered).toLocaleString('es-ES')}</b><span className="muted">de {g.capacity.toLocaleString('es-ES')}</span></div>
              <div className="row"><span className="muted">En cola</span><b>{Math.round(g.waiting).toLocaleString('es-ES')}</b><span className="muted">· llegan {g.arrivalsPerMin}/min · pasan {g.throughputPerMin}/min</span></div>
            </Tooltip>
          </Marker>
        ))}

        {s.spaces.map((sp) => {
          if (!layers.accesos && (sp.kind === 'acceso' || sp.kind === 'muelle')) return null
          if (sp.status === 'inactivo' && (sp.kind === 'espera')) return null
          const st = spaceLook(sp.status)
          const sub = sp.capacity && sp.kind !== 'acceso' ? `${sp.capacity}${sp.kind === 'parking' ? ' veh.' : ''}` : undefined
          const incoming = vehicles.filter((v) => v.destId === sp.id && !v.done)
          const isHover = hover === sp.id
          return (
            <Marker key={sp.id} position={sp.pos} icon={pinIcon(sp.name, `${st.cls}${selected === sp.id || isHover ? ' ring' : ''}`, sub)} eventHandlers={{ click: () => onSelect(sp.id), mouseover: () => setHover(sp.id), mouseout: () => setHover(null) }}>
              <Tooltip direction="top" offset={[40, -8]} className="veh">
                <div className="row"><span className="tag">{sp.name}</span><span className={st.tone}>{st.label}</span></div>
                {sp.note && <div className="row"><span className="muted">{sp.note}</span></div>}
                {incoming.length > 0 && <div className="row" style={{ marginTop: 6 }}><span className="tag muted">Vehículos en camino · {incoming.length}</span></div>}
                {incoming.length > 0 && <div dangerouslySetInnerHTML={{ __html: vehicleRowsHtml(incoming) }} />}
              </Tooltip>
            </Marker>
          )
        })}

        {vehicles.map((v) => {
          if ((v.kind === 'bus' || v.kind === 'taxi' || v.kind === 'vip') && !layers.transporte) return null
          if ((v.kind === 'truck' || v.kind === 'van') && !layers.proveedores) return null
          if (v.done) return null
          const path = routes[v.id] ?? v.fallback
          if (!path || path.length < 2) return null
          const pos = pointAlong(path, v.pct / 100)
          const lit = hover === v.id || hover === v.destId || selected === v.id
          const color = v.kind === 'truck' || v.kind === 'van' ? (v.delayed ? COLOR.red : COLOR.amber) : COLOR[v.tone === 'green' ? 'ink' : v.tone]
          return (
            <Fragment key={v.id}>
              <Polyline positions={path} pathOptions={{ color, weight: lit ? 5 : 2.5, opacity: lit ? 1 : v.tone === 'amber' && v.kind === 'bus' ? 0.5 : 0.85, className: `route-hover ${v.done ? '' : 'route-anim'}` }} eventHandlers={{ mouseover: () => setHover(v.id), mouseout: () => setHover(null), click: () => onSelect(v.id) }}>
                <VehicleTip v={v} />
              </Polyline>
              {v.pct > 0 && (
                <Marker position={pos} icon={vehicleIcon(v.kind, v.delayed, `${v.name} · ${v.etaLabel}`)} eventHandlers={{ click: () => onSelect(v.id), mouseover: () => setHover(v.id), mouseout: () => setHover(null) }} zIndexOffset={lit ? 900 : 500}>
                  <VehicleTip v={v} />
                </Marker>
              )}
            </Fragment>
          )
        })}
      </MapContainer>

      <div className="absolute top-3 left-3 z-[1000] border border-line bg-panel/90 backdrop-blur px-3 py-2">
        <div className="label">Mapa · MADRING</div>
        <div className="text-[12px]">Plan v{s.planVersion} · {vehicles.filter((v) => !v.done).length} vehículos en ruta · {s.twistsApplied.length} giro{s.twistsApplied.length === 1 ? '' : 's'}</div>
      </div>

      <div className="absolute bottom-3 left-3 z-[1000] border border-line bg-panel/90 backdrop-blur px-3 py-2 text-[11px] text-muted space-y-1">
        <div className="flex items-center gap-2"><span className="w-6 h-1 bg-ink" /> Circuito MADRING</div>
        <div className="flex items-center gap-2"><span className="w-6 h-0.5 bg-ink" /> Ruta shuttles</div>
        <div className="flex items-center gap-2"><span className="w-6 h-0.5 bg-amber" /> Ruta proveedores</div>
        <div className="flex items-center gap-2"><span className="w-6 h-0.5 bg-red" style={{ backgroundImage: 'repeating-linear-gradient(90deg,#e5484d 0 4px,transparent 4px 8px)', background: 'none' }} /> Sin conexión / bloqueado</div>
        <div className="flex items-center gap-2"><span className="w-2 h-2 bg-red" /> Cerrado <span className="w-2 h-2 bg-amber ml-1" /> Pendiente <span className="w-2 h-2 bg-green ml-1" /> Confirmado</div>
        <div className="flex items-center gap-2"><span className="w-3 h-3 bg-ink" style={{ clipPath: 'polygon(0 0, 100% 0, 100% 70%, 70% 100%, 0 100%)' }} /> Puerta de público · dentro / cola</div>
      </div>

      <MapLayersControl layers={layers} onChange={setLayers} />
    </div>
  )
}
