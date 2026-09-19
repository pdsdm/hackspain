import { Fragment, useMemo, useState, type ReactNode } from 'react'
import { MapContainer, Pane, TileLayer, Polygon, Polyline, Marker, Tooltip } from 'react-leaflet'
import type { CrisisState, LatLng, SpaceKind } from '../../domain/types'
import { ZONE_NORTE, ZONE_SUR } from '../../domain/initialState'
import { PIT_LANE, TRACK } from '../../domain/track'
import { spaceLook } from '../ui/status'
import { barrierLabelIcon, gateIcon, placeIcon, rankOf, vehicleIcon, zIndexOf, zoneLabelIcon } from './icons'
import { pointAlong } from './geo'
import { FitVenue, LabelPlanner, ZoomGate, type LabelCandidate } from './LabelPlanner'
import { MapLayersControl, type Layers } from './MapLayersControl'
import { useOsrmRoutes } from './routing'
import { vehicleViews, vehicleRowsHtml, type VehicleView } from './vehicles'

const TILES = 'https://tile.openstreetmap.org/{z}/{x}/{y}.png'
const ATTR = '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
const COLOR = { ink: '#1a1d24', amber: '#c47a00', red: '#e5484d', green: '#1f9d55', muted: '#b8b8b2' }

/** Everything outside the two venue zones is dimmed by a single polygon with holes. */
const WORLD: LatLng[] = [[40.36, -3.86], [40.60, -3.86], [40.60, -3.40], [40.36, -3.40]]
/** Leaves room for the aforo panel, the chronology rail and the KPI strip. */
const INSETS = { left: 340, right: 440, top: 150, bottom: 168 }

const RANK_PRIORITY = { sede: 0, acceso: 30, servicio: 40, contexto: 50 } as const
/** Icon, gaps and padding around the text lines of a chip. */
const CHIP_CHROME = 40

let ruler: CanvasRenderingContext2D | null = null
function textWidth(text: string, font: string) {
  if (!ruler) ruler = document.createElement('canvas').getContext('2d')
  if (!ruler) return text.length * 6.4
  ruler.font = font
  return ruler.measureText(text).width
}

const FONT = '"IBM Plex Sans", "Helvetica Neue", Arial, sans-serif'
function chipWidth(name: string, meta: string, big: boolean) {
  const nameW = textWidth(name, `${big ? 700 : 600} ${big ? 11.5 : 11}px ${FONT}`)
  const metaW = meta ? textWidth(meta, `500 9px ${FONT}`) : 0
  return Math.max(84, Math.max(nameW, metaW) + CHIP_CHROME)
}

function vehicleVisible(v: VehicleView, layers: Layers) {
  if (v.done) return false
  if ((v.kind === 'bus' || v.kind === 'taxi' || v.kind === 'vip') && !layers.transporte) return false
  if ((v.kind === 'truck' || v.kind === 'van') && !layers.proveedores) return false
  return true
}

function VehicleTip({ v }: { v: VehicleView }) {
  return (
    <Tooltip direction="top" offset={[0, -14]} className="veh" sticky>
      <div className="row"><span className="tag">{v.name}</span><span>{v.load}</span></div>
      <div className="row"><span className={v.tone}>{v.status}</span></div>
      <div className="row"><span className="muted">Origen</span><span>{v.originName ?? '—'}</span></div>
      <div className="row"><span className="muted">Destino</span><span>{v.destName}</span></div>
      <div className="row"><span className="muted">Llegada</span><b>{v.etaLabel}</b><span className="muted">· {v.pct}% del trayecto</span></div>
    </Tooltip>
  )
}

export function CrisisMap({ s, onSelect, selected, children }: { s: CrisisState; onSelect: (id: string) => void; selected: string | null; children?: ReactNode }) {
  const [layers, setLayers] = useState<Layers>({ transporte: true, proveedores: true, accesos: true, contexto: false })
  const [hover, setHover] = useState<string | null>(null)
  const [labelIds, setLabelIds] = useState<Set<string>>(new Set())
  const vehicles = useMemo(() => vehicleViews(s), [s])
  const routes = useOsrmRoutes(vehicles.map((v) => ({ id: v.id, waypoints: v.waypoints, fallback: v.fallback })))

  const visibleSpaces = useMemo(() => s.spaces.filter((sp) => {
    const rank = rankOf(sp.kind)
    if (!layers.accesos && (sp.kind === 'acceso' || sp.kind === 'muelle')) return false
    if (!layers.contexto && rank === 'contexto') return false
    return !(sp.status === 'inactivo' && sp.kind === 'espera')
  }), [s.spaces, layers.accesos, layers.contexto])

  // Only venues carry a second line; for the rest the icon and colour say enough.
  const spaceMeta = (kind: SpaceKind, capacity: number | undefined, label: string) =>
    rankOf(kind) !== 'sede'
      ? ''
      : [capacity ? `${capacity} plazas` : null, label.toLowerCase()].filter(Boolean).join(' · ')

  const candidates = useMemo<LabelCandidate[]>(() => {
    const list: LabelCandidate[] = visibleSpaces.map((sp) => {
      const rank = rankOf(sp.kind)
      const look = spaceLook(sp.status)
      const meta = spaceMeta(sp.kind, sp.capacity, look.label)
      // An unused space is scenery until the plan picks it up, so it yields space first.
      const quiet = sp.status === 'inactivo' || sp.status === 'descartado'
      return {
        id: sp.id,
        pos: sp.pos,
        priority: RANK_PRIORITY[rank] + (quiet ? 8 : 0),
        w: chipWidth(sp.name, meta, rank === 'sede'),
        h: rank === 'sede' ? 32 : 22,
      }
    })
    if (layers.accesos) {
      for (const g of s.gates) list.push({ id: g.id, pos: g.pos, priority: 20, w: 132, h: 40 })
    }
    return list
  }, [visibleSpaces, s.gates, layers.accesos])

  const labelled = (id: string) => labelIds.has(id) || hover === id || selected === id

  return (
    <div className="relative h-full w-full overflow-hidden bg-panel">
      <MapContainer center={[40.4732, -3.6195]} zoom={15} minZoom={12} zoomSnap={0.25} zoomDelta={0.5} zoomControl={false} attributionControl={false} className="h-full w-full">
        <FitVenue insets={INSETS} />
        <LabelPlanner candidates={candidates} onPlan={setLabelIds} />
        <TileLayer url={TILES} attribution={ATTR} maxZoom={19} className="dark-tiles" />

        <Pane name="veil" style={{ zIndex: 450, pointerEvents: 'none' }}>
          <Polygon positions={[WORLD, ZONE_SUR, ZONE_NORTE]} pathOptions={{ stroke: false, fillColor: '#f4f4f2', fillOpacity: 0.62, fillRule: 'evenodd', interactive: false }} />
        </Pane>

        <Polygon positions={ZONE_SUR} pathOptions={{ color: '#1a1d24', weight: 1.25, opacity: 0.55, fillColor: '#ffffff', fillOpacity: 0.34, interactive: false }} />
        <Polygon positions={ZONE_NORTE} pathOptions={{ color: '#1a1d24', weight: 1.25, opacity: 0.4, fillColor: '#ffffff', fillOpacity: 0.26, dashArray: '5 4', interactive: false }} />

        <Pane name="circuit" style={{ zIndex: 455, pointerEvents: 'none' }}>
          <Polyline positions={TRACK} pathOptions={{ color: '#ffffff', weight: 8, opacity: 1, lineJoin: 'round', interactive: false }} />
          <Polyline positions={TRACK} pathOptions={{ color: '#1a1d24', weight: 4, opacity: 1, lineJoin: 'round', interactive: false }} />
          <Polyline positions={PIT_LANE} pathOptions={{ color: '#1a1d24', weight: 2, opacity: 0.55, dashArray: '2 4', interactive: false }} />
        </Pane>

        <ZoomGate min={14.5}>
          <Pane name="zonelabels" style={{ zIndex: 460, pointerEvents: 'none' }}>
            <Marker position={[40.4597, -3.6170]} icon={zoneLabelIcon('MADRING Sur', 'hospitalidad · 600 invitados')} interactive={false} pane="zonelabels" />
            <Marker position={[40.4838, -3.6248]} icon={zoneLabelIcon('MADRING Norte', 'paddock y accesos Norte')} interactive={false} pane="zonelabels" />
          </Pane>
        </ZoomGate>

        <Polyline positions={[[40.4722, -3.6258], [40.4722, -3.6140]]} pathOptions={{ color: '#ffffff', weight: 8, opacity: 0.85, interactive: false }} />
        <Polyline positions={[[40.4722, -3.6258], [40.4722, -3.6140]]} pathOptions={{ color: '#e5484d', weight: 2.5, opacity: 0.9, dashArray: '1 7', lineCap: 'round', interactive: false }} />
        <ZoomGate min={14.5}>
          <Marker position={[40.4722, -3.6199]} icon={barrierLabelIcon('Sin conexión interior Norte ↔ Sur')} interactive={false} zIndexOffset={130} />
        </ZoomGate>

        {layers.accesos && s.gates.map((g) => {
          const short = g.name.split(' · ')[0]
          return (
            <Marker key={g.id} position={g.pos} icon={gateIcon(short, g.entered, g.capacity, g.waiting, g.status, labelled(g.id))} zIndexOffset={zIndexOf('acceso')} eventHandlers={{ mouseover: () => setHover(g.id), mouseout: () => setHover(null) }}>
              <Tooltip direction="bottom" offset={[0, 10]} className="veh">
                <div className="row"><span className="tag">{g.name}</span><span className={g.status === 'saturado' ? 'amber' : g.status === 'cerrado' ? 'red' : 'green'}>{g.status}</span></div>
                <div className="row"><span className="muted">Dentro</span><b>{Math.round(g.entered).toLocaleString('es-ES')}</b><span className="muted">de {g.capacity.toLocaleString('es-ES')}</span></div>
                <div className="row"><span className="muted">En cola</span><b>{Math.round(g.waiting).toLocaleString('es-ES')}</b><span className="muted">· llegan {g.arrivalsPerMin}/min · pasan {g.throughputPerMin}/min</span></div>
              </Tooltip>
            </Marker>
          )
        })}

        {visibleSpaces.map((sp) => {
          const rank = rankOf(sp.kind)
          const st = spaceLook(sp.status)
          const isHover = hover === sp.id
          const isSel = selected === sp.id
          const incoming = vehicles.filter((v) => v.destId === sp.id && !v.done)
          const meta = spaceMeta(sp.kind, sp.capacity, st.label)
          return (
            <Marker
              key={sp.id}
              position={sp.pos}
              icon={placeIcon({ kind: sp.kind, name: sp.name, cls: st.cls, meta, labelled: labelled(sp.id), active: isSel || isHover })}
              zIndexOffset={zIndexOf(rank) + (isSel || isHover ? 400 : 0)}
              eventHandlers={{ click: () => onSelect(sp.id), mouseover: () => setHover(sp.id), mouseout: () => setHover(null) }}
            >
              <Tooltip direction="bottom" offset={[0, 10]} className="veh">
                <div className="row"><span className="tag">{sp.name}</span><span className={st.tone}>{st.label}</span></div>
                {sp.note && <div className="row"><span className="muted">{sp.note}</span></div>}
                {incoming.length > 0 && <div className="row" style={{ marginTop: 6 }}><span className="tag muted">Vehículos en camino · {incoming.length}</span></div>}
                {incoming.length > 0 && <div dangerouslySetInnerHTML={{ __html: vehicleRowsHtml(incoming) }} />}
              </Tooltip>
            </Marker>
          )
        })}

        <Pane name="routes" style={{ zIndex: 470 }}>
          {vehicles.map((v) => {
            if (!vehicleVisible(v, layers)) return null
            const path = routes[v.id] ?? v.fallback
            if (!path || path.length < 2) return null
            const lit = hover === v.id || hover === v.destId || selected === v.id
            const color = v.kind === 'truck' || v.kind === 'van' ? (v.delayed ? COLOR.red : COLOR.amber) : COLOR[v.tone === 'green' ? 'ink' : v.tone]
            return (
              <Fragment key={v.id}>
                <Polyline positions={path} smoothFactor={1.2} pathOptions={{ color: '#ffffff', weight: lit ? 8 : 5.5, opacity: 0.9, lineCap: 'round', lineJoin: 'round', interactive: false, className: 'route-casing' }} />
                <Polyline positions={path} smoothFactor={1.2} pathOptions={{ color, weight: lit ? 4.5 : 2.75, opacity: lit ? 1 : 0.85, lineCap: 'round', lineJoin: 'round', className: 'route-hover' }} eventHandlers={{ mouseover: () => setHover(v.id), mouseout: () => setHover(null), click: () => onSelect(v.id) }}>
                  <VehicleTip v={v} />
                </Polyline>
                {v.pct > 0 && (
                  <Polyline positions={path} smoothFactor={1.2} pathOptions={{ color: '#ffffff', weight: lit ? 2.5 : 1.5, opacity: 0.95, lineCap: 'round', lineJoin: 'round', interactive: false, className: 'route-casing route-anim' }} />
                )}
              </Fragment>
            )
          })}
        </Pane>
        {vehicles.map((v) => {
          if (!vehicleVisible(v, layers)) return null
          const path = routes[v.id] ?? v.fallback
          if (!path || path.length < 2) return null
          const pos = pointAlong(path, v.pct / 100)
          const lit = hover === v.id || hover === v.destId || selected === v.id
          return (
            <Marker key={v.id} position={pos} icon={vehicleIcon(v.kind, v.delayed, lit ? `${v.name} · ${v.etaLabel}` : undefined)} eventHandlers={{ click: () => onSelect(v.id), mouseover: () => setHover(v.id), mouseout: () => setHover(null) }} zIndexOffset={lit ? 900 : 500}>
              <VehicleTip v={v} />
            </Marker>
          )
        })}
      </MapContainer>

      <MapLayersControl layers={layers} onChange={setLayers} />
      <div className="map-attr">
        <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">© OpenStreetMap</a>
      </div>
      {children}
    </div>
  )
}
