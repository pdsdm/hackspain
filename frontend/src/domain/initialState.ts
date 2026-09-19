import type { CrisisState, LatLng } from './types'
import { hm } from './time'

export const T0 = hm(12, 15)

export const POS = {
  principal: [40.4662, -3.6200] as LatLng,
  pabellonB: [40.4685, -3.6195] as LatLng,
  loungeSur: [40.4672, -3.6228] as LatLng,
  norteC: [40.4765, -3.6215] as LatLng,
  accesoSur: [40.4640, -3.6165] as LatLng,
  accesoNorte: [40.4815, -3.6180] as LatLng,
  muelleSur: [40.4645, -3.6245] as LatLng,
  muelleEste: [40.4700, -3.6150] as LatLng,
  esperaSur: [40.4645, -3.6150] as LatLng,
  paddockNorte: [40.4790, -3.6240] as LatLng,
  parkingNorte: [40.4808, -3.6232] as LatLng,
  parkingSur: [40.4618, -3.6135] as LatLng,
  accesoSur2: [40.4668, -3.6125] as LatLng,
  accesoNorte2: [40.4745, -3.6192] as LatLng,
  accesoPaddock: [40.4782, -3.6254] as LatLng,
  muelleNorte: [40.4755, -3.6246] as LatLng,
  gateNorte: [40.4829, -3.6160] as LatLng,
  gateSur: [40.4631, -3.6158] as LatLng,
  gateEste: [40.4625, -3.6112] as LatLng,
  gateOeste: [40.4690, -3.6262] as LatLng,
  chamartin: [40.4728, -3.6826] as LatLng,
  castilla: [40.4666, -3.6892] as LatLng,
  t4: [40.4919, -3.5928] as LatLng,
  coslada: [40.4405, -3.5850] as LatLng,
}

export const ZONE_SUR: LatLng[] = [
  [40.46757, -3.62348],
  [40.47011, -3.62450],
  [40.47127, -3.62408],
  [40.47179, -3.62329],
  [40.47156, -3.61427],
  [40.47057, -3.61287],
  [40.46529, -3.61177],
  [40.46095, -3.61521],
  [40.46093, -3.61602],
  [40.46346, -3.62006],
]
export const ZONE_NORTE: LatLng[] = [
  [40.47292, -3.61872],
  [40.48168, -3.61875],
  [40.48180, -3.62480],
  [40.48138, -3.62549],
  [40.47700, -3.62557],
  [40.47532, -3.62556],
  [40.47475, -3.62483],
  [40.47386, -3.62473],
  [40.47387, -3.62381],
  [40.47322, -3.62378],
  [40.47266, -3.62191],
  [40.47260, -3.61931],
]

export const ROUTE_CHAMARTIN: LatLng[] = [POS.chamartin, [40.4745, -3.6700], [40.4760, -3.6480], [40.4720, -3.6330], [40.4665, -3.6260], POS.accesoSur]
export const ROUTE_CASTILLA: LatLng[] = [POS.castilla, [40.4690, -3.6760], [40.4745, -3.6560], [40.4735, -3.6400], [40.4690, -3.6290], POS.accesoSur]
export const ROUTE_T4: LatLng[] = [POS.t4, [40.4890, -3.6040], [40.4840, -3.6020], [40.4760, -3.6050], [40.4690, -3.6080], POS.accesoSur]
export const ROUTE_COSLADA: LatLng[] = [POS.coslada, [40.4500, -3.6000], [40.4580, -3.6120], [40.4610, -3.6230], POS.muelleSur]

export const ROUTE_NORTE_FROM_SUR: LatLng[] = [POS.accesoSur, [40.4640, -3.6120], [40.4700, -3.6100], [40.4790, -3.6120], POS.accesoNorte]

export function createInitialState(): CrisisState {
  return {
    simulated: true,
    clock: { simSeconds: T0, speed: 5, paused: false, openingAt: hm(13, 0), lunchAt: hm(13, 30), raceAt: hm(15, 0) },
    planVersion: 1,
    coordinatorStatus: 'replanificando',
    spaces: [
      { id: 'principal', name: 'Pabellón Principal', kind: 'pabellon', zone: 'sur', capacity: 600, status: 'cerrado', note: 'Avería de agua · sin hora de reapertura', pos: POS.principal },
      { id: 'pabellonB', name: 'Pabellón B', kind: 'pabellon', zone: 'sur', capacity: 450, status: 'inactivo', note: 'Disponibilidad anunciada, sin confirmar', pos: POS.pabellonB },
      { id: 'loungeSur', name: 'Lounge Fan Zone Sur', kind: 'lounge', zone: 'sur', capacity: 150, status: 'inactivo', note: 'Visionado en pantalla', pos: POS.loungeSur },
      { id: 'norteC', name: 'Pabellón Norte C', kind: 'pabellon', zone: 'norte', capacity: 600, status: 'inactivo', note: 'Primera apertura posible 13:45', readyAt: hm(13, 45), pos: POS.norteC },
      { id: 'accesoSur', name: 'Acceso Sur', kind: 'acceso', zone: 'sur', status: 'operativo', note: 'Feria de Madrid · 90 invitados esperando', pos: POS.accesoSur },
      { id: 'accesoNorte', name: 'Acceso Norte', kind: 'acceso', zone: 'norte', status: 'operativo', note: 'Valdebebas', pos: POS.accesoNorte },
      { id: 'muelleSur', name: 'Muelle Sur', kind: 'muelle', zone: 'sur', status: 'cerrado', note: 'Asociado al pabellón cerrado', pos: POS.muelleSur },
      { id: 'muelleEste', name: 'Muelle Este Sur', kind: 'muelle', zone: 'sur', status: 'inactivo', note: 'Requiere apertura por recepción', pos: POS.muelleEste },
      { id: 'esperaSur', name: 'Zona de espera Sur', kind: 'espera', zone: 'sur', capacity: 150, status: 'inactivo', pos: POS.esperaSur },
      { id: 'accesoSur2', name: 'Acceso Sur 2 · Puerta 7', kind: 'acceso', zone: 'sur', status: 'operativo', note: 'Alternativa si el Acceso Sur satura', pos: POS.accesoSur2 },
      { id: 'accesoNorte2', name: 'Acceso Norte 2', kind: 'acceso', zone: 'norte', status: 'operativo', note: 'Segunda puerta Norte · pase Norte', pos: POS.accesoNorte2 },
      { id: 'accesoPaddock', name: 'Acceso Paddock', kind: 'acceso', zone: 'norte', status: 'operativo', note: 'Solo pase paddock', pos: POS.accesoPaddock },
      { id: 'paddockNorte', name: 'Paddock Club Norte', kind: 'paddock', zone: 'norte', capacity: 120, status: 'operativo', note: 'Directores de equipo y VIP · no es hospitalidad de invitados', pos: POS.paddockNorte },
      { id: 'parkingNorte', name: 'Parking Norte', kind: 'parking', zone: 'norte', capacity: 400, status: 'operativo', note: 'Taxis y traslados VIP', pos: POS.parkingNorte },
      { id: 'parkingSur', name: 'Parking Sur', kind: 'parking', zone: 'sur', capacity: 900, status: 'operativo', note: 'Taxis e invitados por sus medios', pos: POS.parkingSur },
      { id: 'muelleNorte', name: 'Muelle Norte', kind: 'muelle', zone: 'norte', status: 'inactivo', note: 'Descarga alternativa en Norte · requiere apertura', pos: POS.muelleNorte },
    ],
    commitments: [
      { id: 'c-principal', title: 'Recepción en Pabellón Principal', area: 'espacios', status: 'invalidado', counterpart: 'Recinto', conditions: [], planVersion: 1, note: 'Pabellón cerrado por avería', updatedAt: T0 },
      { id: 'c-entrega1', title: 'Entrega catering 1 · 360 servicios · Muelle Sur', area: 'catering', status: 'invalidado', counterpart: 'Catering', conditions: [], planVersion: 1, note: 'Muelle del pabellón cerrado', updatedAt: T0 },
      { id: 'c-entrega2', title: 'Entrega catering 2 · 240 servicios · Muelle Sur', area: 'catering', status: 'invalidado', counterpart: 'Catering', conditions: [], planVersion: 1, note: 'Muelle del pabellón cerrado', updatedAt: T0 },
      { id: 'c-shuttles', title: 'Llegada de 4 shuttles · Acceso Sur', area: 'transporte', status: 'en_consulta', counterpart: 'Transportes Ibéricos', conditions: ['Confirmar punto de parada compatible'], planVersion: 1, updatedAt: T0 },
    ],
    agents: [
      { id: 'espacios', name: 'Espacios', objective: 'Buscar alternativa en Sur para 600 invitados', status: 'activo' },
      { id: 'catering', name: 'Catering', objective: 'Redirigir 2 entregas fuera del Muelle Sur', status: 'activo' },
      { id: 'transporte', name: 'Transporte', objective: 'Confirmar puntos de llegada de 4 shuttles', status: 'activo' },
      { id: 'asistentes', name: 'Asistentes', objective: 'Retener avisos hasta tener plan confirmado', status: 'esperando' },
    ],
    shuttles: [
      { id: 'BUS-01', name: 'BUS-01', passengers: 45, origin: 'Chamartín', destinationId: 'accesoSur', route: ROUTE_CHAMARTIN, departAt: hm(12, 0), arriveAt: hm(12, 40), delayMin: 0, accepted: false, status: 'en_ruta' },
      { id: 'BUS-02', name: 'BUS-02', passengers: 45, origin: 'Chamartín', destinationId: 'accesoSur', route: ROUTE_CHAMARTIN, departAt: hm(12, 8), arriveAt: hm(12, 50), delayMin: 0, accepted: false, status: 'en_ruta' },
      { id: 'BUS-03', name: 'BUS-03', passengers: 45, origin: 'Plaza de Castilla', destinationId: 'accesoSur', route: ROUTE_CASTILLA, departAt: hm(12, 5), arriveAt: hm(12, 48), delayMin: 0, accepted: false, status: 'en_ruta' },
      { id: 'BUS-04', name: 'BUS-04', passengers: 45, origin: 'Aeropuerto T4', destinationId: 'accesoSur', route: ROUTE_T4, departAt: hm(12, 12), arriveAt: hm(12, 45), delayMin: 0, accepted: false, status: 'en_ruta' },
    ],
    deliveries: [
      { id: 'CAT-01', name: 'CAT-01 · 360 servicios', services: 360, dockId: 'muelleSur', route: ROUTE_COSLADA, departAt: hm(12, 5), arriveAt: hm(12, 40), status: 'programada', note: 'Destino invalidado: Muelle Sur cerrado' },
      { id: 'CAT-02', name: 'CAT-02 · 240 servicios', services: 240, dockId: 'muelleSur', route: ROUTE_COSLADA, departAt: hm(12, 30), arriveAt: hm(13, 5), status: 'programada', note: 'Destino invalidado: Muelle Sur cerrado' },
    ],
    attendanceExpected: 110000,
    gates: [
      { id: 'gate-norte', name: 'Puerta Norte · Valdebebas', zone: 'norte', pos: POS.gateNorte, capacity: 38000, entered: 16800, waiting: 1900, arrivalsPerMin: 520, throughputPerMin: 560, status: 'abierto' },
      { id: 'gate-sur', name: 'Puerta Sur · Feria de Madrid', zone: 'sur', pos: POS.gateSur, capacity: 42000, entered: 19600, waiting: 4300, arrivalsPerMin: 640, throughputPerMin: 480, status: 'saturado' },
      { id: 'gate-este', name: 'Puerta Este · Campo de las Naciones', zone: 'sur', pos: POS.gateEste, capacity: 18000, entered: 7200, waiting: 650, arrivalsPerMin: 230, throughputPerMin: 260, status: 'abierto' },
      { id: 'gate-oeste', name: 'Puerta Oeste · Ribera del Sena', zone: 'sur', pos: POS.gateOeste, capacity: 12000, entered: 4100, waiting: 300, arrivalsPerMin: 150, throughputPerMin: 180, status: 'abierto' },
    ],
    guestGroups: [
      { id: 'g-acceso', name: 'En control de acceso Sur', count: 90, where: 'Acceso Sur', confirmedCount: 0, informedCount: 0, acceptedCount: 0 },
      { id: 'g-shuttles', name: 'En shuttles (4 × 45)', count: 180, where: 'En ruta', confirmedCount: 0, informedCount: 0, acceptedCount: 0 },
      { id: 'g-propios', name: 'Por sus medios', count: 330, where: 'Cercanías / L8 / taxi', confirmedCount: 0, informedCount: 0, acceptedCount: 0, needs: '12 accesibilidad · 38 dieta' },
    ],
    decisions: [],
    calls: [],
    events: [
      { id: 'e0', time: T0, kind: 'incidencia', text: 'Recinto confirma cierre del Pabellón Principal (avería de agua)', area: 'espacios' },
      { id: 'e1', time: T0, kind: 'accion', text: 'Coordinador abre la crisis: 3 compromisos invalidados; llegada de shuttles en consulta' },
    ],
    budget: { contingency: 5000, autonomousLimit: 1500, authorized: 1500, forecast: 0, committed: 0 },
    constraints: ['Norte y Sur sin conexión interior', 'Gasto autónomo ≤ 1.500 €'],
    twistsApplied: [],
    selectedId: 'principal',
    scriptId: 'main',
    scriptCursor: 0,
    nextScriptAt: T0 + 20,
    waitingForDecision: null,
    agentsPaused: false,
    resolved: false,
  }
}
