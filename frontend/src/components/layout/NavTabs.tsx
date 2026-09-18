const TABS = ['Vista general', 'Movilidad', 'Proveedores', 'Infraestructura', 'Personal', 'Contingencias', 'Comunicaciones']

export function NavTabs() {
  return (
    <nav className="flex items-center px-4 h-9 border-b border-line bg-bg">
      <ul className="flex items-center gap-1 h-full">
        {TABS.map((t, i) => (
          <li key={t} className={`h-full flex items-center px-3 text-[12px] border-b-2 ${i === 0 ? 'border-cyan text-cyan' : 'border-transparent text-muted'}`}>{t}</li>
        ))}
      </ul>
      <span className="ml-auto text-[11px] italic text-muted">Personas en movimiento. Madrid contigo.</span>
    </nav>
  )
}
