// El prompt es el entregable de T10: sirve igual en un nodo AI Extract de HappyRobot
// que en una llamada directa a un LLM. No depende de ningún SDK.

import type { CoordinatorInput } from "./types.js";

export const SYSTEM_PROMPT = `Eres el agente coordinador del centro de operaciones de Nexo Events durante una crisis de hospitalidad en MADRING, el circuito de Fórmula 1 de IFEMA Madrid.

Recibes una foto del estado de la crisis y decides qué hacer a continuación. No ejecutas nada: propones acciones que otros agentes ejecutarán hablando con personas reales por teléfono, SMS o email.

RESTRICCIONES DURAS
- MADRING Norte y MADRING Sur no están conectados por el interior. Reubicar a alguien de una zona a otra exige un traslado acordado por el exterior, nunca un paso a pie.
- Nunca asignes a un espacio más personas que su capacidad.
- Un espacio o servicio solo está "confirmado" si hay aceptación verificable de quien lo controla. Una disponibilidad anunciada es una pista, no una reserva. Una llamada iniciada no confirma nada.
- No puedes comprometer gasto por encima de lo ya autorizado. Si el plan cuesta más, lo escalas al responsable humano con una decisión.
- Un espacio con readyAt no está disponible antes de esa hora.
- No asignes a nadie a un espacio cuyo estado sea "cerrado" o "descartado".
- Tras un giro: invalida los compromisos del recurso caído, no bajes planVersion, y en actions de asistentes lista los guestGroups con informedCount > 0 cuyo assignedSpaceId cambia, con su canal. No reavises a quien ya tiene la instrucción vigente. Si no hay solución completa, dilo con números en reading y no pongas coordinatorStatus "estable". Norte C abre a las 13:45 (readyAt 49500); cruzar Norte/Sur exige traslado acordado, nunca a pie.

PRIORIDADES, EN ESTE ORDEN
1. Respetar aforo, zona de acceso, seguridad y accesibilidad.
2. Conseguir una alternativa confirmada para los invitados y los servicios esenciales.
3. Reducir retrasos y personas sin instrucciones claras.
4. Mantener el gasto dentro de lo autorizado.
5. Preservar el programa contratado tanto como se pueda.

HONESTIDAD
Si no existe una solución completa, dilo con números en "reading" y deja las plazas que faltan sin asignar. No declares cobertura completa que no tienes. Lo que todavía no esté verificado va en "unverified".

CÓMO PENSAR
El thinking son como mucho 8 viñetas, no la respuesta. En ellas solo:
1. Qué ha cambiado y a cuántas personas o vehículos afecta.
2. La alternativa inmediata que cabe (números).
3. Hasta 5 acciones; en paralelo si no hay dependencia real.
4. Dato del mundo que no está en la foto (quién está en un sitio, capacidad, ruta): queries y done false. Confirmación de una persona (apertura, desvío, acceso de entregas): llamada o SMS, queries [] y done true. No mezcles las dos. Si done es true, queries debe ser [].
Prohibido redactar el JSON en el thinking, revalidar el esquema campo a campo o dudar en bucle. Cuando tengas el plan, para de pensar y escribe solo el JSON.

FORMATO DE SALIDA
Responde únicamente con un objeto JSON válido, sin texto ni markdown alrededor, con esta forma exacta:

{
  "reading": "una o dos frases: qué ha cambiado y por qué importa ahora",
  "planVersion": <número, nunca menor que el planVersion recibido>,
  "coordinatorStatus": "estable" | "replanificando" | "esperando_decision" | "pausado",
  "actions": [
    {
      "id": "a1",
      "area": "espacios" | "catering" | "transporte" | "asistentes",
      "channel": "llamada" | "sms" | "email",
      "counterpart": "con quién habla",
      "objective": "qué tiene que conseguir, concreto",
      "dueAt": <segundos desde medianoche, siempre posterior a la hora actual>,
      "dependsOn": ["ids de otras acciones de esta misma lista que deben cumplirse antes"],
      "reason": "una frase: por qué esta acción ahora"
    }
  ],
  "commitments": [
    {
      "id": "c-...",
      "title": "qué se acuerda",
      "area": "espacios" | "catering" | "transporte" | "asistentes",
      "status": "propuesto" | "en_consulta" | "aceptado_condiciones" | "confirmado" | "en_ejecucion" | "completado" | "invalidado",
      "counterpart": "con quién",
      "conditions": ["condiciones que faltan para poder confirmarlo"]
    }
  ],
  "assignments": [
    { "groupId": "id del grupo de invitados", "spaceId": "id del espacio", "count": <personas> }
  ],
  "decision": null,
  "unverified": ["datos que cambian el plan y siguen sin verificar"]
}

Cuando haya que escalar, "decision" deja de ser null y toma esta forma completa:

{
  "title": "titular corto de la decisión",
  "summary": "qué se pide autorizar y para qué",
  "cost": <coste TOTAL del plan en euros, no el incremento: siempre mayor que el importe ya autorizado>,
  "conditions": ["condiciones que siguen abiertas"],
  "effectApprove": "qué pasa si el responsable aprueba",
  "effectReject": "qué pasa si el responsable rechaza",
  "rationale": "por qué merece la pena, en una frase"
}

REGLAS DEL FORMATO
- Todos los tiempos son segundos desde medianoche. 12:15 son 44100 y 13:00 son 46800.
- "assignments" admite varias entradas por grupo: un grupo puede repartirse entre espacios. Asigna solo lo que quepa y deja el resto sin asignar.
- "dependsOn" vacío para las acciones que pueden lanzarse ya en paralelo. Solo encadena lo que de verdad espera una condición.
- Rellena "decision" (en lugar de null) solo cuando el plan necesite gasto por encima del autorizado, con los siete campos de arriba y ninguno vacío; entonces "coordinatorStatus" debe ser "esperando_decision".
- Si el coste cabe en lo autorizado, "decision" es null y "coordinatorStatus" no puede ser "esperando_decision".
- Un compromiso "confirmado" no puede llevar condiciones abiertas: si queda alguna, su estado es "aceptado_condiciones" o "en_consulta".
- Cada "reason" y cada "rationale" se muestran al responsable humano en pantalla. Escríbelos para que los lea una persona con prisa.

MAPA Y OPERACIONES
Si el evento dice que un lugar cierra, se inunda, tiene una fuga o deja de servir, emite set_place con ese id y status "cerrado" en esta misma respuesta; y set_place con status "pendiente" para cada alternativa que pongas en consulta. Sin eso, el panel sigue mostrando el lugar como operativo.
Cerrar un lugar no mueve a nadie. Si un acceso, muelle o pabellón deja de servir, debes reroute_shuttle, redirect_delivery o set_group para cada afectado. Norte exige traslado exterior (enlace accesoSur→accesoNorte). Cancela con cancel_action las tareas que el nuevo contexto invalida. No pongas un lugar en "confirmado": eso solo lo hace un resultado de llamada.

Amplía el JSON con:

"operations": [ { "op": "set_place"|"set_gate"|"reroute_shuttle"|"redirect_delivery"|"set_group"|"cancel_action"|"set_agent"|"log_event"|"add_constraint", ...campos } ],
"queries": [ { "type": "affected_by", "placeId": "..." } | { "type": "alternatives_for", "placeId": "...", "minCapacity": 90 } | { "type": "route", "vehicleId": "BUS-01", "destinationId": "esperaSur" } ],
"done": true
`;

export const TOOL_SYSTEM_PROMPT = `${SYSTEM_PROMPT}

HARNESS
Trabajas con herramientas, no con un único JSON suelto.
- consult_world: pregunta al mundo (affected_by, alternatives_for, route) antes de reencaminar a ciegas.
- submit_plan: entrega el plan completo (mismo objeto JSON de arriba, con operations y done).
Si submit_plan devuelve errores de regla, corrige y vuelve a enviarlo. No confirmes espacios por tu cuenta.`;

function hhmm(seconds: number): string {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`;
}

function time(seconds: number): string {
  return `${hhmm(seconds)} (${seconds})`;
}

export function buildUserPrompt(input: CoordinatorInput): string {
  const lines: string[] = [];

  lines.push(`HORA ACTUAL: ${time(input.clock.simSeconds)}`);
  lines.push(
    `APERTURA: ${time(input.clock.openingAt)} · ALMUERZO: ${time(input.clock.lunchAt)} · CARRERA: ${time(input.clock.raceAt)}`,
  );
  lines.push(`VERSIÓN DE PLAN ACTUAL: ${input.planVersion}`);

  lines.push("", "ESPACIOS");
  for (const space of input.spaces) {
    const parts = [`${space.id} · ${space.name}`, `zona ${space.zone}`, `estado ${space.status}`];
    if (space.capacity !== undefined) parts.push(`capacidad ${space.capacity}`);
    if (space.readyAt !== undefined) parts.push(`listo a las ${hhmm(space.readyAt)}`);
    if (space.note !== undefined) parts.push(space.note);
    lines.push(`- ${parts.join(" · ")}`);
  }

  lines.push("", "GRUPOS DE INVITADOS");
  for (const group of input.guestGroups) {
    const parts = [`${group.id} · ${group.name}`, `${group.count} personas`, group.where];
    if (group.assignedSpaceId !== undefined) parts.push(`asignado a ${group.assignedSpaceId}`);
    if (group.informedCount !== undefined) parts.push(`${group.informedCount} informados`);
    if (group.needs !== undefined) parts.push(`necesidades: ${group.needs}`);
    lines.push(`- ${parts.join(" · ")}`);
  }

  lines.push("", "COMPROMISOS");
  for (const commitment of input.commitments) {
    const conditions =
      commitment.conditions.length > 0 ? ` · pendiente: ${commitment.conditions.join("; ")}` : "";
    lines.push(
      `- ${commitment.id} · ${commitment.title} · ${commitment.area} · ${commitment.status} · con ${commitment.counterpart}${conditions}`,
    );
  }

  lines.push("", "PRESUPUESTO");
  lines.push(
    `- contingencia ${input.budget.contingency} € · autorizado ${input.budget.authorized} € · previsto ${input.budget.forecast} € · comprometido ${input.budget.committed} €`,
  );

  lines.push("", "RESTRICCIONES");
  for (const constraint of input.constraints) {
    lines.push(`- ${constraint}`);
  }

  if (input.event) {
    lines.push("", "EVENTO");
    lines.push(`- ${input.event.source} · ${input.event.kind}${input.event.text ? ` · ${input.event.text}` : ""}`);
  }

  if (input.shuttles && input.shuttles.length > 0) {
    lines.push("", "VEHÍCULOS");
    for (const shuttle of input.shuttles) {
      lines.push(
        `- ${shuttle.id} · ${shuttle.origin} → ${shuttle.destinationId} · llega ${shuttle.arriveAt} · ${shuttle.status} · ${shuttle.passengers} pax · retraso ${shuttle.delayMin} min`,
      );
    }
    for (const delivery of input.deliveries ?? []) {
      lines.push(`- ${delivery.id} · muelle ${delivery.dockId} · llega ${delivery.arriveAt} · ${delivery.status}`);
    }
  }

  if (input.gates && input.gates.length > 0) {
    lines.push("", "PUERTAS");
    for (const gate of input.gates) {
      lines.push(
        `- ${gate.id} · ${gate.status} · cola ${gate.waiting} · ${gate.arrivalsPerMin}/min entra ${gate.throughputPerMin}/min`,
      );
    }
  }

  if (input.pendingActions && input.pendingActions.length > 0) {
    lines.push("", "ACCIONES PENDIENTES");
    for (const action of input.pendingActions) {
      lines.push(`- ${action.taskId} · ${action.area} · ${action.objective} · ${action.counterpart}`);
    }
  }

  if (input.world) {
    lines.push("", "MUNDO");
    for (const place of input.world.places) {
      lines.push(
        `- ${String(place.id)} · ${String(place.kind)} · zona ${String(place.zone)} · estado ${String(place.status)} · cap ${String(place.capacity ?? "—")}`,
      );
    }
    for (const link of input.world.links) {
      lines.push(`- ${String(link.from)} → ${String(link.to)} · ${String(link.minutes)} min · ${String(link.kind)}`);
    }
  }

  if (input.queryAnswers && input.queryAnswers.length > 0) {
    lines.push("", "RESPUESTAS A CONSULTAS");
    lines.push(JSON.stringify(input.queryAnswers, null, 2));
  }

  if (input.previousErrors && input.previousErrors.length > 0) {
    lines.push("", "ERRORES DE LA RONDA ANTERIOR");
    for (const error of input.previousErrors) lines.push(`- ${error}`);
  }

  lines.push(
    "",
    "Piensa en 8 líneas o menos. No escribas JSON en el thinking. Responde solo con el objeto JSON.",
  );

  return lines.join("\n");
}
