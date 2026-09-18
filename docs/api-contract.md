<!--
  PARA EL EQUIPO: contrato entre backend y frontend. Es la fuente de verdad.
  - Permite trabajar en paralelo: el frontend hace mocks con este formato mientras el backend lo implementa.
  - Cambiarlo = PR que lo diga en la descripción y aviso a quien consuma ese endpoint.
  - Si el backend acaba generando OpenAPI automáticamente (p. ej. FastAPI en /docs), este archivo puede
    quedarse como resumen y enlazarlo.
-->

# Contrato de API

Base URL local: `http://localhost:8000` (variable `VITE_API_URL` en el frontend, ver D6)

Errores: todas las respuestas de error usan el formato `{ "error": "mensaje legible" }` con el código HTTP adecuado.

## `GET /health`

<!-- Ejemplo: copia este bloque para cada endpoint nuevo. -->

Comprueba que el backend está vivo.

**Respuesta 200**

```json
{ "status": "ok" }
```

## Panel de supervisión (propuesto por el frontend; pendiente de implementar en backend)

El frontend consume estos tres endpoints cuando `VITE_DATA_SOURCE=api`. Los tipos exactos están en `frontend/src/domain/types.ts` (`CrisisState`); ese archivo es la referencia de campos.

### `GET /state`

Estado completo de la crisis. El frontend hace polling cada 2 s.

**Respuesta 200** (resumen de campos; ver `CrisisState`)

```json
{
  "simulated": true,
  "clock": { "simSeconds": 44100, "speed": 1, "paused": false, "openingAt": 46800, "lunchAt": 48600, "raceAt": 54000 },
  "planVersion": 1,
  "coordinatorStatus": "replanificando",
  "spaces": [{ "id": "pabellonB", "name": "Pabellón B", "kind": "pabellon", "zone": "sur", "capacity": 450, "status": "pendiente", "note": "…", "pos": [40.468, -3.6172] }],
  "commitments": [{ "id": "c-pabB", "title": "…", "area": "espacios", "status": "aceptado_condiciones", "counterpart": "Recinto", "conditions": ["…"], "planVersion": 1, "updatedAt": 44160 }],
  "agents": [{ "id": "espacios", "name": "Espacios", "objective": "…", "status": "llamada", "lastResult": "…" }],
  "shuttles": [{ "id": "BUS-01", "name": "BUS-01", "passengers": 45, "origin": "Chamartín", "destinationId": "accesoSur", "route": [[40.47, -3.68]], "departAt": 43200, "arriveAt": 45600, "delayMin": 0, "accepted": false, "status": "en_ruta" }],
  "deliveries": [{ "id": "CAT-01", "name": "…", "services": 360, "dockId": "muelleEste", "route": [[40.44, -3.58]], "departAt": 43500, "arriveAt": 45600, "status": "confirmada" }],
  "guestGroups": [{ "id": "g-acceso", "name": "…", "count": 90, "where": "Acceso Sur", "confirmedCount": 0, "informedCount": 0, "acceptedCount": 0 }],
  "decisions": [{ "id": "d-plan-sur", "title": "…", "summary": "…", "cost": 3200, "conditions": ["…"], "effectApprove": "…", "effectReject": "…", "status": "pendiente", "createdAt": 44280 }],
  "calls": [{ "id": "call-1", "agent": "espacios", "counterpart": "…", "channel": "llamada", "startedAt": 44120, "endsAfter": 42, "status": "en_curso", "transcript": [{ "who": "agente", "text": "…", "at": 3 }] }],
  "events": [{ "id": "e0", "time": 44100, "kind": "incidencia", "text": "…", "area": "espacios" }],
  "budget": { "contingency": 5000, "autonomousLimit": 1500, "authorized": 1500, "forecast": 3200, "committed": 0 },
  "constraints": ["Norte y Sur sin conexión interior"],
  "twistsApplied": [],
  "selectedId": null,
  "scriptId": "main", "scriptCursor": 0, "nextScriptAt": null, "waitingForDecision": "d-plan-sur", "agentsPaused": false, "resolved": false
}
```

Los tiempos son segundos desde medianoche (12:15 = 44100). Los campos `scriptId`, `scriptCursor`, `nextScriptAt` solo importan a la simulación del frontend; el backend puede devolverlos con valores fijos.

### `POST /interventions`

Acción del responsable humano.

**Body**

```json
{ "type": "approve_spend", "payload": { "decisionId": "d-plan-sur" } }
```

`type`: `approve_spend` | `reject_spend` | `reject_split` | `pause` | `resume` | `set_constraint` (`payload.text`) | `take_call` (`payload.callId`).

**Respuesta 200**: `{ "ok": true }`

### `POST /simulation/twists`

Giro introducido desde el control de simulación (jurado).

**Body**

```json
{ "twist": "lounge_unavailable" }
```

`twist`: `lounge_unavailable` | `pabellon_b_400` | `shuttle_delay` | `delivery_delay` | `dock_blocked` | `provider_silent` | `reject_spend` | `reject_split` | `guest_need`.

**Respuesta 200**: `{ "ok": true }`
