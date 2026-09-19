import L from 'leaflet'
import { renderToStaticMarkup } from 'react-dom/server'
import { createElement, type ComponentType } from 'react'
import { Building2, Bus, Car, DoorOpen, Flag, Hourglass, Package, PackageOpen, SquareParking, Star, Truck, Tv } from 'lucide-react'
import type { SpaceKind } from '../../domain/types'

const draw = (c: ComponentType<{ size?: number; strokeWidth?: number }>, size = 13) =>
  renderToStaticMarkup(createElement(c, { size, strokeWidth: 2 }))

/** Marker rank drives size, label visibility and stacking: venues carry the story, parkings are context. */
export type Rank = 'sede' | 'acceso' | 'servicio' | 'contexto'

const KIND: Record<SpaceKind, { icon: string; rank: Rank }> = {
  pabellon: { icon: draw(Building2, 14), rank: 'sede' },
  lounge: { icon: draw(Tv, 14), rank: 'sede' },
  paddock: { icon: draw(Flag, 14), rank: 'sede' },
  acceso: { icon: draw(DoorOpen, 12), rank: 'acceso' },
  muelle: { icon: draw(PackageOpen, 12), rank: 'servicio' },
  espera: { icon: draw(Hourglass, 12), rank: 'servicio' },
  parking: { icon: draw(SquareParking, 12), rank: 'contexto' },
}

export const rankOf = (kind: SpaceKind): Rank => KIND[kind].rank

const Z: Record<Rank, number> = { sede: 600, acceso: 450, servicio: 350, contexto: 200 }
export const zIndexOf = (rank: Rank) => Z[rank]

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c] as string))

/**
 * Chip anchored above its exact coordinate, with a stem and a point dot, so the
 * label never sits on top of the place it names. `labelled: false` collapses it
 * to the dot alone, which is how secondary markers survive a zoomed-out view.
 */
export function placeIcon(opts: {
  kind: SpaceKind
  name: string
  cls: string
  meta?: string
  labelled: boolean
  active?: boolean
}) {
  const { icon, rank } = KIND[opts.kind]
  const state = `${opts.cls}${opts.active ? ' is-active' : ''}`
  if (!opts.labelled) {
    return L.divIcon({
      html: `<div class="mk-wrap mk-bare"><span class="mk-bead ${state}" title="${esc(opts.name)}">${icon}</span></div>`,
      className: 'mk-icon',
      iconSize: [0, 0],
      iconAnchor: [0, 0],
    })
  }
  const meta = opts.meta ? `<span class="mk-meta">${esc(opts.meta)}</span>` : ''
  const html = `<div class="mk-wrap">
    <span class="mk-chip mk-${rank} ${state}">
      <span class="mk-ico">${icon}</span>
      <span class="mk-text"><span class="mk-name">${esc(opts.name)}</span>${meta}</span>
    </span>
    <span class="mk-stem"></span>
    <span class="mk-pt"></span>
  </div>`
  return L.divIcon({ html, className: 'mk-icon', iconSize: [0, 0], iconAnchor: [0, 0] })
}

export type VehicleIconKind = 'bus' | 'truck' | 'taxi' | 'vip' | 'van'

export const KIND_COLOR: Record<VehicleIconKind, string> = { bus: '#1a1d24', taxi: '#1f9d55', vip: '#7c3aed', truck: '#c47a00', van: '#0f8b8d' }
export const TRACK_COLOR = '#2563eb'

const SVG: Record<VehicleIconKind, string> = {
  bus: draw(Bus, 12),
  truck: draw(Truck, 12),
  taxi: draw(Car, 12),
  vip: draw(Star, 12),
  van: draw(Package, 12),
}

export function vehicleIcon(kind: VehicleIconKind, delayed = false, label?: string) {
  const cls = delayed ? 'delayed' : kind === 'truck' ? 'truck' : kind === 'van' ? 'van' : ''
  const chip = label ? `<div class="vehicle-eta ${cls}">${esc(label)}</div>` : ''
  return L.divIcon({ html: `<div class="vehicle-wrap"><div class="vehicle ${cls} kind-${kind}">${SVG[kind]}</div>${chip}</div>`, className: '', iconSize: [22, 22], iconAnchor: [11, 11] })
}

export const zoneLabelIcon = (text: string, sub: string) =>
  L.divIcon({ html: `<div class="zone-label"><b>${esc(text)}</b><span>${esc(sub)}</span></div>`, className: '', iconSize: [0, 0], iconAnchor: [0, 0] })

export const barrierLabelIcon = (text: string) =>
  L.divIcon({ html: `<div class="barrier-label">${esc(text)}</div>`, className: '', iconSize: [0, 0], iconAnchor: [0, 0] })

/** Gate chip: queue is the number that matters, so it leads and carries the saturation bar. */
export function gateIcon(name: string, entered: number, capacity: number, waiting: number, status: string, labelled: boolean) {
  const k = (n: number) => (n >= 1000 ? `${(n / 1000).toFixed(1).replace('.0', '')}k` : String(Math.round(n)))
  const pct = capacity > 0 ? Math.min(100, Math.round((entered / capacity) * 100)) : 0
  if (!labelled) {
    return L.divIcon({
      html: `<div class="mk-wrap mk-bare"><span class="gate-bead ${status}" title="${esc(name)}">${k(waiting)}</span></div>`,
      className: 'mk-icon',
      iconSize: [0, 0],
      iconAnchor: [0, 0],
    })
  }
  const html = `<div class="mk-wrap">
    <span class="gate-chip ${status}">
      <span class="gate-top"><span class="gate-name">${esc(name)}</span><span class="gate-queue">${k(waiting)} <i>cola</i></span></span>
      <span class="gate-bar"><i style="width:${pct}%"></i></span>
      <span class="gate-sub">${k(entered)} de ${k(capacity)} dentro</span>
    </span>
    <span class="mk-stem"></span>
    <span class="mk-pt"></span>
  </div>`
  return L.divIcon({ html, className: 'mk-icon', iconSize: [0, 0], iconAnchor: [0, 0] })
}
