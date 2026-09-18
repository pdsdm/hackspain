import { AlertTriangle, MapPin, Bus, Truck } from 'lucide-react'
import type { CrisisState } from '../../domain/types'
import { fmtClock } from '../../domain/time'
import { Panel } from '../ui/Panel'
import { Pill } from '../ui/Pill'
import { SPACE } from '../ui/status'

const AREA_TEXT: Record<string, { title: string; body: string }> = {
  'area-espacios': { title: 'Espacios', body: 'Pabellón Principal cerrado. Alternativas en Sur: Pabellón B (450) + Lounge Sur (150). Norte C (600) requiere traslado exterior.' },
  'area-catering': { title: 'Catering', body: '600 servicios en 2 entregas. Muelle Sur inutilizable: redirección a Muelle Este pendiente de validación.' },
  'area-transporte': { title: 'Transporte', body: '4 shuttles (180 personas) con destino Acceso Sur. Parada de autocar por confirmar.' },
  'area-asistentes': { title: 'Asistentes', body: '90 en acceso Sur, 180 en shuttles, 330 por sus medios. Avisos retenidos hasta tener plan confirmado.' },
}

export function IncidenciaCard({ s }: { s: CrisisState }) {
  const id = s.selectedId
  const sp = s.spaces.find((x) => x.id === id)
  const sh = s.shuttles.find((x) => x.id === id)
  const d = s.deliveries.find((x) => x.id === id)
  const area = id ? AREA_TEXT[id] : undefined
  const left = s.clock.openingAt - s.clock.simSeconds

  let body: React.ReactNode
  if (sp) {
    const st = SPACE[sp.status]
    body = (
      <>
        <div className="flex items-start gap-2">
          <MapPin size={18} className={`mt-0.5 ${st.tone === 'red' ? 'text-red' : st.tone === 'green' ? 'text-green' : st.tone === 'amber' ? 'text-amber' : 'text-cyan'}`} />
          <div className="flex-1 min-w-0">
            <div className="font-semibold">{sp.name}</div>
            <div className="text-[12px] text-muted">MADRING {sp.zone === 'sur' ? 'Sur' : 'Norte'}{sp.capacity ? ` · ${sp.capacity} plazas` : ''}</div>
          </div>
          <Pill tone={st.tone}>{st.label}</Pill>
        </div>
        {sp.note && <p className="mt-2 text-[12px] text-text/80">{sp.note}</p>}
        {sp.readyAt && <p className="mt-1 text-[12px] text-muted">Listo a las <span className="text-text num">{fmtClock(sp.readyAt)}</span></p>}
      </>
    )
  } else if (sh) {
    body = (
      <>
        <div className="flex items-start gap-2">
          <Bus size={18} className={`mt-0.5 ${sh.status === 'retrasado' ? 'text-amber' : 'text-cyan'}`} />
          <div className="flex-1">
            <div className="font-semibold">{sh.name} · {sh.passengers} pasajeros</div>
            <div className="text-[12px] text-muted">{sh.origin} → {sh.destinationId === 'accesoNorte' ? 'Acceso Norte' : 'Acceso Sur (P2)'}</div>
          </div>
          <Pill tone={sh.status === 'retrasado' ? 'amber' : sh.accepted ? 'green' : 'cyan'}>{sh.status === 'llegado' ? 'Llegado' : sh.status === 'retrasado' ? `+${sh.delayMin} min` : sh.accepted ? 'Ruta aceptada' : 'Instrucción pendiente'}</Pill>
        </div>
        <p className="mt-2 text-[12px] text-muted">Llegada prevista <span className="text-text num">{fmtClock(sh.arriveAt)}</span></p>
      </>
    )
  } else if (d) {
    body = (
      <>
        <div className="flex items-start gap-2">
          <Truck size={18} className="mt-0.5 text-amber" />
          <div className="flex-1">
            <div className="font-semibold">{d.name}</div>
            <div className="text-[12px] text-muted">Destino: {s.spaces.find((x) => x.id === d.dockId)?.name ?? d.dockId}</div>
          </div>
          <Pill tone={d.status === 'confirmada' || d.status === 'entregada' ? 'green' : d.status === 'programada' ? 'cyan' : 'red'}>{d.status}</Pill>
        </div>
        <p className="mt-2 text-[12px] text-text/80">{d.note}</p>
        <p className="mt-1 text-[12px] text-muted">Llegada prevista <span className="text-text num">{fmtClock(d.arriveAt)}</span></p>
      </>
    )
  } else if (area) {
    body = (
      <>
        <div className="font-semibold">{area.title}</div>
        <p className="mt-1 text-[12px] text-text/80">{area.body}</p>
      </>
    )
  } else {
    body = <p className="text-[12px] text-muted">Selecciona un elemento del mapa o de la lista.</p>
  }

  return (
    <Panel title="Incidencia seleccionada">
      <div className="rounded-md border border-amber/50 bg-amber/5 p-3">
        <div className="flex items-center gap-2 text-amber font-semibold mb-2">
          <AlertTriangle size={16} /> Pabellón Principal fuera de servicio
          <span className="ml-auto text-[11px] text-muted font-normal">Ventana: <span className="text-amber num">{Math.max(0, Math.floor(left / 60))} min</span></span>
        </div>
        <div className="border-t border-amber/20 pt-2">{body}</div>
      </div>
    </Panel>
  )
}
