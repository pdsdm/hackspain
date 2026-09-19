import { useEffect, useRef, useState, type ReactNode } from 'react'
import L from 'leaflet'
import { useMap } from 'react-leaflet'
import { ZONE_NORTE, ZONE_SUR } from '../../domain/initialState'
import { TRACK } from '../../domain/track'
import type { LatLng } from '../../domain/types'

export interface LabelCandidate {
  id: string
  pos: LatLng
  /** Lower wins the space: venues before gates before docks before parkings. */
  priority: number
  w: number
  h: number
}

type Box = [number, number, number, number]
const STEM = 17
/** Every marker keeps at least a bead on its point, chip or no chip. */
const BEAD = 20
const ZONE_LABEL_ZOOM = 14.5
const TRACK_RESERVE_ZOOM = 15

/** Zone captions are painted under the markers, so they reserve their space up front. */
const FIXED: Array<{ pos: LatLng; w: number; h: number }> = [
  { pos: [40.4597, -3.6170], w: 210, h: 40 },
  { pos: [40.4838, -3.6248], w: 210, h: 40 },
]

const overlaps = (a: Box, b: Box) => a[0] < b[2] && a[2] > b[0] && a[1] < b[3] && a[3] > b[1]

function padAt(zoom: number) {
  if (zoom < 14) return 36
  if (zoom < 15) return 18
  return 8
}

/** Far out, only venues keep a chip; the rest wait until the circuit is readable. */
function allowedAt(zoom: number, priority: number) {
  if (zoom < 13.9) return false
  if (zoom < 14.7) return priority < 10
  if (zoom < 15.3) return priority < 25
  return true
}

function reserveTrack(map: L.Map, zoom: number): Box[] {
  if (zoom >= TRACK_RESERVE_ZOOM) return []
  const r = zoom < 14 ? 12 : 8
  const step = Math.max(1, Math.floor(TRACK.length / 80))
  const boxes: Box[] = []
  for (let i = 0; i < TRACK.length; i += step) {
    const p = map.latLngToContainerPoint(TRACK[i])
    boxes.push([p.x - r, p.y - r, p.x + r, p.y + r])
  }
  return boxes
}

/**
 * Greedy label placement in screen space: the highest-priority marker keeps its
 * label, anything whose box would collide collapses to a bead. Recomputed on
 * every pan and zoom, which is what stops the map turning into a pile of chips.
 */
export function LabelPlanner({ candidates, onPlan }: { candidates: LabelCandidate[]; onPlan: (ids: Set<string>) => void }) {
  const map = useMap()
  const signature = useRef('')

  useEffect(() => {
    const compute = () => {
      const size = map.getSize()
      const zoom = map.getZoom()
      const pad = padAt(zoom)
      const placed: Box[] = []
      if (zoom >= ZONE_LABEL_ZOOM) {
        for (const f of FIXED) {
          const p = map.latLngToContainerPoint(f.pos)
          placed.push([p.x - f.w / 2 - pad, p.y - f.h / 2 - pad, p.x + f.w / 2 + pad, p.y + f.h / 2 + pad])
        }
      }
      placed.push(...reserveTrack(map, zoom))
      const onScreen = candidates.filter((c) => {
        if (!allowedAt(zoom, c.priority)) return false
        const p = map.latLngToContainerPoint(c.pos)
        return p.x > -80 && p.y > -80 && p.x < size.x + 80 && p.y < size.y + 80
      })
      const winners = new Set<string>()
      for (const c of [...onScreen].sort((a, b) => a.priority - b.priority)) {
        const p = map.latLngToContainerPoint(c.pos)
        const box: Box = [p.x - c.w / 2 - pad, p.y - STEM - c.h - pad, p.x + c.w / 2 + pad, p.y - STEM + pad]
        if (placed.some((q) => overlaps(box, q))) {
          placed.push([p.x - BEAD / 2, p.y - BEAD / 2, p.x + BEAD / 2, p.y + BEAD / 2])
          continue
        }
        placed.push(box)
        winners.add(c.id)
      }
      const key = [...winners].sort().join('|')
      if (key !== signature.current) {
        signature.current = key
        onPlan(winners)
      }
    }
    compute()
    map.on('moveend zoomend resize', compute)
    return () => {
      map.off('moveend zoomend resize', compute)
    }
  }, [map, candidates, onPlan])

  return null
}

/** Hides map chrome (zone titles, the barrier caption) until the zoom can carry it. */
export function ZoomGate({ min, children }: { min: number; children: ReactNode }) {
  const map = useMap()
  const [ok, setOk] = useState(() => map.getZoom() >= min)
  useEffect(() => {
    const sync = () => setOk(map.getZoom() >= min)
    sync()
    map.on('zoomend', sync)
    return () => { map.off('zoomend', sync) }
  }, [map, min])
  return ok ? children : null
}

/**
 * Frames both zones inside the strip of map the side panels leave visible. The
 * container is still being laid out on mount, so the fit waits for a real size
 * and repeats on resize — until the operator takes over by panning or zooming.
 */
export function FitVenue({ insets }: { insets: { left: number; right: number; top: number; bottom: number } }) {
  const map = useMap()
  const taken = useRef(false)

  useEffect(() => {
    const bounds = L.latLngBounds([...ZONE_SUR, ...ZONE_NORTE] as L.LatLngExpression[])
    // fitBounds fires the same zoom events a user does, so ours are flagged.
    let programmatic = false
    const fit = () => {
      if (taken.current) return
      map.invalidateSize({ animate: false })
      const size = map.getSize()
      if (size.x < insets.left + insets.right + 80 || size.y < insets.top + insets.bottom + 80) return
      programmatic = true
      map.fitBounds(bounds, {
        paddingTopLeft: [insets.left, insets.top],
        paddingBottomRight: [insets.right, insets.bottom],
        animate: false,
      })
      programmatic = false
    }
    const release = () => { if (!programmatic) taken.current = true }

    fit()
    const raf = requestAnimationFrame(fit)
    const settle = setTimeout(fit, 260)
    map.on('resize', fit)
    map.on('dragstart', release)
    map.on('zoomstart', release)
    return () => {
      cancelAnimationFrame(raf)
      clearTimeout(settle)
      map.off('resize', fit)
      map.off('dragstart', release)
      map.off('zoomstart', release)
    }
  }, [map, insets.left, insets.right, insets.top, insets.bottom])

  return null
}
