// Build-time only. The API can read the generated JSON without importing frontend code.
import { createInitialState, POS, ROUTE_CASTILLA, ROUTE_CHAMARTIN, ROUTE_COSLADA, ROUTE_NORTE_FROM_SUR, ROUTE_T4, ZONE_NORTE, ZONE_SUR } from '../../frontend/src/domain/initialState.ts';
import type { CrisisState, Commitment, LatLng } from '../../frontend/src/domain/types.ts';

type GuestGroupId = 'g-acceso' | 'g-shuttles' | 'g-propios';
export interface DemoGuest {
  id: string;
  name: string;
  groupId: GuestGroupId;
  shuttleId: string | null;
  location: string;
  passZone: 'sur';
  northAccessConfirmed: false;
  accessibility: 'wheelchair' | 'step_free' | null;
  dietaryRequirement: 'vegetarian' | 'gluten_free' | 'nut_allergy' | null;
  contactRef: string;
}

interface Allocation {
  spaceId: string;
  guestIds: string[];
  status: 'proposed' | 'confirmed';
}

interface Fixture {
  state: CrisisState;
  allocations: Allocation[];
  description: string;
}

const pad = (value: number) => String(value).padStart(3, '0');

export function createGuests(): DemoGuest[] {
  return Array.from({ length: 600 }, (_, index) => {
    const n = index + 1;
    const groupId = n <= 90 ? 'g-acceso' : n <= 270 ? 'g-shuttles' : 'g-propios';
    const shuttleId = groupId === 'g-shuttles' ? `BUS-0${Math.floor((n - 91) / 45) + 1}` : null;
    return {
      id: `guest-${pad(n)}`,
      name: `Invitado de prueba ${pad(n)}`,
      groupId,
      shuttleId,
      location: shuttleId ?? (groupId === 'g-acceso' ? 'accesoSur' : 'external'),
      passZone: 'sur',
      northAccessConfirmed: false,
      // 12 accessibility needs and 38 dietary needs, with four overlapping guests.
      accessibility: n >= 271 && n <= 276 ? 'wheelchair' : n >= 277 && n <= 282 ? 'step_free' : null,
      dietaryRequirement: n >= 279 && n <= 296 ? 'vegetarian'
        : n >= 297 && n <= 308 ? 'gluten_free'
          : n >= 309 && n <= 316 ? 'nut_allergy' : null,
      contactRef: `test-guest-${pad(n)}`,
    };
  });
}

function snapshot(at: number): CrisisState {
  const state = structuredClone(createInitialState());
  // Fixed snapshots are inert: loading one must not resume a scripted negotiation.
  state.clock = { ...state.clock, simSeconds: at, speed: 1, paused: true };
  state.nextScriptAt = null;
  state.scriptCursor = 0;
  return state;
}

function resource(state: CrisisState, id: string) {
  const value = state.spaces.find((s) => s.id === id);
  if (!value) throw new Error(`Unknown resource: ${id}`);
  return value;
}

function agreement(state: CrisisState, id: string) {
  const value = state.commitments.find((c) => c.id === id);
  if (!value) throw new Error(`Unknown commitment: ${id}`);
  return value;
}

function addCommitment(state: CrisisState, value: Omit<Commitment, 'planVersion' | 'updatedAt'>) {
  state.commitments.push({ ...value, planVersion: state.planVersion, updatedAt: state.clock.simSeconds });
}

function applyAllocations(state: CrisisState, guests: DemoGuest[], allocations: Allocation[]) {
  for (const group of state.guestGroups) {
    const members = new Set(guests.filter((g) => g.groupId === group.id).map((g) => g.id));
    const confirmed = allocations.filter((a) => a.status === 'confirmed');
    group.confirmedCount = confirmed.flatMap((a) => a.guestIds).filter((id) => members.has(id)).length;
    const used = allocations.filter((a) => a.guestIds.some((id) => members.has(id)));
    delete group.assignedSpaceId;
    // A group split over B and Lounge has no single resource ID; details live in manifest.json.
    if (used.length === 1) group.assignedSpaceId = used[0]!.spaceId;
  }
}

export function buildMadringFixtures() {
  const guests = createGuests();
  const ids = (from: number, to: number) => guests.slice(from - 1, to).map((g) => g.id);
  const fixtures: Record<string, Fixture> = {};

  const normal = snapshot(44090); // 12:14:50, before closure.
  normal.planVersion = 0;
  normal.coordinatorStatus = 'estable';
  resource(normal, 'principal').status = 'confirmado';
  resource(normal, 'principal').note = 'Reserva original para 600 invitados en Sur';
  resource(normal, 'muelleSur').status = 'operativo';
  resource(normal, 'muelleSur').note = 'Descarga original autorizada';
  for (const c of normal.commitments) {
    c.status = 'confirmado'; c.conditions = []; c.planVersion = 0; c.updatedAt = 44090;
    c.note = 'Acuerdo original de demo';
  }
  for (const a of normal.agents) { a.status = 'estable'; a.objective = 'Vigilar el plan original en Sur'; }
  for (const sh of normal.shuttles) sh.accepted = true;
  for (const d of normal.deliveries) { d.status = 'confirmada'; d.note = 'Muelle Sur confirmado'; }
  for (const g of normal.guestGroups) { g.informedCount = g.count; g.acceptedCount = g.count; }
  normal.events = [{ id: 'normal-plan', time: 44090, kind: 'info', text: 'Plan original confirmado para 600 invitados · datos sintéticos' }];
  fixtures.normal = { state: normal, allocations: [{ spaceId: 'principal', guestIds: ids(1, 600), status: 'confirmed' }], description: 'Plan original a las 12:14:50, antes del incidente.' };

  const crisis = snapshot(44100);
  for (const d of crisis.deliveries) d.status = 'invalidada';
  fixtures.crisis = { state: crisis, allocations: [], description: '12:15: cierre de Principal y Muelle Sur; ninguna ubicación confirmada.' };

  const proposal = structuredClone(crisis);
  proposal.clock.simSeconds = 44280; // 12:18
  proposal.planVersion = 2;
  proposal.coordinatorStatus = 'esperando_decision';
  resource(proposal, 'pabellonB').status = 'pendiente';
  resource(proposal, 'pabellonB').readyAt = 46200;
  resource(proposal, 'pabellonB').note = 'Disponible desde 12:50; reserva pendiente';
  resource(proposal, 'loungeSur').status = 'pendiente';
  resource(proposal, 'loungeSur').readyAt = 47700;
  resource(proposal, 'loungeSur').note = 'Disponible desde 13:15; espera y aprobación pendientes';
  resource(proposal, 'muelleEste').status = 'pendiente';
  proposal.budget.forecast = 3200;
  addCommitment(proposal, { id: 'c-pabB', title: 'Reserva de Pabellón B · 450 plazas', area: 'espacios', counterpart: 'Recinto', status: 'aceptado_condiciones', conditions: ['Confirmación de reserva'] });
  addCommitment(proposal, { id: 'c-lounge', title: 'Reserva de Lounge Sur · 150 plazas', area: 'espacios', counterpart: 'Recinto', status: 'aceptado_condiciones', conditions: ['Montaje 13:15', 'Espera autorizada', 'Apertura escalonada aceptada'] });
  addCommitment(proposal, { id: 'c-muelle', title: 'Habilitar Muelle Este Sur', area: 'espacios', counterpart: 'Recinto + Recepción', status: 'en_consulta', conditions: ['Validar acceso de camión', 'Asignar receptor'] });
  addCommitment(proposal, { id: 'c-espera', title: 'Espera Sur para 150 hasta las 13:15', area: 'asistentes', counterpart: 'Recinto + Recepción', status: 'aceptado_condiciones', conditions: ['Autorizar espera', 'Asignar recepción'] });
  addCommitment(proposal, { id: 'c-accesibilidad', title: 'Acceso adaptado en Pabellón B para 12 invitados', area: 'espacios', counterpart: 'Recinto', status: 'en_consulta', conditions: ['Verificar recorrido sin escalones y acceso para sillas de ruedas'] });
  for (const [index, d] of proposal.deliveries.entries()) {
    d.dockId = 'muelleEste'; d.route[d.route.length - 1] = [...POS.muelleEste];
    d.status = 'programada'; d.note = 'Nueva entrega sujeta a muelle y recepción';
    Object.assign(agreement(proposal, `c-entrega${index + 1}`), {
      title: `${d.id} · ${d.services} servicios → Muelle Este Sur`, status: 'aceptado_condiciones',
      conditions: ['Muelle Este validado', 'Recepción asignada'], note: d.note, planVersion: 2, updatedAt: 44280,
    });
  }
  proposal.decisions = [{
    id: 'd-plan-sur', kind: 'operational', title: 'Aceptar apertura escalonada en Sur', summary: '450 plazas a las 13:00 y 150 a las 13:15 con espera autorizada. Decisión sobre el servicio, no sobre su coste.',
    cost: 3200, conditions: ['Espera para 150', 'Muelle y recepción', 'Reserva de espacios'],
    effectApprove: 'Acepta la apertura escalonada; las reservas y condiciones requieren confirmación.',
    effectReject: 'Evaluar alternativa Norte con permisos, traslado exterior, coste y retraso.', status: 'pendiente', createdAt: 44280,
  }];
  proposal.waitingForDecision = 'd-plan-sur';
  proposal.events.push({ id: 'proposal-condition', time: 44220, kind: 'acuerdo', text: 'Recinto: Lounge solo desde 13:15; aceptación condicionada', area: 'espacios' });
  proposal.events.push({ id: 'proposal-decision', time: 44280, kind: 'decision', text: 'Se consulta apertura escalonada: 150 personas esperan hasta 13:15. Coste informativo 3.200 €; ninguna reserva confirmada todavía' });
  for (const a of proposal.agents) { a.status = 'esperando'; a.objective = 'Esperar aprobación y condiciones de la propuesta Sur'; }
  fixtures.proposal = { state: proposal, allocations: [{ spaceId: 'pabellonB', guestIds: ids(1, 450), status: 'proposed' }, { spaceId: 'loungeSur', guestIds: ids(451, 600), status: 'proposed' }], description: 'Propuesta Sur de 3.200 €; cobertura confirmada cero mientras faltan acuerdos.' };

  const recovered = structuredClone(proposal);
  recovered.clock.simSeconds = 44700; // 12:25, arrivals still in the future.
  recovered.coordinatorStatus = 'estable'; recovered.waitingForDecision = null;
  recovered.decisions[0]!.status = 'aprobada';
  recovered.budget.committed = 3200;
  for (const id of ['pabellonB', 'loungeSur', 'muelleEste', 'esperaSur']) {
    resource(recovered, id).status = 'confirmado';
    resource(recovered, id).note = id === 'loungeSur' ? 'Reserva desde 13:15 con espera confirmada' : 'Acuerdo confirmado en el fixture';
  }
  for (const c of recovered.commitments.filter((c) => c.id !== 'c-principal')) {
    c.status = 'confirmado'; c.conditions = []; c.note = 'Condiciones verificadas en la simulación'; c.planVersion = 2; c.updatedAt = 44700;
  }
  for (const d of recovered.deliveries) { d.status = 'confirmada'; d.note = 'Muelle Este y recepción confirmados; entrega aún en ruta/programada'; }
  for (const sh of recovered.shuttles) sh.accepted = true;
  for (const [index, g] of recovered.guestGroups.entries()) {
    g.informedCount = [90, 150, 240][index]!; g.acceptedCount = [84, 121, 187][index]!;
  }
  for (const a of recovered.agents) { a.status = 'estable'; a.objective = 'Comprobar ejecución de los acuerdos'; }
  recovered.agents.find((a) => a.id === 'asistentes')!.objective = 'Contactar a 120 invitados sin evidencia de recepción';
  recovered.events.push({ id: 'recovered-plan', time: 44700, kind: 'acuerdo', text: '600 plazas confirmadas en Sur; 480 avisos recibidos; 120 pendientes' });
  fixtures.recovered = { state: recovered, allocations: [{ spaceId: 'pabellonB', guestIds: ids(1, 450), status: 'confirmed' }, { spaceId: 'loungeSur', guestIds: ids(451, 600), status: 'confirmed' }], description: 'Plan Sur confirmado. Espacios reservados, no necesariamente abiertos. Entregas todavía no realizadas.' };

  for (const twist of ['lounge_unavailable', 'pabellon_b_400'] as const) {
    const state = structuredClone(recovered);
    state.clock.simSeconds = 44760; state.planVersion = 3; state.resolved = false;
    state.coordinatorStatus = 'replanificando'; state.twistsApplied = [twist];
    for (const g of state.guestGroups) { g.informedCount = 0; g.acceptedCount = 0; }
    state.agents.find((a) => a.id === 'espacios')!.status = 'incidencia';
    state.agents.find((a) => a.id === 'asistentes')!.status = 'activo';
    state.agents.find((a) => a.id === 'asistentes')!.objective = 'Preparar instrucciones de la nueva versión; avisos anteriores obsoletos';
    const lost = twist === 'lounge_unavailable' ? 'loungeSur' : 'pabellonB';
    const commitment = agreement(state, twist === 'lounge_unavailable' ? 'c-lounge' : 'c-pabB');
    commitment.status = 'invalidado'; commitment.note = 'El nuevo aforo/disponibilidad invalida el acuerdo anterior'; commitment.updatedAt = 44760;
    let allocations: Allocation[];
    if (twist === 'lounge_unavailable') {
      resource(state, lost).status = 'descartado'; resource(state, lost).note = 'Recinto retira disponibilidad';
      resource(state, 'esperaSur').status = 'pendiente';
      agreement(state, 'c-espera').status = 'invalidado';
      agreement(state, 'c-espera').note = 'La espera hasta 13:15 ya no desemboca en un espacio confirmado';
      agreement(state, 'c-espera').updatedAt = 44760;
      resource(state, 'norteC').status = 'propuesto';
      addCommitment(state, { id: 'c-norte150', title: 'Explorar Norte C para 150 invitados', area: 'espacios', counterpart: 'Recinto + Transporte', status: 'propuesto', conditions: ['Permisos de acceso Norte', 'Transporte exterior con plazas y horario', 'Aceptación de retraso 13:45', 'Coste y disponibilidad'] });
      allocations = [{ spaceId: 'pabellonB', guestIds: ids(1, 450), status: 'confirmed' }];
    } else {
      resource(state, lost).capacity = 400; resource(state, lost).note = 'Aforo revisado a 400; las otras 50 personas quedan pendientes';
      addCommitment(state, { id: 'c-pabB400', title: 'Reserva revisada de Pabellón B · 400 plazas', area: 'espacios', counterpart: 'Recinto', status: 'confirmado', conditions: [] });
      addCommitment(state, { id: 'c-pendientes50', title: 'Buscar ubicación para 50 invitados', area: 'espacios', counterpart: 'Recinto', status: 'propuesto', conditions: ['Espacio y acceso compatibles sin exceder aforo'] });
      allocations = [{ spaceId: 'pabellonB', guestIds: ids(1, 400), status: 'confirmed' }, { spaceId: 'loungeSur', guestIds: ids(451, 600), status: 'confirmed' }];
    }
    // The old catering distribution no longer covers the full group: keep quantity, reopen agreement.
    for (const [index, d] of state.deliveries.entries()) {
      d.status = 'programada'; d.note = 'Redistribución pendiente tras cambio de espacio';
      Object.assign(agreement(state, `c-entrega${index + 1}`), { status: 'aceptado_condiciones', conditions: ['Confirmar distribución para invitados sin espacio'], planVersion: 3, updatedAt: 44760, note: d.note });
    }
    state.agents.find((a) => a.id === 'catering')!.status = 'esperando';
    const missing = twist === 'lounge_unavailable' ? 150 : 50;
    state.events.push({ id: `twist-${twist}`, time: 44760, kind: 'incidencia', text: `Cambio de recinto: ${missing} invitados sin ubicación; revisar acuerdos y avisos`, area: 'espacios' });
    // Previously committed money is not magically refunded by an incident.
    fixtures[twist] = { state, allocations, description: `Giro con ${600 - missing} ubicaciones confirmadas y ${missing} pendientes. Gasto previo conservado.` };
  }

  const calm = structuredClone(fixtures.normal!.state);
  calm.clock = { ...calm.clock, simSeconds: 43200, speed: 1, paused: true };
  calm.coordinatorStatus = 'estable';
  calm.planVersion = 1;
  for (const commitment of calm.commitments) {
    commitment.updatedAt = Math.min(commitment.updatedAt, 43200);
  }
  calm.events = [];
  fixtures.calm = {
    state: calm,
    allocations: structuredClone(fixtures.normal!.allocations),
    description: '12:00: mapa operativo inicial pausado, sin historial de la ejecución.',
  };

  for (const fixture of Object.values(fixtures)) applyAllocations(fixture.state, guests, fixture.allocations);
  const base = structuredClone(createInitialState());
  const seed = {
    schemaVersion: 1,
    scenarioId: 'madring-hospitality',
    synthetic: true,
    timeUnit: 'seconds_since_midnight',
    moneyUnit: 'EUR',
    timezone: 'Europe/Madrid',
    assumptions: [
      'Escenario ficticio: horarios y coordenadas no acreditan accesos, aforos ni rutas reales del GP.',
      'Todos los invitados tienen pase Sur. Norte requiere permiso explícito además de transporte exterior.',
      'No existe cruce interior Norte/Sur. Las rutas del mapa son esquemáticas, no instrucciones de conducción.',
      'Traslado exterior propuesto: 15 minutos de trayecto más 10 de embarque y 5 de desembarque; duración sin tráfico real.',
      'Los cuatro shuttles comienzan ocupados por 45 invitados cada uno; no son capacidad libre de traslado.',
      '12 necesidades de accesibilidad y 38 alimentarias en el grupo por libre; cuatro invitados pertenecen a ambos conjuntos.',
      'Los snapshots son casos estáticos de prueba, no acciones reales ni decisiones del agente en producción.',
    ],
    schedule: { incidentAt: 44100, openingAt: 46800, lunchAt: 48600, raceAt: 54000 },
    budget: { contingency: 5000, autonomousLimit: 1500, proposedSurBreakdown: { pabellonB: 1500, loungeSur: 900, catering: 400, audiovisual: 400 } },
    guests,
    resources: base.spaces.map((s) => ({
      id: s.id, name: s.name, kind: s.kind, zone: s.zone, capacity: s.capacity ?? null, pos: s.pos,
      availableFrom: s.id === 'pabellonB' ? 46200 : s.id === 'loungeSur' ? 47700 : s.id === 'norteC' ? 49500 : null,
      initialAccessibilityConfirmed: s.id === 'principal',
      contactRef: 'test-venue-manager',
    })),
    shuttles: base.shuttles.map((s) => ({ id: s.id, capacity: 45, occupiedSeats: s.passengers, guestIds: guests.filter((g) => g.shuttleId === s.id).map((g) => g.id), contactRef: 'test-transport-manager' })),
    deliveries: base.deliveries.map((d) => ({ id: d.id, services: d.services, departAt: d.departAt, arriveAt: d.arriveAt, originalDockId: 'muelleSur', contactRef: 'test-catering-manager' })),
    vehicles: (base.vehicles ?? []).map((v) => ({ id: v.id, kind: v.kind, who: v.who, count: v.count, from: v.from, destinationId: v.destinationId, departAt: v.departAt, arriveAt: v.arriveAt, contactRef: v.kind === 'taxi' ? 'test-taxi-dispatch' : v.kind === 'vip' ? 'test-vip-transport' : 'test-courier' })),
    receptionStaff: Array.from({ length: 6 }, (_, i) => ({ id: `staff-${i + 1}`, zone: 'sur', assignedTask: null })),
    transfers: [{ id: 'sur-norte-external', from: 'accesoSur', to: 'accesoNorte', via: 'external', route: ROUTE_NORTE_FROM_SUR, driveMinutes: 15, boardingMinutes: 10, alightingMinutes: 5, status: 'unconfirmed', confirmedTrips: [], requiresNorthAccess: true }],
    contacts: ['venue-manager', 'catering-manager', 'transport-manager', 'reception-manager', 'organizer', 'taxi-dispatch', 'vip-transport', 'courier'].map((role) => ({ id: `test-${role}`, role, phone: null, email: null })),
  };
  const world = buildWorld(seed);
  const manifest = {
    schemaVersion: 1,
    scenarioId: seed.scenarioId,
    synthetic: true,
    fixtures: Object.fromEntries(Object.entries(fixtures).map(([name, f]) => [name, {
      file: `states/${name}.json`, description: f.description, planVersion: f.state.planVersion,
      allocations: f.allocations,
      accessibilityVerifiedSpaceIds: name === 'normal' || name === 'calm' ? ['principal']
        : f.state.commitments.some((c) => c.id === 'c-accesibilidad' && c.status === 'confirmado') ? ['pabellonB'] : [],
      confirmedGuests: f.allocations.filter((a) => a.status === 'confirmed').reduce((sum, a) => sum + a.guestIds.length, 0),
      unassignedGuestIds: guests.filter((g) => !f.allocations.some((a) => a.status === 'confirmed' && a.guestIds.includes(g.id))).map((g) => g.id),
    }])),
  };
  return { seed, manifest, fixtures, world };
}

type SeedResource = {
  id: string;
  name: string;
  kind: string;
  zone: 'norte' | 'sur';
  capacity: number | null;
  pos: LatLng;
  contactRef: string;
};

type SeedShape = {
  resources: SeedResource[];
  transfers: Array<{ from: string; to: string; route: LatLng[]; driveMinutes: number; requiresNorthAccess: boolean }>;
};

function replaceEnd(route: LatLng[], pos: LatLng): LatLng[] {
  return [...route.slice(0, -1), pos];
}

function buildWorld(seed: SeedShape) {
  const gates = createInitialState().gates;
  const places = [
    ...seed.resources.map((resource) => ({
      id: resource.id,
      name: resource.name,
      kind: resource.kind,
      zone: resource.zone as 'norte' | 'sur' | null,
      pos: resource.pos,
      ...(resource.capacity ? { capacity: resource.capacity } : {}),
      ...(resource.id === 'accesoSur' ? { serves: ['principal', 'pabellonB', 'loungeSur', 'esperaSur'] } : {}),
      ...(resource.id === 'accesoNorte' ? { serves: ['norteC'] } : {}),
      ...(resource.id === 'muelleSur' ? { serves: ['principal'] } : {}),
      ...(resource.id === 'muelleEste' ? { serves: ['pabellonB', 'loungeSur'] } : {}),
      ...(resource.id === 'accesoSur2' ? { serves: ['pabellonB', 'loungeSur', 'esperaSur'] } : {}),
      ...(resource.id === 'accesoNorte2' ? { serves: ['norteC'] } : {}),
      ...(resource.id === 'accesoPaddock' ? { serves: ['paddockNorte'] } : {}),
      ...(resource.id === 'muelleNorte' ? { serves: ['norteC', 'paddockNorte'] } : {}),
      contactRef: resource.contactRef,
    })),
    ...gates.map((gate) => ({
      id: gate.id,
      name: gate.name,
      kind: 'puerta' as const,
      zone: gate.zone as 'norte' | 'sur' | null,
      pos: gate.pos,
      capacity: gate.capacity,
    })),
    { id: 'chamartin', name: 'Chamartín', kind: 'parada' as const, zone: null, pos: POS.chamartin },
    { id: 'castilla', name: 'Plaza de Castilla', kind: 'parada' as const, zone: null, pos: POS.castilla },
    { id: 't4', name: 'Aeropuerto T4', kind: 'parada' as const, zone: null, pos: POS.t4 },
    { id: 'coslada', name: 'Coslada', kind: 'parada' as const, zone: null, pos: POS.coslada },
  ];

  const links: Array<{
    from: string;
    to: string;
    kind: 'road' | 'external_transfer';
    route: LatLng[];
    minutes: number;
    requiresNorthAccess?: boolean;
  }> = [
    { from: 'chamartin', to: 'accesoSur', kind: 'road', route: ROUTE_CHAMARTIN, minutes: 40 },
    { from: 'chamartin', to: 'esperaSur', kind: 'road', route: replaceEnd(ROUTE_CHAMARTIN, POS.esperaSur), minutes: 43 },
    { from: 'castilla', to: 'accesoSur', kind: 'road', route: ROUTE_CASTILLA, minutes: 43 },
    { from: 'castilla', to: 'esperaSur', kind: 'road', route: replaceEnd(ROUTE_CASTILLA, POS.esperaSur), minutes: 46 },
    { from: 't4', to: 'accesoSur', kind: 'road', route: ROUTE_T4, minutes: 33 },
    { from: 't4', to: 'esperaSur', kind: 'road', route: replaceEnd(ROUTE_T4, POS.esperaSur), minutes: 36 },
    { from: 'coslada', to: 'muelleSur', kind: 'road', route: ROUTE_COSLADA, minutes: 35 },
    { from: 'coslada', to: 'muelleEste', kind: 'road', route: replaceEnd(ROUTE_COSLADA, POS.muelleEste), minutes: 38 },
    { from: 'coslada', to: 'muelleNorte', kind: 'road', route: [POS.coslada, [40.4500, -3.6000], [40.4700, -3.6060], [40.4790, -3.6110], POS.muelleNorte], minutes: 44 },
    { from: 'parkingSur', to: 'accesoSur', kind: 'road', route: [POS.parkingSur, POS.accesoSur], minutes: 3 },
    { from: 'parkingSur', to: 'accesoSur2', kind: 'road', route: [POS.parkingSur, POS.accesoSur2], minutes: 4 },
    { from: 'parkingNorte', to: 'accesoNorte', kind: 'road', route: [POS.parkingNorte, POS.accesoNorte], minutes: 3 },
    { from: 'parkingNorte', to: 'accesoPaddock', kind: 'road', route: [POS.parkingNorte, POS.accesoPaddock], minutes: 4 },
    { from: 't4', to: 'parkingNorte', kind: 'road', route: [POS.t4, [40.4890, -3.6040], [40.4850, -3.6150], POS.parkingNorte], minutes: 28 },
    {
      from: 'accesoSur',
      to: 'accesoNorte',
      kind: 'external_transfer',
      route: ROUTE_NORTE_FROM_SUR,
      minutes: seed.transfers[0]?.driveMinutes ?? 15,
      requiresNorthAccess: true,
    },
  ];

  return {
    schemaVersion: 1,
    scenarioId: 'madring-hospitality',
    places,
    links,
    zones: { sur: ZONE_SUR, norte: ZONE_NORTE },
  };
}
