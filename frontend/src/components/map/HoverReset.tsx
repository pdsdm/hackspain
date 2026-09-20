import { useEffect } from 'react'
import L from 'leaflet'
import { useMap } from 'react-leaflet'

const LEAVE_MS = 160
const patched = Symbol.for('madring.tooltipFade')
type Patchable = typeof L.Layer.prototype & { [patched]?: boolean }

function patchTooltipFade() {
  const proto = L.Layer.prototype as Patchable
  if (proto[patched]) return
  proto[patched] = true
  const close = proto.closeTooltip
  const open = proto.openTooltip
  proto.openTooltip = function (this: L.Layer, latlng?: L.LatLngExpression) {
    const el = this.getTooltip()?.getElement()
    el?.classList.remove('is-leaving')
    return open.call(this, latlng)
  }
  proto.closeTooltip = function (this: L.Layer) {
    const tip = this.getTooltip()
    const el = tip?.getElement()
    if (!tip || !el || !tip.isOpen() || el.classList.contains('is-leaving')) return close.call(this)
    el.classList.add('is-leaving')
    window.setTimeout(() => { if (el.classList.contains('is-leaving')) close.call(this) }, LEAVE_MS)
    return this
  }
}

function closeAllTooltips(map: L.Map) {
  map.eachLayer((layer) => { if (layer.getTooltip?.()?.isOpen()) layer.closeTooltip() })
}

export function HoverReset({ onReset }: { onReset: () => void }) {
  const map = useMap()
  useEffect(() => {
    patchTooltipFade()
    const container = map.getContainer()
    const reset = () => { closeAllTooltips(map); onReset() }
    const onOver = (e: PointerEvent) => {
      const target = e.target as Element | null
      if (target?.closest('.map-overlays > *')) reset()
    }
    container.addEventListener('pointerleave', reset)
    document.addEventListener('pointerover', onOver)
    return () => {
      container.removeEventListener('pointerleave', reset)
      document.removeEventListener('pointerover', onOver)
    }
  }, [map, onReset])
  return null
}
