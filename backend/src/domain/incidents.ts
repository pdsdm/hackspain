import type { CrisisStateDocument } from "./crisis-state.js";

export type IncidentArea = "espacios" | "catering" | "transporte" | "asistentes";

export interface Incident {
  id: string;
  area: IncidentArea;
  text: string;
  apply: (state: CrisisStateDocument) => void;
}

export const LIVE_INTERVAL_SECONDS = 180;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function records(state: CrisisStateDocument, field: string): Array<Record<string, unknown>> {
  const value = state[field];
  return Array.isArray(value) ? value.filter(isRecord) : [];
}

function findById(values: Array<Record<string, unknown>>, id: string) {
  return values.find((value) => value.id === id);
}

function now(state: CrisisStateDocument): number {
  return Number(state.clock.simSeconds);
}

function delayShuttle(state: CrisisStateDocument, id: string, minutes: number, note: string): void {
  const shuttle = findById(records(state, "shuttles"), id);
  if (!shuttle || shuttle.status === "llegado") return;
  shuttle.delayMin = Number(shuttle.delayMin ?? 0) + minutes;
  shuttle.arriveAt = Math.max(Number(shuttle.arriveAt ?? now(state)), now(state)) + minutes * 60;
  shuttle.status = "retrasado";
  shuttle.note = note;
  state.shuttles = records(state, "shuttles");
}

function noteSpace(state: CrisisStateDocument, id: string, patch: Record<string, unknown>): void {
  const space = findById(records(state, "spaces"), id);
  if (!space) return;
  Object.assign(space, patch);
  state.spaces = records(state, "spaces") as CrisisStateDocument["spaces"];
}

function pushGate(state: CrisisStateDocument, id: string, waiting: number, arrivalsPerMin: number): void {
  const gate = findById(records(state, "gates"), id);
  if (!gate) return;
  gate.waiting = Number(gate.waiting ?? 0) + waiting;
  gate.arrivalsPerMin = arrivalsPerMin;
  gate.status = "saturado";
  state.gates = records(state, "gates");
}

function noteDelivery(state: CrisisStateDocument, id: string, patch: Record<string, unknown>): void {
  const delivery = findById(records(state, "deliveries"), id);
  if (!delivery || delivery.status === "entregada") return;
  Object.assign(delivery, patch);
  state.deliveries = records(state, "deliveries");
}

function noteGroup(state: CrisisStateDocument, id: string, needs: string): void {
  const group = findById(records(state, "guestGroups"), id);
  if (!group) return;
  group.needs = needs;
  state.guestGroups = records(state, "guestGroups");
}

export const INCIDENTS: readonly Incident[] = [
  {
    id: "bus03_pinchazo",
    area: "transporte",
    text: "BUS-03 pinchazo en la M-40: 45 invitados llegan 15 minutos tarde",
    apply: (state) => delayShuttle(state, "BUS-03", 15, "Pinchazo en la M-40"),
  },
  {
    id: "bus01_desvio_policia",
    area: "transporte",
    text: "La Policía desvía BUS-01 por el cierre de la A-2: llega 10 minutos tarde y pregunta por dónde entrar",
    apply: (state) => delayShuttle(state, "BUS-01", 10, "Desvío policial por la A-2"),
  },
  {
    id: "bus04_conductor_norte",
    area: "transporte",
    text: "El conductor de BUS-04 dice que va a Norte porque el GPS lo manda al Acceso Norte",
    apply: (state) => {
      const shuttle = findById(records(state, "shuttles"), "BUS-04");
      if (!shuttle || shuttle.status === "llegado") return;
      shuttle.accepted = false;
      shuttle.note = "GPS apunta al Acceso Norte; sin confirmar destino";
      state.shuttles = records(state, "shuttles");
    },
  },
  {
    id: "acceso_sur_pico",
    area: "asistentes",
    text: "Pico de 400 personas en el Acceso Sur: el control tarda 12 minutos",
    apply: (state) => {
      pushGate(state, "gate-sur", 400, 760);
      noteSpace(state, "accesoSur", { note: "Control de acceso saturado · 12 min de espera" });
    },
  },
  {
    id: "acceso_norte_seguridad",
    area: "espacios",
    text: "Seguridad cierra el Acceso Norte 15 minutos por un vehículo de TV mal aparcado",
    apply: (state) => {
      noteSpace(state, "accesoNorte", { status: "cerrado", readyAt: now(state) + 900, note: "Cierre de Seguridad · 15 min" });
      const gate = findById(records(state, "gates"), "gate-norte");
      if (gate) gate.status = "cerrado";
      state.gates = records(state, "gates");
    },
  },
  {
    id: "norte_c_montaje",
    area: "espacios",
    text: "El montaje del Pabellón Norte C se retrasa 20 minutos: falta el equipo de sonido",
    apply: (state) => {
      const space = findById(records(state, "spaces"), "norteC");
      if (!space) return;
      space.readyAt = Number(space.readyAt ?? now(state)) + 1200;
      space.note = "Montaje retrasado 20 min · falta sonido";
      state.spaces = records(state, "spaces") as CrisisStateDocument["spaces"];
    },
  },
  {
    id: "espera_sur_sin_sombra",
    area: "espacios",
    text: "La zona de espera Sur está al sol: el recinto pide no dejar allí a nadie más de 10 minutos",
    apply: (state) => noteSpace(state, "esperaSur", { note: "Sin sombra · máximo 10 min por grupo" }),
  },
  {
    id: "cat02_sin_gluten",
    area: "catering",
    text: "Catering: faltan 60 menús sin gluten en la entrega CAT-02",
    apply: (state) => {
      noteDelivery(state, "CAT-02", { note: "Faltan 60 menús sin gluten" });
      noteGroup(state, "g-propios", "12 accesibilidad · 38 dieta · 60 sin gluten pendientes");
    },
  },
  {
    id: "cat01_frio",
    area: "catering",
    text: "CAT-01 lleva 40 minutos sin cadena de frío: el proveedor pide descargar en cuanto llegue",
    apply: (state) => noteDelivery(state, "CAT-01", { note: "Cadena de frío rota · descargar sin espera" }),
  },
  {
    id: "muelle_este_camion_tv",
    area: "catering",
    text: "Un camión de TV ocupa media entrada del Muelle Este: solo cabe una furgoneta a la vez",
    apply: (state) => noteSpace(state, "muelleEste", { note: "Media entrada ocupada · una furgoneta a la vez" }),
  },
  {
    id: "vip_silla_ruedas",
    area: "asistentes",
    text: "Llega un invitado VIP en silla de ruedas al Acceso Sur y pregunta por el ascensor del pabellón asignado",
    apply: (state) => noteGroup(state, "g-acceso", "1 accesibilidad urgente en Acceso Sur"),
  },
  {
    id: "invitados_lluvia",
    area: "asistentes",
    text: "Empieza a llover: 60 invitados por sus medios piden si pueden entrar antes de la apertura",
    apply: (state) => noteGroup(state, "g-propios", "60 piden entrar antes por lluvia"),
  },
];

function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function incidentSequence(seed: number): string[] {
  const random = mulberry32(seed);
  const ids = INCIDENTS.map((incident) => incident.id);
  for (let index = ids.length - 1; index > 0; index -= 1) {
    const swap = Math.floor(random() * (index + 1));
    [ids[index], ids[swap]] = [ids[swap]!, ids[index]!];
  }
  return ids;
}

export function incidentAt(seed: number, index: number): Incident | undefined {
  const sequence = incidentSequence(seed);
  const id = sequence[index % sequence.length];
  return INCIDENTS.find((incident) => incident.id === id);
}

export function findIncident(id: string): Incident | undefined {
  return INCIDENTS.find((incident) => incident.id === id);
}
