import { useEffect, useState } from 'react'
import type { LatLng } from '../../domain/types'
import { PIT_LANE, TRACK } from '../../domain/track'
import { corridorOf, corridorRun, overlapMetres } from './geo'

const OSRM = 'https://router.project-osrm.org/route/v1/driving/'
const CORRIDOR = corridorOf([TRACK, PIT_LANE], 60)
const CORRIDOR_WIDTH = 25
const DETOUR_ABOVE_M = 150
const DETOUR_OFFSET_M = 300
const MAX_IN_FLIGHT = 2
const GAP_MS = 150
const cache = new Map<string, LatLng[]>()
const pending = new Set<string>()
const queue: Array<() => Promise<void>> = []
let inFlight = 0

export interface RouteRequest { id: string; waypoints: LatLng[]; fallback: LatLng[] }

export function routeKey(waypoints: LatLng[]) {
  return waypoints.map((p) => `${p[0].toFixed(5)},${p[1].toFixed(5)}`).join(';')
}

function pump() {
  if (inFlight >= MAX_IN_FLIGHT) return
  const job = queue.shift()
  if (!job) return
  inFlight++
  job().finally(() => {
    setTimeout(() => { inFlight--; pump() }, GAP_MS)
  })
}

function enqueue(job: () => Promise<void>) {
  queue.push(job)
  pump()
}

interface OsrmRoute { distance?: number; geometry?: { coordinates?: [number, number][] } }
interface Scored { line: LatLng[]; overlap: number; distance: number }

export function scoreRoutes(routes: OsrmRoute[]): Scored | undefined {
  let best: Scored | undefined
  for (const r of routes) {
    const coords = r.geometry?.coordinates ?? []
    if (coords.length < 2) continue
    const line = coords.map(([lon, lat]) => [lat, lon] as LatLng)
    const overlap = overlapMetres(line, CORRIDOR, CORRIDOR_WIDTH)
    const distance = r.distance ?? Number.POSITIVE_INFINITY
    if (!best || overlap < best.overlap || (overlap === best.overlap && distance < best.distance)) best = { line, overlap, distance }
  }
  return best
}

async function osrm(points: LatLng[]): Promise<Scored | undefined> {
  const coords = points.map((p) => `${p[1]},${p[0]}`).join(';')
  const res = await fetch(`${OSRM}${coords}?overview=full&geometries=geojson&alternatives=3`)
  if (!res.ok) throw new Error(String(res.status))
  const json = await res.json()
  return scoreRoutes(json.routes ?? [])
}

function detourPoints(run: [LatLng, LatLng]): LatLng[] {
  const [p, q] = run
  const mid: LatLng = [(p[0] + q[0]) / 2, (p[1] + q[1]) / 2]
  const k = Math.cos((mid[0] * Math.PI) / 180)
  const dx = (q[1] - p[1]) * k, dy = q[0] - p[0]
  const len = Math.hypot(dx, dy) || 1
  const off = DETOUR_OFFSET_M / 111320
  return [1, -1].map((side) => [mid[0] - (dx / len) * off * side, mid[1] + ((dy / len) * off * side) / k] as LatLng)
}

async function fetchRoute(key: string, waypoints: LatLng[]) {
  let best = await osrm(waypoints)
  if (!best) throw new Error('empty')
  const run = best.overlap > DETOUR_ABOVE_M ? corridorRun(best.line, CORRIDOR, CORRIDOR_WIDTH) : undefined
  if (run && waypoints.length === 2) {
    for (const via of detourPoints(run)) {
      const alt = await osrm([waypoints[0], via, waypoints[1]]).catch(() => undefined)
      if (alt && alt.overlap < best.overlap) best = alt
    }
  }
  cache.set(key, best.line)
}

export function useOsrmRoutes(requests: RouteRequest[]): Record<string, LatLng[] | undefined> {
  const [, bump] = useState(0)
  const keys = requests.map((r) => `${routeKey(r.waypoints)}#${JSON.stringify(r.fallback)}`).join('|')
  useEffect(() => {
    let alive = true
    const list: RouteRequest[] = keys.split('|').map((k) => {
      const [wp, fb] = k.split('#')
      return { id: wp, waypoints: wp.split(';').map((p) => p.split(',').map(Number) as LatLng), fallback: JSON.parse(fb) as LatLng[] }
    })
    for (const r of list) {
      const key = routeKey(r.waypoints)
      if (cache.has(key) || pending.has(key)) continue
      pending.add(key)
      enqueue(() => fetchRoute(key, r.waypoints)
        .catch(() => { cache.set(key, r.fallback) })
        .finally(() => { pending.delete(key); if (alive) bump((n) => n + 1) }))
    }
    return () => { alive = false }
  }, [keys])
  const out: Record<string, LatLng[] | undefined> = {}
  for (const r of requests) out[r.id] = cache.get(routeKey(r.waypoints))
  return out
}
