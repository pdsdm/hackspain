import L from 'leaflet'
import { renderToStaticMarkup } from 'react-dom/server'
import { createElement } from 'react'
import { Bus, Truck } from 'lucide-react'

export function pinIcon(label: string, cls: string, sub?: string) {
  const html = `<div class="marker-pin ${cls}"><span class="dot"></span><span>${label}</span>${sub ? `<span style="color:#6b7079;font-weight:500">${sub}</span>` : ''}</div>`
  return L.divIcon({ html, className: '', iconAnchor: [6, 12] })
}

const busSvg = renderToStaticMarkup(createElement(Bus))
const truckSvg = renderToStaticMarkup(createElement(Truck))

export function vehicleIcon(kind: 'bus' | 'truck', delayed = false, label?: string) {
  const cls = kind === 'truck' ? 'truck' : delayed ? 'delayed' : ''
  const chip = label ? `<div class="vehicle-eta ${cls}">${label}</div>` : ''
  return L.divIcon({ html: `<div class="vehicle-wrap"><div class="vehicle ${cls}">${kind === 'bus' ? busSvg : truckSvg}</div>${chip}</div>`, className: '', iconSize: [22, 22], iconAnchor: [11, 11] })
}

export const zoneLabelIcon = (text: string) => L.divIcon({ html: `<div class="zone-label">${text}</div>`, className: '', iconSize: [160, 20], iconAnchor: [80, 10] })

export function gateIcon(name: string, entered: number, waiting: number, status: string) {
  const k = (n: number) => n >= 1000 ? `${(n / 1000).toFixed(1).replace('.0', '')}k` : String(Math.round(n))
  const html = `<div class="gate-pin ${status}"><span class="gate-name">${name}</span><span class="gate-nums"><b>${k(entered)}</b> dentro · <b>${k(waiting)}</b> cola</span></div>`
  return L.divIcon({ html, className: '', iconAnchor: [0, 0] })
}
