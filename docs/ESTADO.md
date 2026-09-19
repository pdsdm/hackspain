# Estado del proyecto

> **Este es el documento de memoria del proyecto.** El contexto de una sesión de agente se
> pierde; esto no. Si eres un agente y acabas de llegar: léelo entero antes de tocar nada,
> y déjalo actualizado antes de irte.
>
> Para regenerarlo, sigue el procedimiento de
> [`.agents/skills/actualizar-estado/SKILL.md`](../.agents/skills/actualizar-estado/SKILL.md).
> **Todo lo que hay aquí sale de comandos ejecutados sobre `origin/main`, no de recuerdos.**

| | |
|---|---|
| **Foto tomada** | sábado 19 de septiembre de 2026, 11:50 |
| **Commit de `main`** | `c371546` (PR #26) |
| **Entrega** | domingo 20 a las 11:00, hora de Madrid |
| **Generado por** | Devin, cierre de recuperación T6/T9 |

## Salud

| Comprobación | Resultado |
|---|---|
| `make check` | ✅ OK |
| Tests de backend | ✅ **102 de 102** |

Ambos verificados sobre `c371546` con Node 22.23.2.

## Qué funciona

Todo lo de aquí está mergeado en `main`.

- **Contrato cerrado** (T3): `/state`, `/interventions`, `/events`, `/actions`,
  `/simulation/twists`, `/simulation/reset`, `/workflow/coordinator/proposals`,
  `/workflow/results`. `CrisisState` es el contrato público (D10).
- **Datos** (T5): seed MADRING, `world.json` y 10 fixtures de estado reproducibles
  (`calm`, `normal`, `crisis`, `proposal`, `recovered`, `lounge_unavailable`,
  `pabellon_b_400`…).
- **Backend** (T2, T7, T25): Express + SQLite, estado persistente por ejecución, reglas
  deterministas (aforo, Norte exige traslado, gasto > 1.500 € abre decisión), cola
  idempotente por `planVersion`.
- **Coordinador real** (T10, T24, T26): bucle en proceso `evento → LLM → operaciones +
  consultas → validación → persistir`, sin SDK. Proveedores: Cognition (por defecto),
  Helmcode/Deepseek, OpenAI, Anthropic.
- **Motor de eventos** (T24): `POST /events` con texto libre; reloj simulado que avanza.
- **Trazabilidad de integración** (T17): logs de acciones/callbacks, prueba del payload HappyRobot y guía de pruebas mergeados en PR #24.
- **Camino único de llamada** (T9, T28): «Avisar» crea `call_request`, el backend valida y despacha, el destino E.164 se inyecta desde entorno y el callback actualiza `/state` (PR #26).
- **Replanificación tras giro** (T16, en `review`): invalidación determinista de acuerdos.
- **Agente de Espacios** (T11): guion de conversación y extractor de resultados.
- **Frontend** (T4, T8, T23): panel de 3 columnas, plano Norte/Sur, mapa Leaflet, KPIs con
  delta, coordinador y agentes, llamada, decisión, cronología, chat de eventos libres,
  panel de los 9 giros, modal de intervención.

## Qué falta, por riesgo para la demo

### 🔴 1. Ninguna llamada real · T6 (`doing`), T9 (`review`)

Es el **requisito obligatorio del enunciado** ("interacción de verdad") y lo único que no
se resuelve con horas de código, porque depende del equipo de HappyRobot, que está en el
evento.

`main` ya valida `call_request`, encola una llamada sin LLM, inyecta el destino E.164
desde entorno y muestra «Avisar a…» sin secretos en el frontend. El recorrido Vite →
backend → tarea → llamada simulada → callback está verificado.

**Lo que falta exactamente:** `HAPPYROBOT_HOOK_ESPACIOS`, `HAPPYROBOT_WEBHOOK_TOKEN`,
`PUBLIC_BASE_URL` y la prueba contra una llamada saliente real. El Web call de la rama
antigua sigue disponible como respaldo.

**T9 ya no bloquea** (rama `feat/alvaro-integracion`, sin mergear): el backend manda el
teléfono real en E.164 desde el entorno y expone `POST /workflow/happyrobot/results`, que
traduce el payload nativo del workflow al sobre del contrato. En cuanto exista la URL del
hook, el círculo se cierra sin tocar más código.

**Escalera de respaldo** (bajar un escalón solo cuando el anterior esté descartado):
llamada saliente por API → **web call por navegador (ya funciona)** → SMS o email real →
`sim` etiquetado como simulado en pantalla. Nunca presentar una grabación como llamada en
vivo.

### 🟡 2. Proveedor LLM sin prueba de demo

Hay `HELMCODE_API_KEY` en el `.env` local; Cognition y Devin siguen sin clave. El camino
Helmcode no se ha probado en esta sesión con un evento real. `rules` mantiene el respaldo
determinista para los giros.

**Actualización (sábado 11:50, Pep, rama `feat/pep-panel-api`):** Pep tiene un `.env` local
con clave de Cognition. Verificado que `api.cognition.ai` **no resuelve en DNS**, así que el
harness `tools` (el rápido, por defecto) devuelve `unavailable` siempre. Solo funciona
`COORDINATOR_HARNESS=devin`: una sesión Devin por evento, **60-70 s** hasta el primer plan.
Para la demo hace falta una clave OpenAI-compatible real (Helmcode, OpenAI o Anthropic) o
asumir esa latencia.

### 🟠 3. El panel enseña la simulación, no el backend · T27 (`todo`)

El frontend arranca con `VITE_DATA_SOURCE=sim` y ejecuta `frontend/src/domain/script.ts`,
un guion de 323 líneas con los diálogos escritos a mano. **Lo que se ve hoy en pantalla no
es el sistema.**

Los tres endpoints que necesita ya existen. El trabajo no es construir, es cambiar el
enchufe y arreglar lo que se rompa.

**Actualización (sábado 11:50, Pep, rama `feat/pep-panel-api`, sin mergear):** el panel en
modo `api` ya corre el cierre del Principal por `POST /events` con datos del backend:
agentes, llamadas, cronología, KPIs, decisión y aprobación. Arreglado en la rama:
`POST /interventions` y `/simulation/twists` esperaban a toda la cola del coordinador (más de
2 min con `devin`) y el panel las daba por fallidas a los 4 s; ahora responden al encolar.
Cada `call` lleva `simulated` para no etiquetar como «vía HappyRobot» una llamada del
adaptador `sim`. Pendiente del coordinador (Ventura/Zhi): tras cada `call_result` replanifica
y **duplica la decisión pendiente** (3 × 4.200 € en la misma ejecución) y acumula llamadas
`en_curso` (20 llamadas, 12 vivas a los 2 min).

### 🟡 4. Resto

- Agentes de Catering, Transporte y Asistentes (T12, T13, T14): sin guion ni extractor.
- Control humano verificado (T15): **hecho en `feat/pep-control` (sin mergear, sábado
  12:30)**: los 5 controles probados en modo `rules`, y al replanificar la decisión pendiente
  anterior pasa a `rechazada` («obsoleta» en cronología), así que solo hay una pendiente.
  Un gasto ya autorizado no vuelve a pedir aprobación. 3 tests nuevos (105 en total).
  Texto anterior: `/interventions` existe y registra, pero nadie ha
  comprobado que `pause`, `set_constraint` y `take_call` cambien lo que hace el
  coordinador después.
- Integración (T17): logs y runbook ya están en `main`; sigue sin llamada real. Entorno,
  pitch y vídeo (T18, T19, T21): nada.
- Aprendizaje entre ejecuciones (T20, bonus): nada.

## Bloqueos y de quién dependen

| Qué | Depende de | ¿Externo? |
|---|---|---|
| Llamada real | hook, token de callback y backend público | **Sí — equipo de HappyRobot + despliegue** |
| Coordinador Helmcode | prueba real con la clave local | No |
| Panel real | T27, y de que el backend aguante | No |
| Guion del pitch | decidir giro principal y desenlace | No |

## Ramas vivas sin mergear

| Rama | Qué tiene |
|---|---|
| `Prueba-de-plataforma-y-llamada-real` | Web call y sala Twilio de respaldo; no portar a `main` mientras HappyRobot siga disponible. |

## Decisiones pendientes que bloquean a otros

1. **Cuántas interacciones reales** en la demo. Propuesta: una llamada + un SMS; el resto
   `sim` etiquetado.
2. **Giro principal.** Candidata fuerte: la cadena `lounge_unavailable` →
   `provider_silent`, donde el plan de contingencia del recinto (Norte C) se queda sin
   transporte. Ver [`giros-y-contingencias.md`](giros-y-contingencias.md).
3. **Cómo termina la demo**: plan cerrado o limitación abierta y honesta.
4. **Quién hace de responsable de recinto** al teléfono y con qué respuestas.
5. **Qué proveedor LLM** y quién tiene la clave.

## Avisos para el siguiente agente

- **Usa Node 22** (`nvm use 22`). Con Node 20, `make check` falla con dos errores que
  parecen del repo y no lo son: el glob de `node --test` y `node:sqlite`.
- **`main` se mueve muy rápido.** Haz `git fetch` antes de cualquier análisis; una foto de
  hace una hora ya no vale.
- **`TASKS.md` no lo cuenta todo.** Lista las ramas remotas: hay trabajo real en ramas que
  no figuran en el tablero o figuran con otro nombre.
- **Antes de dar por perdido el trabajo de alguien**, mira si su rama ya se mergeó por PR.
  Una rama borrada del remoto casi siempre significa "PR mergeada".
- **Los 9 giros son una lista cerrada** en `backend/src/contracts/api.ts`. Uno inventado
  devuelve HTTP 400. El texto libre va por `POST /events` y necesita LLM.
- **Reparto de zonas para no pisarse**: backend base → Zhi · HappyRobot → Álvaro ·
  coordinador y Espacios → Ventura · `frontend/` entero y agentes de Catering/Asistentes →
  Pep · `docs/`, `TASKS.md` y pitch → Carlos. Detalle en
  [`plan-sabado.md`](plan-sabado.md).
