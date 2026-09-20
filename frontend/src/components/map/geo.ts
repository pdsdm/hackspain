import type { LatLng } from '../../domain/types'

function dist(a: LatLng, b: LatLng) {
  const dx = (a[1] - b[1]) * Math.cos((a[0] * Math.PI) / 180)
  const dy = a[0] - b[0]
  return Math.sqrt(dx * dx + dy * dy)
}

export function pointAlong(route: LatLng[], t: number): LatLng {
  if (route.length === 0) return [0, 0]
  if (route.length === 1 || t <= 0) return route[0]
  if (t >= 1) return route[route.length - 1]
  const segs = route.slice(1).map((p, i) => dist(route[i], p))
  const total = segs.reduce((a, b) => a + b, 0)
  let target = t * total
  for (let i = 0; i < segs.length; i++) {
    if (target <= segs[i]) {
      const f = segs[i] === 0 ? 0 : target / segs[i]
      const a = route[i], b = route[i + 1]
      return [a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f]
    }
    target -= segs[i]
  }
  return route[route.length - 1]
}

export function progress(depart: number, arrive: number, now: number) {
  if (arrive <= depart) return 1
  return Math.max(0, Math.min(1, (now - depart) / (arrive - depart)))
}

const M_PER_DEG = 111320

function metres(a: LatLng, b: LatLng) {
  return dist(a, b) * M_PER_DEG
}

function pointToSegmentMetres(p: LatLng, a: LatLng, b: LatLng) {
  const k = Math.cos((p[0] * Math.PI) / 180)
  const ax = (a[1] - p[1]) * k, ay = a[0] - p[0]
  const bx = (b[1] - p[1]) * k, by = b[0] - p[0]
  const dx = bx - ax, dy = by - ay
  const len2 = dx * dx + dy * dy
  const t = len2 === 0 ? 0 : Math.max(0, Math.min(1, -(ax * dx + ay * dy) / len2))
  const x = ax + dx * t, y = ay + dy * t
  return Math.sqrt(x * x + y * y) * M_PER_DEG
}

export interface Corridor { lines: LatLng[][]; bbox: [number, number, number, number] }

export function corridorOf(lines: LatLng[][], padMetres: number): Corridor {
  const pad = padMetres / M_PER_DEG
  let s = 90, n = -90, w = 180, e = -180
  for (const line of lines) for (const [lat, lng] of line) { s = Math.min(s, lat); n = Math.max(n, lat); w = Math.min(w, lng); e = Math.max(e, lng) }
  return { lines, bbox: [s - pad, n + pad, w - pad, e + pad] }
}

function nearCorridor(p: LatLng, c: Corridor, within: number) {
  const [s, n, w, e] = c.bbox
  if (p[0] < s || p[0] > n || p[1] < w || p[1] > e) return false
  for (const line of c.lines) for (let i = 1; i < line.length; i++) if (pointToSegmentMetres(p, line[i - 1], line[i]) <= within) return true
  return false
}

export function overlapMetres(route: LatLng[], c: Corridor, within: number) {
  let total = 0
  for (let i = 1; i < route.length; i++) {
    const a = route[i - 1], b = route[i]
    const mid: LatLng = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2]
    if (nearCorridor(mid, c, within)) total += metres(a, b)
  }
  return total
}

export function corridorRun(route: LatLng[], c: Corridor, within: number): [LatLng, LatLng] | undefined {
  let best: [number, number] | undefined
  let start = -1
  let length = 0
  let bestLength = 0
  for (let i = 1; i <= route.length; i++) {
    const inside = i < route.length && nearCorridor([(route[i - 1][0] + route[i][0]) / 2, (route[i - 1][1] + route[i][1]) / 2], c, within)
    if (inside) {
      if (start < 0) { start = i - 1; length = 0 }
      length += metres(route[i - 1], route[i])
    } else if (start >= 0) {
      if (length > bestLength) { bestLength = length; best = [start, i - 1] }
      start = -1
    }
  }
  return best ? [route[best[0]], route[best[1]]] : undefined
}
