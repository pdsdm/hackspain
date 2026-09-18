import type { ReactNode } from 'react'

export function Panel({ title, right, children, className = '', bodyClass = '' }: { title?: ReactNode; right?: ReactNode; children: ReactNode; className?: string; bodyClass?: string }) {
  return (
    <section className={`bg-panel border border-line rounded-lg flex flex-col min-h-0 ${className}`}>
      {title && (
        <header className="flex items-center justify-between px-3 py-2 border-b border-line">
          <h2 className="text-[11px] font-semibold uppercase tracking-[0.12em] text-muted">{title}</h2>
          {right}
        </header>
      )}
      <div className={`p-3 min-h-0 ${bodyClass}`}>{children}</div>
    </section>
  )
}
