import { useEffect, useState } from 'react'
import type { LatLng } from '../../domain/types'

const OSRM = 'https://router.project-osrm.org/route/v1/driving/'
const cache = new Map<string, LatLng[]>()
const pending = new Set<string>()

export interface RouteRequest { id: string; waypoints: LatLng[]; fallback: LatLng[] }

export function routeKey(waypoints: LatLng[]) {
  return waypoints.map((p) => `${p[0].toFixed(5)},${p[1].toFixed(5)}`).join(';')
}

async function fetchRoute(key: string, waypoints: LatLng[]) {
  const coords = waypoints.map((p) => `${p[1]},${p[0]}`).join(';')
  const res = await fetch(`${OSRM}${coords}?overview=full&geometries=geojson`)
  if (!res.ok) throw new Error(String(res.status))
  const json = await res.json()
  const line: [number, number][] = json.routes?.[0]?.geometry?.coordinates ?? []
  if (line.length < 2) throw new Error('empty')
  cache.set(key, line.map(([lon, lat]) => [lat, lon] as LatLng))
}

export function useOsrmRoutes(requests: RouteRequest[]): Record<string, LatLng[]> {
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
      fetchRoute(key, r.waypoints)
        .catch(() => cache.set(key, r.fallback))
        .finally(() => { pending.delete(key); if (alive) bump((n) => n + 1) })
    }
    return () => { alive = false }
  }, [keys])
  const out: Record<string, LatLng[]> = {}
  for (const r of requests) out[r.id] = cache.get(routeKey(r.waypoints)) ?? r.fallback
  return out
}
