import { useEffect, type ReactNode } from 'react'
import { X } from 'lucide-react'

export function Drawer({ open, onClose, children }: { open: boolean; onClose: () => void; children: ReactNode }) {
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])
  if (!open) return null
  return (
    <div className="fixed inset-0 z-[1500]" onClick={onClose}>
      <aside aria-label="Panel de control" className="absolute top-0 right-0 h-full w-[380px] max-w-full bg-panel border-l border-line shadow-[0_0_40px_rgba(26,29,36,.18)] flex flex-col" onClick={(e) => e.stopPropagation()}>
        <header className="flex items-center justify-between px-4 h-12 border-b border-line flex-none">
          <h2 className="label">Panel de control</h2>
          <button onClick={onClose} aria-label="Cerrar panel" className="w-8 h-8 grid place-items-center text-muted hover:text-ink"><X size={16} /></button>
        </header>
        <div className="flex-1 min-h-0 overflow-y-auto p-4 flex flex-col gap-4 [&>*]:flex-none">{children}</div>
      </aside>
    </div>
  )
}
