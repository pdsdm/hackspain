import type { CrisisState } from '../../domain/types'
import type { StateChange } from '../../domain/changes'
import { SPACE, COMMITMENT } from '../ui/status'
import { fmtClock } from '../../domain/time'
import { Dialog } from '../ui/Dialog'

export function ResourceDetail({ s, id, changes, onClose }: { s: CrisisState; id: string; changes: StateChange[]; onClose: () => void }) {
  const space = s.spaces.find((v) => v.id === id)
  const shuttle = s.shuttles.find((v) => v.id === id)
  const delivery = s.deliveries.find((v) => v.id === id)
  const commitment = s.commitments.find((v) => v.id === id)
  const group = s.guestGroups.find((v) => v.id === id)
  const decision = s.decisions.find((v) => v.id === id)
  const title = space?.name ?? shuttle?.name ?? delivery?.name ?? commitment?.title ?? group?.name ?? decision?.title ?? 'Detalle del recurso'
  const relevant = changes.filter((c) => c.resourceId === id)
  const place = (placeId: string) => s.spaces.find((v) => v.id === placeId)?.name ?? placeId
  return <Dialog title={title} onClose={onClose}>
    <div className="space-y-3 text-[14px]">
      {space && <><p><strong>{SPACE[space.status].label}</strong> · Zona {space.zone}{space.capacity ? ` · ${space.capacity} ${space.kind === 'espera' ? 'personas en espera' : 'plazas'}` : ''}</p><p>{space.note}</p>{space.readyAt && <p>Horario registrado: {fmtClock(space.readyAt)}. {['cerrado', 'descartado'].includes(space.status) ? 'La disponibilidad anterior ya no es válida.' : 'Sujeto al estado de la reserva.'}</p>}{space.zone === 'norte' && <p className="text-amber">El traslado requiere acceso Norte autorizado, transporte exterior y horario confirmado.</p>}</>}
      {shuttle && <><p>{shuttle.passengers} pasajeros · {shuttle.origin} → {place(shuttle.destinationId)}</p><p>Llegada {fmtClock(shuttle.arriveAt)} · {shuttle.status.replaceAll('_', ' ')} · {shuttle.accepted ? 'Instrucción aceptada' : 'Instrucción pendiente'}</p></>}
      {delivery && <><p>{delivery.services} servicios → {place(delivery.dockId)}</p><p>{delivery.status} · llegada {fmtClock(delivery.arriveAt)}</p><p>{delivery.note}</p></>}
      {commitment && <><p>{COMMITMENT[commitment.status].label} · {commitment.counterpart} · plan v{commitment.planVersion}</p><p>{commitment.note}</p><ul>{commitment.conditions.map((c) => <li key={c}>• {c}</li>)}</ul></>}
      {group && <><p>{group.count} invitados · {group.where}</p><p>{group.confirmedCount} con ubicación · {group.informedCount} informados · {group.acceptedCount} aceptan.</p><p>{group.needs}</p></>}
      {decision && <><p>{decision.summary}</p><p>Estado: {decision.status}</p></>}
      {relevant.length ? relevant.map((c) => <div className="detail-delta" key={c.id}><p><span>Antes</span> {c.before}</p><p><span>Ahora</span> {c.after}</p></div>) : <p className="text-muted text-[12px]">Sin diferencias operativas respecto a la referencia.</p>}
    </div>
  </Dialog>
}
