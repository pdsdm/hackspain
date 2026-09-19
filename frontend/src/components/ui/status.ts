import type { AgentStatus, CommitmentStatus, CoordinatorStatus, EventKind, SpaceStatus } from '../../domain/types'
import type { Tone } from './Pill'

export const COMMITMENT: Record<CommitmentStatus, { label: string; tone: Tone }> = {
  propuesto: { label: 'Propuesto', tone: 'ink' },
  en_consulta: { label: 'En consulta', tone: 'ink' },
  aceptado_condiciones: { label: 'Aceptado con condiciones', tone: 'amber' },
  confirmado: { label: 'Confirmado', tone: 'green' },
  en_ejecucion: { label: 'En ejecución', tone: 'green' },
  completado: { label: 'Completado', tone: 'green' },
  invalidado: { label: 'Invalidado', tone: 'red' },
}

export const AGENT: Record<AgentStatus, { label: string; tone: Tone }> = {
  activo: { label: 'Activo', tone: 'ink' },
  llamada: { label: 'En llamada', tone: 'ink' },
  esperando: { label: 'Esperando', tone: 'amber' },
  pausado: { label: 'Pausado', tone: 'muted' },
  incidencia: { label: 'Incidencia', tone: 'red' },
  estable: { label: 'Estable', tone: 'green' },
}

export const COORD: Record<CoordinatorStatus, { label: string; tone: Tone }> = {
  estable: { label: 'Estable', tone: 'green' },
  replanificando: { label: 'Replanificando', tone: 'ink' },
  esperando_decision: { label: 'Esperando decisión', tone: 'amber' },
  pausado: { label: 'Pausado', tone: 'muted' },
  atascado: { label: 'Plan incompleto', tone: 'red' },
}

export const SPACE: Record<SpaceStatus, { label: string; tone: Tone; cls: string }> = {
  cerrado: { label: 'Cerrado', tone: 'red', cls: 'closed' },
  operativo: { label: 'Operativo', tone: 'green', cls: 'ok' },
  propuesto: { label: 'Propuesto', tone: 'ink', cls: 'proposed' },
  pendiente: { label: 'Pendiente', tone: 'amber', cls: 'pending' },
  confirmado: { label: 'Confirmado', tone: 'green', cls: 'ok' },
  descartado: { label: 'Descartado', tone: 'muted', cls: 'idle ghost' },
  inactivo: { label: 'Sin usar', tone: 'muted', cls: 'idle ghost' },
}

const SPACE_FALLBACK = { label: 'Estado no previsto', tone: 'amber' as Tone, cls: 'pending' }

export function spaceLook(status: string): { label: string; tone: Tone; cls: string } {
  return SPACE[status as SpaceStatus] ?? { ...SPACE_FALLBACK, label: status || SPACE_FALLBACK.label }
}

export const EVENT_DOT: Record<EventKind, string> = {
  incidencia: 'bg-red',
  fallo: 'bg-red',
  accion: 'bg-ink',
  info: 'bg-muted',
  acuerdo: 'bg-green',
  espera: 'bg-amber',
  decision: 'bg-amber',
  intervencion: 'bg-white',
  mensaje: 'bg-ink',
}
