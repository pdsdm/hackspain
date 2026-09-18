// Estado inicial del escenario MADRING a las 12:15, para probar el coordinador sin backend.
// Réplica de frontend/src/domain/initialState.ts reducida a lo que el coordinador necesita leer.

import type { CoordinatorInput } from "./types.js";

export function hm(hours: number, minutes: number): number {
  return hours * 3600 + minutes * 60;
}

export function initialCrisisInput(): CoordinatorInput {
  return {
    clock: {
      simSeconds: hm(12, 15),
      openingAt: hm(13, 0),
      lunchAt: hm(13, 30),
      raceAt: hm(15, 0),
    },
    planVersion: 1,
    spaces: [
      {
        id: "principal",
        name: "Pabellón Principal",
        zone: "sur",
        capacity: 600,
        status: "cerrado",
        note: "Avería de agua · sin hora de reapertura",
      },
      {
        id: "pabellonB",
        name: "Pabellón B",
        zone: "sur",
        capacity: 450,
        status: "inactivo",
        note: "Disponibilidad anunciada, sin confirmar",
      },
      {
        id: "loungeSur",
        name: "Lounge Fan Zone Sur",
        zone: "sur",
        capacity: 150,
        status: "inactivo",
        note: "Visionado en pantalla",
      },
      {
        id: "norteC",
        name: "Pabellón Norte C",
        zone: "norte",
        capacity: 600,
        status: "inactivo",
        readyAt: hm(13, 45),
        note: "Primera apertura posible 13:45",
      },
      {
        id: "accesoSur",
        name: "Acceso Sur",
        zone: "sur",
        status: "operativo",
        note: "Feria de Madrid · 90 invitados esperando",
      },
      { id: "accesoNorte", name: "Acceso Norte", zone: "norte", status: "operativo", note: "Valdebebas" },
      {
        id: "muelleSur",
        name: "Muelle Sur",
        zone: "sur",
        status: "cerrado",
        note: "Asociado al pabellón cerrado",
      },
      {
        id: "muelleEste",
        name: "Muelle Este Sur",
        zone: "sur",
        status: "inactivo",
        note: "Requiere apertura por recepción",
      },
      { id: "esperaSur", name: "Zona de espera Sur", zone: "sur", capacity: 150, status: "inactivo" },
    ],
    guestGroups: [
      { id: "g-acceso", name: "En control de acceso Sur", count: 90, where: "Acceso Sur" },
      { id: "g-shuttles", name: "En shuttles (4 × 45)", count: 180, where: "En ruta" },
      {
        id: "g-propios",
        name: "Por sus medios",
        count: 330,
        where: "Cercanías / L8 / taxi",
        needs: "12 accesibilidad · 38 dieta",
      },
    ],
    commitments: [
      {
        id: "c-principal",
        title: "Recepción en Pabellón Principal",
        area: "espacios",
        status: "invalidado",
        counterpart: "Recinto",
        conditions: [],
      },
      {
        id: "c-entrega1",
        title: "Entrega catering 1 · 360 servicios · Muelle Sur",
        area: "catering",
        status: "invalidado",
        counterpart: "Catering",
        conditions: [],
      },
      {
        id: "c-entrega2",
        title: "Entrega catering 2 · 240 servicios · Muelle Sur",
        area: "catering",
        status: "invalidado",
        counterpart: "Catering",
        conditions: [],
      },
      {
        id: "c-shuttles",
        title: "Llegada de 4 shuttles · Acceso Sur",
        area: "transporte",
        status: "en_consulta",
        counterpart: "Transportes Ibéricos",
        conditions: ["Confirmar punto de parada compatible"],
      },
    ],
    budget: { contingency: 5000, autonomousLimit: 1500, authorized: 1500, forecast: 0, committed: 0 },
    constraints: ["Norte y Sur sin conexión interior", "Gasto autónomo ≤ 1.500 €"],
  };
}
