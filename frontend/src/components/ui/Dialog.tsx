import { useEffect, useRef, type ReactNode } from 'react'
import { X } from 'lucide-react'

export function Dialog({ title, children, onClose }: { title: string; children: ReactNode; onClose: () => void }) {
  const ref = useRef<HTMLDialogElement>(null)
  useEffect(() => {
    const dialog = ref.current!
    dialog.showModal()
    return () => dialog.close()
  }, [])
  return <dialog ref={ref} className="operation-dialog" aria-label={title} onCancel={onClose} onClick={(e) => { if (e.target === e.currentTarget) onClose() }}>
    <div className="dialog-content">
      <header className="flex items-center justify-between gap-4 border-b border-line pb-3 mb-4"><h2 className="display text-[18px] font-bold">{title}</h2><button className="small-button" aria-label="Cerrar diálogo" onClick={onClose}><X size={18} /></button></header>
      {children}
    </div>
  </dialog>
}
