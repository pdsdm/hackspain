import type { AgentStatus, CommitmentStatus, CoordinatorStatus, EventKind, SpaceStatus } from '../../domain/types'
import type { Tone } from './Pill'

export const COMMITMENT: Record<CommitmentStatus, { label: string; tone: Tone }> = {
  propuesto: { label: 'Propuesto', tone: 'cyan' },
  en_consulta: { label: 'En consulta', tone: 'cyan' },
  aceptado_condiciones: { label: 'Aceptado con condiciones', tone: 'amber' },
  confirmado: { label: 'Confirmado', tone: 'green' },
  en_ejecucion: { label: 'En ejecución', tone: 'green' },
  completado: { label: 'Completado', tone: 'green' },
  invalidado: { label: 'Invalidado', tone: 'red' },
}

export const AGENT: Record<AgentStatus, { label: string; tone: Tone }> = {
  activo: { label: 'Activo', tone: 'cyan' },
  llamada: { label: 'En llamada', tone: 'cyan' },
  esperando: { label: 'Esperando', tone: 'amber' },
  pausado: { label: 'Pausado', tone: 'muted' },
  incidencia: { label: 'Incidencia', tone: 'red' },
  estable: { label: 'Estable', tone: 'green' },
}

export const COORD: Record<CoordinatorStatus, { label: string; tone: Tone }> = {
  estable: { label: 'Estable', tone: 'green' },
  replanificando: { label: 'Replanificando', tone: 'cyan' },
  esperando_decision: { label: 'Esperando decisión', tone: 'amber' },
  pausado: { label: 'Pausado', tone: 'muted' },
}

export const SPACE: Record<SpaceStatus, { label: string; tone: Tone; cls: string }> = {
  cerrado: { label: 'Cerrado', tone: 'red', cls: 'closed' },
  operativo: { label: 'Operativo', tone: 'green', cls: 'ok' },
  propuesto: { label: 'Propuesto', tone: 'cyan', cls: 'proposed' },
  pendiente: { label: 'Pendiente', tone: 'amber', cls: 'pending' },
  confirmado: { label: 'Confirmado', tone: 'green', cls: 'ok' },
  descartado: { label: 'Descartado', tone: 'muted', cls: 'idle ghost' },
  inactivo: { label: 'Sin usar', tone: 'muted', cls: 'idle ghost' },
}

export const EVENT_DOT: Record<EventKind, string> = {
  incidencia: 'bg-red',
  fallo: 'bg-red',
  accion: 'bg-cyan',
  info: 'bg-muted',
  acuerdo: 'bg-green',
  espera: 'bg-amber',
  decision: 'bg-amber',
  intervencion: 'bg-white',
  mensaje: 'bg-cyan',
}
