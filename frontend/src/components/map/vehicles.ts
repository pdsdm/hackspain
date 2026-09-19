import type { CrisisState, Delivery, LatLng, Shuttle, Vehicle } from '../../domain/types'
import type { VehicleIconKind } from './icons'
import { fmtClock } from '../../domain/time'
import { progress } from './geo'

export interface VehicleView {
  id: string
  kind: VehicleIconKind
  name: string
  load: string
  originName?: string
  originPos?: LatLng
  destId: string
  destName: string
  eta: number
  etaLabel: string
  pct: number
  status: string
  tone: 'ink' | 'amber' | 'red' | 'green' | 'muted'
  delayed: boolean
  done: boolean
  waypoints: LatLng[]
  fallback: LatLng[]
}

function spaceName(s: CrisisState, id: string) {
  return s.spaces.find((x) => x.id === id)?.name ?? id
}

function endpoints(s: CrisisState, destId: string, route: LatLng[] | undefined, originPos?: LatLng): LatLng[] {
  const dest = s.spaces.find((sp) => sp.id === destId)?.pos
  const start = originPos ?? route?.[0]
  const end = dest ?? route?.[route && route.length ? route.length - 1 : 0]
  if (!start || !end) return [[40.4732, -3.6195], [40.4732, -3.6195]]
  return [start, end]
}

function shuttleView(s: CrisisState, sh: Shuttle, now: number): VehicleView {
  const delayed = sh.status === 'retrasado'
  const status = sh.status === 'llegado' ? 'Llegado' : delayed ? `Retraso +${sh.delayMin} min` : sh.status === 'reasignado' ? 'Reasignado · pendiente aceptar' : sh.accepted ? 'En ruta · aceptada' : 'En ruta · instrucción pendiente'
  const tone = sh.status === 'llegado' ? 'green' : delayed ? 'amber' : sh.accepted ? 'ink' : 'amber'
  return {
    id: sh.id, kind: 'bus', name: sh.name, load: `${sh.passengers} pax`, destId: sh.destinationId, destName: spaceName(s, sh.destinationId),
    eta: sh.arriveAt, etaLabel: fmtClock(sh.arriveAt), pct: Math.round(progress(sh.departAt, sh.arriveAt, now) * 100),
    status, tone, delayed, done: sh.status === 'llegado',
    originName: sh.origin, originPos: sh.route?.[0],
    waypoints: endpoints(s, sh.destinationId, sh.route), fallback: sh.route?.length ? sh.route : [[40.4732, -3.6195], [40.4732, -3.6195]],
  }
}

function deliveryView(s: CrisisState, d: Delivery, now: number): VehicleView {
  const bad = d.status === 'bloqueada' || d.status === 'retrasada'
  const label: Record<Delivery['status'], string> = { programada: 'Programada · destino sin validar', confirmada: 'Confirmada', retrasada: 'Retrasada', bloqueada: 'Bloqueada · sin acceso', entregada: 'Entregada', invalidada: 'Invalidada' }
  const tone = d.status === 'entregada' || d.status === 'confirmada' ? 'green' : bad ? 'red' : d.status === 'invalidada' ? 'muted' : 'amber'
  return {
    id: d.id, kind: 'truck', name: d.name.split(' · ')[0], load: `${d.services} servicios`, destId: d.dockId, destName: spaceName(s, d.dockId),
    eta: d.arriveAt, etaLabel: fmtClock(d.arriveAt), pct: Math.round(progress(d.departAt, d.arriveAt, now) * 100),
    status: label[d.status] ?? d.status, tone, delayed: bad, done: d.status === 'entregada',
    originName: 'Origen', originPos: d.route?.[0],
    waypoints: endpoints(s, d.dockId, d.route), fallback: d.route?.length ? d.route : [[40.4732, -3.6195], [40.4732, -3.6195]],
  }
}

function otherView(s: CrisisState, v: Vehicle, now: number): VehicleView {
  const kind: VehicleIconKind = v.kind === 'taxi' ? 'taxi' : v.kind === 'vip' ? 'vip' : v.kind === 'bus' ? 'bus' : 'van'
  const label: Record<Vehicle['status'], string> = { en_ruta: 'En ruta', retenido: 'Retenido', desviado: 'Desviado · nueva ruta', llegado: 'Llegado' }
  const tone = v.status === 'llegado' ? 'green' : v.status === 'retenido' ? 'red' : v.status === 'desviado' ? 'amber' : 'ink'
  const load = v.kind === 'repartidor' ? v.who : v.kind === 'bus' ? `${v.count} pax · ${v.who}` : `${v.count} · ${v.who}`
  return {
    id: v.id, kind, name: v.name, load, destId: v.destinationId, destName: spaceName(s, v.destinationId),
    eta: v.arriveAt, etaLabel: fmtClock(v.arriveAt), pct: v.status === 'retenido' ? Math.round(progress(v.departAt, v.arriveAt, now) * 100) : Math.round(progress(v.departAt, v.arriveAt, now) * 100),
    status: v.note ? `${label[v.status]} · ${v.note}` : label[v.status], tone, delayed: v.status === 'retenido', done: v.status === 'llegado',
    originName: v.origin, originPos: v.route?.[0],
    waypoints: endpoints(s, v.destinationId, v.route, v.route?.[0]), fallback: v.route?.length ? v.route : [[40.4732, -3.6195], [40.4732, -3.6195]],
  }
}

export function vehicleViews(s: CrisisState): VehicleView[] {
  const now = s.clock.simSeconds
  return [...s.shuttles.map((sh) => shuttleView(s, sh, now)), ...s.deliveries.map((d) => deliveryView(s, d, now)), ...(s.vehicles ?? []).map((v) => otherView(s, v, now))]
}

export function vehicleRowsHtml(list: VehicleView[]) {
  return list.map((v) => `<div class="row"><span class="tag">${v.name}</span><span>${v.load}</span><span class="${v.tone}">${v.status}</span><span class="muted">→ ${v.destName}</span><span><b>${v.etaLabel}</b> · ${v.pct}%</span></div>`).join('')
}
