export type Zone = 'norte' | 'sur'
export type Area = 'espacios' | 'catering' | 'transporte' | 'asistentes'
export type LatLng = [number, number]

export type SpaceStatus = 'cerrado' | 'operativo' | 'propuesto' | 'pendiente' | 'confirmado' | 'descartado' | 'inactivo'
export type SpaceKind = 'pabellon' | 'lounge' | 'acceso' | 'muelle' | 'espera' | 'paddock' | 'parking'

export interface Space {
  id: string
  name: string
  kind: SpaceKind
  zone: Zone
  capacity?: number
  status: SpaceStatus
  note?: string
  readyAt?: number
  pos: LatLng
}

export type CommitmentStatus =
  | 'propuesto'
  | 'en_consulta'
  | 'aceptado_condiciones'
  | 'confirmado'
  | 'en_ejecucion'
  | 'completado'
  | 'invalidado'

export interface Commitment {
  id: string
  title: string
  area: Area
  status: CommitmentStatus
  counterpart: string
  conditions: string[]
  planVersion: number
  note?: string
  updatedAt: number
}

export type AgentStatus = 'activo' | 'llamada' | 'esperando' | 'pausado' | 'incidencia' | 'estable'

export interface Agent {
  id: Area
  name: string
  objective: string
  reason?: string
  status: AgentStatus
  lastResult?: string
}

export type ShuttleStatus = 'en_ruta' | 'retrasado' | 'llegado' | 'reasignado'

export interface Shuttle {
  id: string
  name: string
  passengers: number
  origin: string
  destinationId: string
  route: LatLng[]
  departAt: number
  arriveAt: number
  delayMin: number
  accepted: boolean
  status: ShuttleStatus
}

export type DeliveryStatus = 'programada' | 'confirmada' | 'retrasada' | 'bloqueada' | 'entregada' | 'invalidada'

export interface Delivery {
  id: string
  name: string
  services: number
  dockId: string
  route: LatLng[]
  departAt: number
  arriveAt: number
  status: DeliveryStatus
  note?: string
}

export type VehicleKind = 'taxi' | 'vip' | 'repartidor'
export type VehicleStatus = 'en_ruta' | 'retenido' | 'desviado' | 'llegado'

export interface Vehicle {
  id: string
  kind: VehicleKind
  name: string
  who: string
  count: number
  from: string
  origin: string
  originPos?: LatLng
  destinationId: string
  route: LatLng[]
  departAt: number
  arriveAt: number
  delayMin: number
  status: VehicleStatus
  counterpart: string
  note?: string
}

export type GateStatus = 'abierto' | 'saturado' | 'cerrado'

export interface Gate {
  id: string
  name: string
  zone: Zone
  pos: LatLng
  capacity: number
  entered: number
  waiting: number
  arrivalsPerMin: number
  throughputPerMin: number
  status: GateStatus
  arrivalProfile?: { at: number; perMin: number }[]
  baseArrivalsPerMin?: number
  burstUntil?: number
  burstPerMin?: number
  lastSaturationAt?: number
}

export interface GuestGroup {
  id: string
  name: string
  count: number
  where: string
  assignedSpaceId?: string
  confirmedCount: number
  informedCount: number
  acceptedCount: number
  needs?: string
}

export type DecisionStatus = 'pendiente' | 'aprobada' | 'rechazada'

export interface Decision {
  id: string
  title: string
  summary: string
  rationale?: string
  kind?: 'operational'
  cost: number | null
  conditions: string[]
  effectApprove: string
  effectReject: string
  status: DecisionStatus
  createdAt: number
}

export interface TranscriptLine {
  who: 'agente' | 'humano'
  text: string
  at: number
}

export type CallStatus = 'en_curso' | 'terminada' | 'sin_respuesta'

export interface Call {
  id: string
  agent: Area
  counterpart: string
  channel: 'llamada' | 'sms'
  startedAt: number
  endsAfter: number
  status: CallStatus
  simulated?: boolean
  transcript: TranscriptLine[]
}

export type EventKind = 'incidencia' | 'accion' | 'acuerdo' | 'espera' | 'decision' | 'intervencion' | 'fallo' | 'info' | 'mensaje'

export interface TimelineEvent {
  id: string
  time: number
  kind: EventKind
  text: string
  area?: Area
  channel?: 'call' | 'sms' | 'webcall' | 'api'
  actor?: string
  simulated?: boolean
}

export interface Budget {
  contingency: number
  autonomousLimit: number
  authorized: number
  forecast: number | null
  committed: number
}

export type TwistId =
  | 'lounge_unavailable'
  | 'pabellon_b_400'
  | 'shuttle_delay'
  | 'delivery_delay'
  | 'dock_blocked'
  | 'provider_silent'
  | 'reject_split'
  | 'guest_need'

export type CoordinatorStatus = 'estable' | 'replanificando' | 'esperando_decision' | 'pausado' | 'atascado'

export interface Clock {
  simSeconds: number
  speed: number
  paused: boolean
  openingAt: number
  lunchAt: number
  raceAt: number
  seed?: number
  live?: boolean
  liveSeed?: number
  liveMode?: 'open' | 'catalog'
}

export interface CrisisState {
  simulated: boolean
  clock: Clock
  planVersion: number
  coordinatorStatus: CoordinatorStatus
  spaces: Space[]
  commitments: Commitment[]
  agents: Agent[]
  shuttles: Shuttle[]
  deliveries: Delivery[]
  vehicles?: Vehicle[]
  guestGroups: GuestGroup[]
  gates: Gate[]
  attendanceExpected: number
  decisions: Decision[]
  calls: Call[]
  events: TimelineEvent[]
  budget: Budget
  constraints: string[]
  twistsApplied: TwistId[]
  selectedId: string | null
  scriptId: 'main' | 'norte' | 'reducido'
  scriptCursor: number
  nextScriptAt: number | null
  waitingForDecision: string | null
  agentsPaused: boolean
  resolved: boolean
  closureSummary?: string
}

export type InterventionType =
  | 'approve_plan'
  | 'reject_plan'
  | 'reject_split'
  | 'pause'
  | 'resume'
  | 'set_constraint'
  | 'take_call'

export interface Intervention {
  type: InterventionType
  payload?: { text?: string; decisionId?: string; callId?: string }
}

export type Action =
  | { type: 'TICK'; deltaSeconds: number }
  | { type: 'TWIST'; twist: TwistId }
  | { type: 'INTERVENE'; intervention: Intervention }
  | { type: 'SET_SPEED'; speed: number }
  | { type: 'TOGGLE_PAUSE' }
  | { type: 'SELECT'; id: string | null }
  | { type: 'RESET' }
  | { type: 'REPLACE'; state: CrisisState }
