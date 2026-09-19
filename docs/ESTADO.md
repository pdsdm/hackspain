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
| **Foto tomada** | sábado 19 de septiembre de 2026, 11:55 |
| **Commit de `main`** | `c371546` (PR #26) |
| **Entrega** | domingo 20 a las 11:00, hora de Madrid |
| **Generado por** | Claude (Opus 5), sesión de coordinación de Carlos |

## Salud

| Comprobación | Resultado |
|---|---|
| `make check` | ✅ OK |
| Tests de backend | ✅ **102 de 102** |

Verificados sobre `c371546` en un worktree limpio de `origin/main`, con Node 22.23.2.

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
- **Camino de llamada conectado** (T9, PR #26): «Avisar a…» → `POST /events` → backend →
  adaptador que hace `POST` al hook del área con `callbackUrl` a `/workflow/results`. Sin
  secretos en el frontend. **Verificado con el adaptador `sim`, no con una llamada real.**
- **Trazabilidad de integración** (T17, PR #24): logs de acciones y callbacks, prueba del
  payload de HappyRobot y `docs/guia-pruebas.md`.
- **Replanificación tras giro** (T16, en `review`): invalidación determinista de acuerdos.
- **Agente de Espacios** (T11): guion de conversación y extractor de resultados.
- **Frontend** (T4, T8, T23): panel de 3 columnas, plano Norte/Sur, mapa Leaflet, KPIs con
  delta, coordinador y agentes, llamada, decisión, cronología, chat de eventos libres,
  panel de los 9 giros, modal de intervención.

## Qué falta, por riesgo para la demo

### 🔴 1. Ninguna llamada real todavía · T6 (`doing`), T9 (`doing`)

Es el **requisito obligatorio del enunciado** («interacción de verdad»).

**Lo que ya está resuelto:** el formato de la URL del hook, que era lo que bloqueaba —
`https://workflows.platform.eu.happyrobot.ai/hooks/<id-del-workflow>`. Y el camino
completo Avisar → backend → hook → callback está mergeado en `main`.

**Lo que falta exactamente:** rellenar `HAPPYROBOT_HOOK_ESPACIOS`,
`HAPPYROBOT_WEBHOOK_TOKEN` y `PUBLIC_BASE_URL`, y hacer **una llamada saliente real que
termine con un compromiso en `/state`**. Los criterios de aceptación de
`agent/happyrobot/SPEC.md` siguen todos sin marcar.

**Escalera de respaldo** (bajar un escalón solo cuando el anterior esté descartado):
llamada saliente por API → **web call por navegador (ya funciona)** → SMS o email real →
`sim` etiquetado como simulado en pantalla. Nunca presentar una grabación como llamada en
vivo.

### 🔴 2. No existe ningún `.env` · sin tarea asignada

**Verificado a las 11:55: no hay fichero `.env` en el repo principal ni en ninguno de los
worktrees.** Solo `.env.example`.

Sin clave de LLM el coordinador no decide nada: comprobado que `POST /events` con texto
libre solo escribe en la cronología y el mundo no cambia. Los giros mantienen su efecto
determinista, así que **la demo puede parecer que funciona cuando en realidad no hay nadie
pensando**.

> Una foto anterior de este documento (11:45, generada por Devin) decía que existía una
> `HELMCODE_API_KEY` local. No es cierto en las máquinas del equipo: Devin corre en la nube
> con su propio entorno. Si vuelves a leer algo parecido, compruébalo con
> `ls -la .env` antes de bajar la prioridad de este bloqueo.

Hay créditos de Cognition y de Helmcode sin usar.

### 🟠 3. El panel enseña la simulación, no el backend · T27 (`todo`)

El frontend arranca con `VITE_DATA_SOURCE=sim` y ejecuta `frontend/src/domain/script.ts`,
un guion de 323 líneas con los diálogos escritos a mano. **Lo que se ve hoy en pantalla no
es el sistema.**

Los tres endpoints que necesita ya existen. El trabajo no es construir, es cambiar el
enchufe y arreglar lo que se rompa.

### 🟡 4. Bug verificado sin arreglar: decisiones huérfanas · T15 (`todo`)

`applyPlanProposal` invalida los compromisos por `planVersion` pero **nunca las decisiones
pendientes**. Consecuencias: se puede autorizar el gasto de un plan descartado, y el giro
`reject_spend` puede resolver la decisión equivocada dejando la viva pendiente.

Está en el camino exacto de la demo (aprobar los 3.200 € → giro → replanificar).
Diagnóstico completo, reproducción sin LLM y dos opciones de arreglo en
[`specs/T15-control.md`](specs/T15-control.md). Arreglo recomendado: ~1 hora.

### 🟡 5. Resto

- Agentes de Catering, Transporte y Asistentes (T12, T13, T14): sin guion ni extractor.
- Control humano verificado (T15): nadie ha comprobado que `pause`, `set_constraint` y
  `take_call` cambien lo que hace el coordinador después.
- Entorno de demo, pitch, vídeo y entrega (T18, T19, T21): nada.
- Aprendizaje entre ejecuciones (T20, bonus): nada.

## Bloqueos y de quién dependen

| Qué | Depende de | ¿Externo? |
|---|---|---|
| Llamada real | id del hook, token de callback y un backend accesible desde fuera | **Sí — cuenta de HappyRobot + despliegue** |
| Que el coordinador decida | crear un `.env` con una clave de LLM | No |
| Panel real | T27 | No |
| Guion del pitch | decidir giro principal y desenlace | No |

## Ramas vivas sin mergear

| Rama | Qué tiene |
|---|---|
| `Prueba-de-plataforma-y-llamada-real` | 6 commits. Web call por navegador (respaldo que funciona), sala de tres en `agent/demo/main.py`, y `agent/happyrobot/SPEC.md` con el formato del hook. **Su propia sección «Deuda de esta rama» dice que el atajo del servidor de Vite hay que deshacerlo al mergear** — y eso ya está hecho en `main` por el PR #26. |
| `feat/ventura-specs-cerebro` | Obsoleta: su contenido ya está en `main`. Se puede borrar. |

## Decisiones pendientes que bloquean a otros

1. **Cuántas interacciones reales** en la demo. Propuesta: una llamada + un SMS; el resto
   `sim` etiquetado.
2. **Giro principal.** Candidata fuerte: la cadena `lounge_unavailable` →
   `provider_silent`, donde el plan de contingencia del recinto (Norte C) se queda sin
   transporte. Ver [`giros-y-contingencias.md`](giros-y-contingencias.md).
3. **Cómo termina la demo**: plan cerrado o limitación abierta y honesta.
4. **Quién hace de responsable de recinto** al teléfono y con qué respuestas.
5. **Qué proveedor LLM** y quién tiene la clave.

*(La de por dónde se lanza la llamada, T28, ya está decidida y resuelta: va por el backend.)*

## Avisos para el siguiente agente

- **Usa Node 22** (`nvm use 22`). Con Node 20, `make check` falla con dos errores que
  parecen del repo y no lo son: el glob de `node --test` y `node:sqlite`.
- **`main` se mueve muy rápido.** Haz `git fetch` antes de cualquier análisis; una foto de
  hace veinte minutos ya no vale.
- **Verifica lo que diga este documento antes de apoyarte en ello.** Ya ha pasado una vez
  que una foto afirmaba que existía una clave de API que no existe en las máquinas del
  equipo. Los agentes en la nube ven un entorno distinto al vuestro.
- **`TASKS.md` no lo cuenta todo.** Lista las ramas remotas: hay trabajo real en ramas que
  no figuran en el tablero o figuran con otro nombre.
- **Antes de dar por perdido el trabajo de alguien**, mira si su rama ya se mergeó por PR.
  Una rama borrada del remoto casi siempre significa «PR mergeada».
- **Los 9 giros son una lista cerrada** en `backend/src/contracts/api.ts`. Uno inventado
  devuelve HTTP 400. El texto libre va por `POST /events` y necesita LLM.
- **Reparto de zonas para no pisarse**: backend base → Zhi · HappyRobot → Álvaro ·
  coordinador y Espacios → Ventura · `frontend/` entero y agentes de Catering/Asistentes →
  Pep · `docs/`, `TASKS.md` y pitch → Carlos. Detalle en
  [`plan-sabado.md`](plan-sabado.md).
