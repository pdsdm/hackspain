import type { ReactNode } from 'react'

export function Panel({ title, right, children, className = '', bodyClass = '' }: { title?: ReactNode; right?: ReactNode; children: ReactNode; className?: string; bodyClass?: string }) {
  return (
    <section className={`bg-panel border border-line flex flex-col min-h-0 ${className}`}>
      {title && (
        <header className="flex items-center justify-between px-4 py-3 border-b border-line">
          <h2 className="label">{title}</h2>
          {right}
        </header>
      )}
      <div className={`p-4 min-h-0 ${bodyClass}`}>{children}</div>
    </section>
  )
}
