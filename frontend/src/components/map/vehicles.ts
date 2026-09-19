import type { CrisisState, Delivery, LatLng, Shuttle } from '../../domain/types'
import { fmtClock } from '../../domain/time'
import { progress } from './geo'

export interface VehicleView {
  id: string
  kind: 'bus' | 'truck'
  name: string
  load: string
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

function viaPoints(s: CrisisState, route: LatLng[]): LatLng[] {
  const inner = route.slice(1, -1)
  const vias = inner.filter((p) => s.spaces.some((sp) => Math.abs(sp.pos[0] - p[0]) < 1e-6 && Math.abs(sp.pos[1] - p[1]) < 1e-6))
  return [route[0], ...vias, route[route.length - 1]]
}

function shuttleView(s: CrisisState, sh: Shuttle, now: number): VehicleView {
  const delayed = sh.status === 'retrasado'
  const status = sh.status === 'llegado' ? 'Llegado' : delayed ? `Retraso +${sh.delayMin} min` : sh.status === 'reasignado' ? 'Reasignado · pendiente aceptar' : sh.accepted ? 'En ruta · aceptada' : 'En ruta · instrucción pendiente'
  const tone = sh.status === 'llegado' ? 'green' : delayed ? 'amber' : sh.accepted ? 'ink' : 'amber'
  return {
    id: sh.id, kind: 'bus', name: sh.name, load: `${sh.passengers} pax`, destId: sh.destinationId, destName: spaceName(s, sh.destinationId),
    eta: sh.arriveAt, etaLabel: fmtClock(sh.arriveAt), pct: Math.round(progress(sh.departAt, sh.arriveAt, now) * 100),
    status, tone, delayed, done: sh.status === 'llegado', waypoints: viaPoints(s, sh.route), fallback: sh.route,
  }
}

function deliveryView(s: CrisisState, d: Delivery, now: number): VehicleView {
  const bad = d.status === 'bloqueada' || d.status === 'retrasada'
  const label: Record<Delivery['status'], string> = { programada: 'Programada · destino sin validar', confirmada: 'Confirmada', retrasada: 'Retrasada', bloqueada: 'Bloqueada · sin acceso', entregada: 'Entregada', invalidada: 'Invalidada' }
  const tone = d.status === 'entregada' || d.status === 'confirmada' ? 'green' : bad ? 'red' : d.status === 'invalidada' ? 'muted' : 'amber'
  return {
    id: d.id, kind: 'truck', name: d.name.split(' · ')[0], load: `${d.services} servicios`, destId: d.dockId, destName: spaceName(s, d.dockId),
    eta: d.arriveAt, etaLabel: fmtClock(d.arriveAt), pct: Math.round(progress(d.departAt, d.arriveAt, now) * 100),
    status: label[d.status], tone, delayed: bad, done: d.status === 'entregada', waypoints: viaPoints(s, d.route), fallback: d.route,
  }
}

export function vehicleViews(s: CrisisState): VehicleView[] {
  const now = s.clock.simSeconds
  return [...s.shuttles.map((sh) => shuttleView(s, sh, now)), ...s.deliveries.map((d) => deliveryView(s, d, now))]
}

export function vehicleRowsHtml(list: VehicleView[]) {
  return list.map((v) => `<div class="row"><span class="tag">${v.name}</span><span>${v.load}</span><span class="${v.tone}">${v.status}</span><span class="muted">→ ${v.destName}</span><span><b>${v.etaLabel}</b> · ${v.pct}%</span></div>`).join('')
}
