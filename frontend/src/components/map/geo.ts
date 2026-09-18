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
