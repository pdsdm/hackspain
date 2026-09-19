import { Fragment, useMemo, useState, type ReactNode } from 'react'
import { MapContainer, TileLayer, Polygon, Polyline, Marker, Tooltip } from 'react-leaflet'
import type { CrisisState } from '../../domain/types'
import { ZONE_NORTE, ZONE_SUR } from '../../domain/initialState'
import { PIT_LANE, TRACK } from '../../domain/track'
import { spaceLook } from '../ui/status'
import { emptyIcon, gateIcon, pinIcon, vehicleIcon, zoneLabelIcon } from './icons'
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
      <div className="row"><span className="muted">Origen</span><span>{v.originName ?? '—'}</span></div>
      <div className="row"><span className="muted">Destino</span><span>{v.destName}</span></div>
      <div className="row"><span className="muted">Llegada</span><b>{v.etaLabel}</b><span className="muted">· {v.pct}% del trayecto</span></div>
    </Tooltip>
  )
}

export function CrisisMap({ s, onSelect, selected, children }: { s: CrisisState; onSelect: (id: string) => void; selected: string | null; children?: ReactNode }) {
  const [layers, setLayers] = useState<Layers>({ transporte: true, proveedores: true, accesos: true })
  const [hover, setHover] = useState<string | null>(null)
  const vehicles = useMemo(() => vehicleViews(s), [s])
  const routes = useOsrmRoutes(vehicles.map((v) => ({ id: v.id, waypoints: v.waypoints, fallback: v.fallback })))

  return (
    <div className="relative h-full w-full overflow-hidden bg-panel">
      <MapContainer center={[40.4732, -3.6195]} zoom={15} zoomControl={false} attributionControl={false} className="h-full w-full">
        <TileLayer url={TILES} attribution={ATTR} maxZoom={19} className="dark-tiles" />

        <Polygon positions={ZONE_SUR} pathOptions={{ color: '#1a1d24', weight: 1.5, fillColor: '#1a1d24', fillOpacity: 0.06, dashArray: '4 4' }} />
        <Polygon positions={ZONE_NORTE} pathOptions={{ color: '#1a1d24', weight: 1.5, fillColor: '#1a1d24', fillOpacity: 0.04, dashArray: '4 4' }} />
        <Polyline positions={TRACK} pathOptions={{ color: '#ffffff', weight: 9, opacity: 0.9, lineJoin: 'round', interactive: false }} />
        <Polyline positions={TRACK} pathOptions={{ color: '#1a1d24', weight: 5, opacity: 0.95, lineJoin: 'round', interactive: false }} />
        <Polyline positions={PIT_LANE} pathOptions={{ color: '#1a1d24', weight: 2, opacity: 0.7, dashArray: '2 4', interactive: false }} />
        <Marker position={[40.4602, -3.6205]} icon={zoneLabelIcon('MADRING Sur')} interactive={false} zIndexOffset={-500} />
        <Marker position={[40.4790, -3.6310]} icon={zoneLabelIcon('MADRING Norte')} interactive={false} zIndexOffset={-500} />
        <Polyline positions={[[40.4720, -3.6255], [40.4720, -3.6145]]} pathOptions={{ color: '#e5484d', weight: 3, dashArray: '6 6', interactive: false }} />
        <Marker position={[40.4720, -3.6255]} icon={emptyIcon} interactive={false} zIndexOffset={-400}>
          <Tooltip permanent direction="left" offset={[-4, 0]} className="cut">Sin conexión interior Norte ↔ Sur</Tooltip>
        </Marker>

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
              {v.originPos && (
                <Marker position={v.originPos} icon={pinIcon(`Salida · ${v.originName ?? v.name}`, 'idle ghost')} zIndexOffset={200} interactive={false} />
              )}
              <Polyline positions={path} smoothFactor={1.2} pathOptions={{ color: '#ffffff', weight: lit ? 9 : 6.5, opacity: 0.9, lineCap: 'round', lineJoin: 'round', interactive: false, className: 'route-casing' }} />
              <Polyline positions={path} smoothFactor={1.2} pathOptions={{ color, weight: lit ? 5.5 : 3.5, opacity: lit ? 1 : v.tone === 'amber' && v.kind === 'bus' ? 0.6 : 0.9, lineCap: 'round', lineJoin: 'round', className: 'route-hover' }} eventHandlers={{ mouseover: () => setHover(v.id), mouseout: () => setHover(null), click: () => onSelect(v.id) }}>
                <VehicleTip v={v} />
              </Polyline>
              {v.pct > 0 && (
                <Polyline positions={path} smoothFactor={1.2} pathOptions={{ color: '#ffffff', weight: lit ? 2.5 : 1.5, opacity: 0.95, lineCap: 'round', lineJoin: 'round', interactive: false, className: 'route-casing route-anim' }} />
              )}
              {v.pct > 0 && (
                <Marker position={pos} icon={vehicleIcon(v.kind, v.delayed, `${v.name} · ${v.etaLabel}`)} eventHandlers={{ click: () => onSelect(v.id), mouseover: () => setHover(v.id), mouseout: () => setHover(null) }} zIndexOffset={lit ? 900 : 500}>
                  <VehicleTip v={v} />
                </Marker>
              )}
            </Fragment>
          )
        })}
      </MapContainer>

      <MapLayersControl layers={layers} onChange={setLayers} />
      <div className="absolute bottom-1 left-1 z-[1000] text-[9px] text-muted pointer-events-auto">
        <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">© OpenStreetMap</a>
      </div>
      {children}
    </div>
  )
}
