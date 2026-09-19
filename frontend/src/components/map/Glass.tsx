import type { ReactNode } from 'react'
import { useStopMapEvents } from './overlay'

export function Glass({ className = '', children, label }: { className?: string; children: ReactNode; label?: string }) {
  const ref = useStopMapEvents<HTMLElement>()
  return (
    <section ref={ref} aria-label={label} className={`glass flex flex-col min-h-0 ${className}`}>
      {children}
    </section>
  )
}
