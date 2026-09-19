import { useEffect, useRef } from 'react'
import L from 'leaflet'

export function useStopMapEvents<T extends HTMLElement>() {
  const ref = useRef<T>(null)
  useEffect(() => {
    const el = ref.current
    if (!el) return
    L.DomEvent.disableClickPropagation(el)
    L.DomEvent.disableScrollPropagation(el)
  }, [])
  return ref
}
