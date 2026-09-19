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
  chamartin: [40.4728, -3.6826] as LatLng,
  castilla: [40.4666, -3.6892] as LatLng,
  t4: [40.4919, -3.5928] as LatLng,
  coslada: [40.4405, -3.5850] as LatLng,
}

export const ZONE_SUR: LatLng[] = [
  [40.46350, -3.62026],
  [40.46353, -3.62045],
  [40.46358, -3.62071],
  [40.46367, -3.62101],
  [40.46374, -3.62124],
  [40.46389, -3.62157],
  [40.46793, -3.62500],
  [40.46831, -3.62521],
  [40.46870, -3.62536],
  [40.46915, -3.62550],
  [40.46949, -3.62556],
  [40.47220, -3.62492],
  [40.47246, -3.61788],
  [40.47207, -3.61535],
  [40.47203, -3.61517],
  [40.47198, -3.61498],
  [40.47192, -3.61485],
  [40.47186, -3.61475],
  [40.47178, -3.61465],
  [40.47172, -3.61459],
  [40.47165, -3.61452],
  [40.47157, -3.61445],
  [40.47148, -3.61439],
  [40.47126, -3.61425],
  [40.46412, -3.61862],
  [40.46358, -3.61934],
  [40.46355, -3.61939],
  [40.46352, -3.61950],
]
export const ZONE_NORTE: LatLng[] = [
  [40.47123, -3.62403],
  [40.47258, -3.62494],
  [40.47392, -3.62563],
  [40.47395, -3.62564],
  [40.47675, -3.62600],
  [40.48049, -3.62550],
  [40.48069, -3.62538],
  [40.48087, -3.62523],
  [40.48103, -3.62505],
  [40.48114, -3.62487],
  [40.48126, -3.62463],
  [40.48135, -3.62436],
  [40.48141, -3.62404],
  [40.48144, -3.62369],
  [40.48144, -3.62335],
  [40.48139, -3.62304],
  [40.48132, -3.62274],
  [40.48121, -3.62244],
  [40.48108, -3.62219],
  [40.48089, -3.62192],
  [40.48074, -3.62175],
  [40.48056, -3.62158],
  [40.47194, -3.61834],
]

const routeChamartin: LatLng[] = [POS.chamartin, [40.4745, -3.6700], [40.4760, -3.6480], [40.4720, -3.6330], [40.4665, -3.6260], POS.accesoSur]
const routeCastilla: LatLng[] = [POS.castilla, [40.4690, -3.6760], [40.4745, -3.6560], [40.4735, -3.6400], [40.4690, -3.6290], POS.accesoSur]
const routeT4: LatLng[] = [POS.t4, [40.4890, -3.6040], [40.4840, -3.6020], [40.4760, -3.6050], [40.4690, -3.6080], POS.accesoSur]
const routeCoslada: LatLng[] = [POS.coslada, [40.4500, -3.6000], [40.4580, -3.6120], [40.4610, -3.6230], POS.muelleSur]

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
      { id: 'BUS-01', name: 'BUS-01', passengers: 45, origin: 'Chamartín', destinationId: 'accesoSur', route: routeChamartin, departAt: hm(12, 0), arriveAt: hm(12, 40), delayMin: 0, accepted: false, status: 'en_ruta' },
      { id: 'BUS-02', name: 'BUS-02', passengers: 45, origin: 'Chamartín', destinationId: 'accesoSur', route: routeChamartin, departAt: hm(12, 8), arriveAt: hm(12, 50), delayMin: 0, accepted: false, status: 'en_ruta' },
      { id: 'BUS-03', name: 'BUS-03', passengers: 45, origin: 'Plaza de Castilla', destinationId: 'accesoSur', route: routeCastilla, departAt: hm(12, 5), arriveAt: hm(12, 48), delayMin: 0, accepted: false, status: 'en_ruta' },
      { id: 'BUS-04', name: 'BUS-04', passengers: 45, origin: 'Aeropuerto T4', destinationId: 'accesoSur', route: routeT4, departAt: hm(12, 12), arriveAt: hm(12, 45), delayMin: 0, accepted: false, status: 'en_ruta' },
    ],
    deliveries: [
      { id: 'CAT-01', name: 'CAT-01 · 360 servicios', services: 360, dockId: 'muelleSur', route: routeCoslada, departAt: hm(12, 5), arriveAt: hm(12, 40), status: 'programada', note: 'Destino invalidado: Muelle Sur cerrado' },
      { id: 'CAT-02', name: 'CAT-02 · 240 servicios', services: 240, dockId: 'muelleSur', route: routeCoslada, departAt: hm(12, 30), arriveAt: hm(13, 5), status: 'programada', note: 'Destino invalidado: Muelle Sur cerrado' },
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
