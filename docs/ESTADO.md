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
| **Foto tomada** | sábado 19 de septiembre de 2026, 11:05 |
| **Commit de `main`** | `863ecf3` (PR #22) |
| **Entrega** | domingo 20 a las 11:00, hora de Madrid |
| **Generado por** | Claude (Opus 5), sesión de coordinación de Carlos |

## Salud

| Comprobación | Resultado |
|---|---|
| `make check` | ✅ OK |
| Tests de backend | ✅ **99 de 99** |

Ambos verificados sobre `863ecf3` con Node 22.23.2.

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
- **Replanificación tras giro** (T16, en `review`): invalidación determinista de acuerdos.
- **Agente de Espacios** (T11): guion de conversación y extractor de resultados.
- **Frontend** (T4, T8, T23): panel de 3 columnas, plano Norte/Sur, mapa Leaflet, KPIs con
  delta, coordinador y agentes, llamada, decisión, cronología, chat de eventos libres,
  panel de los 9 giros, modal de intervención.

## Qué falta, por riesgo para la demo

### 🔴 1. Ninguna llamada real · T6 (`doing`), T9 (`todo`)

Es el **requisito obligatorio del enunciado** ("interacción de verdad") y lo único que no
se resuelve con horas de código, porque depende del equipo de HappyRobot, que está en el
evento.

Hay más avance del que dice el tablero. La rama **`Prueba-de-plataforma-y-llamada-real`**
(sin mergear) tiene un workflow desplegado en
`platform.eu.happyrobot.ai/deployments/my5asz8ibzd3` que funciona como **Web call** (micro
del navegador), con un panel «Avisar a…» y lista de contactos.

**Lo que falta exactamente:** la URL de un trigger **Webhook** del workflow. POSTear al
deployment devuelve HTML. Esa URL la tiene HappyRobot.

**T9 ya no bloquea** (rama `feat/alvaro-integracion`, sin mergear): el backend manda el
teléfono real en E.164 desde el entorno y expone `POST /workflow/happyrobot/results`, que
traduce el payload nativo del workflow al sobre del contrato. En cuanto exista la URL del
hook, el círculo se cierra sin tocar más código.

**Escalera de respaldo** (bajar un escalón solo cuando el anterior esté descartado):
llamada saliente por API → **web call por navegador (ya funciona)** → SMS o email real →
`sim` etiquetado como simulado en pantalla. Nunca presentar una grabación como llamada en
vivo.

### 🔴 2. No hay ninguna clave de LLM · sin tarea asignada

**No existe fichero `.env` en el repo, solo `.env.example`.** Y sin clave, el coordinador
no decide nada: verificado que `POST /events` con texto libre solo escribe en la cronología
y el mundo no cambia.

Esto está al mismo nivel de bloqueo que la llamada, y es mucho más fácil de resolver: hay
créditos de Cognition y de Helmcode sin usar.

### 🟠 3. El panel enseña la simulación, no el backend · T27 (`todo`)

El frontend arranca con `VITE_DATA_SOURCE=sim` y ejecuta `frontend/src/domain/script.ts`,
un guion de 323 líneas con los diálogos escritos a mano. **Lo que se ve hoy en pantalla no
es el sistema.**

Los tres endpoints que necesita ya existen. El trabajo no es construir, es cambiar el
enchufe y arreglar lo que se rompa.

### 🟠 4. Dos caminos para lanzar la llamada · T28 (`todo`)

El trabajo de Álvaro llama a HappyRobot desde el **servidor de Vite**
(`frontend/vite.config.ts`), y el backend ya tiene un adaptador `happyrobot` en
`backend/src/actions/adapters/`. Hay que elegir uno. Recomendación: el backend, para que
el panel en modo `api` vea las llamadas y haya una sola verdad.

### 🟡 5. Resto

- Agentes de Catering, Transporte y Asistentes (T12, T13, T14): sin guion ni extractor.
- Control humano verificado (T15): `/interventions` existe y registra, pero nadie ha
  comprobado que `pause`, `set_constraint` y `take_call` cambien lo que hace el
  coordinador después.
- Integración, entorno de demo, pitch y vídeo (T17, T18, T19, T21): nada.
- Aprendizaje entre ejecuciones (T20, bonus): nada.

## Bloqueos y de quién dependen

| Qué | Depende de | ¿Externo? |
|---|---|---|
| Llamada real | trigger Webhook del workflow | **Sí — equipo de HappyRobot** |
| Coordinador decidiendo | una clave de LLM en `.env` | No |
| Panel real | T27, y de que el backend aguante | No |
| Guion del pitch | decidir giro principal y desenlace | No |

## Ramas vivas sin mergear

| Rama | Qué tiene |
|---|---|
| `Prueba-de-plataforma-y-llamada-real` | T6: workflow de HappyRobot, web call, panel «Avisar a…», proxy en Vite. **No está en `TASKS.md` con este nombre.** |
| `feat/alvaro-integracion` | T9: teléfono E.164 desde entorno y `POST /workflow/happyrobot/results`, que traduce el webhook nativo del workflow. Sale de `origin/main`, no arrastra la deuda de T6. |
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
