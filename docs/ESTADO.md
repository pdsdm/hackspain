# Estado del proyecto

> **Este es el documento de memoria del proyecto.** El contexto de una sesión de agente se
> pierde; esto no. Si eres un agente y acabas de llegar: léelo entero antes de tocar nada,
> y déjalo actualizado antes de irte.
>
> Para regenerarlo, sigue el procedimiento de
> [`.agents/skills/actualizar-estado/SKILL.md`](../.agents/skills/actualizar-estado/SKILL.md).
> **Todo lo que hay aquí sale de comandos ejecutados, no de recuerdos.**

| | |
|---|---|
| **Foto tomada** | sábado 19 de septiembre de 2026, 16:35 CEST |
| **Commit de `main`** | `da6f49f` (PR #44) |
| **Entrega** | domingo 20 a las 11:00, hora de Madrid |
| **Generado por** | Devin, revisión de preparación de demo de Zhi |

## Salud

| Comprobación | Resultado |
|---|---|
| `make check` en `origin/main` | OK |
| Tests de backend en `origin/main` | **226 pasan, 7 omitidos, 0 fallan** |
| `make check` en `fix/zhi-demo-readiness` | OK |
| Tests de backend en la rama | **228 pasan, 7 omitidos, 0 fallan** |
| Lint y build | Backend y frontend OK |
| Fixtures | 10 JSON reproducibles OK |

Verificado con Node 22.23.2. El frontend mantiene el aviso conocido de chunk mayor de
500 kB; no falla el build.

## Qué funciona

### Mergeado en `main`

- **Panel real** (T27): frontend en modo `api`, eventos, intervenciones, giros y polling de
  `/state` contra el backend.
- **Motor y estado** (T2, T7, T24, T25): Express + SQLite, ejecuciones persistentes,
  reloj, reglas deterministas y cola por `planVersion`.
- **Coordinador** (T10, T26): bucle JSON/tools/Devin en proceso, Helmcode configurado por
  D15 y `rules` como respaldo.
- **Control y giro** (T15, T16): aprobación, invalidación de compromisos, incremento de
  `planVersion`, cancelación/traslado de tareas y reavisos.
- **Camino HappyRobot** (T9, T28, T35): salida desde backend, puerta nativa
  `/workflow/happyrobot/results`, idempotencia y verificación JEV opcional. Los efectos JEV
  siguen desactivados por defecto.
- **Recorrido técnico T17**: test integrado `evento → propuesta → aprobación → llamada sim
  → callback HTTP → lounge_unavailable → replan`, sin decisiones duplicadas ni llamadas
  `en_curso` al terminar.
- **Entorno T18 local**: `scripts/demo.sh` permite `up-local`, `status`, `reset`,
  `restart-backend` y `down` con frontend API y SQLite persistente.
- **Mundo dinámico** (T29–T32): espacios ampliados, afluencia backend, nueve vehículos y
  Modo vivo con agente mundo y catálogo de respaldo. El tablero los marca `done`.
- **Especialistas**: Espacios, Catering y Asistentes tienen implementación y tests; T12 y
  T14 siguen en `review` en el tablero.

### En `fix/zhi-demo-readiness`, aún sin mergear

- `clock.seed` cumple el contrato de T30: usa `SIM_SEED` o una semilla nueva por reset y
  migra `clock.attendanceSeed` de bases existentes.
- `POST /simulation/reset` conserva `CLOCK_SPEED`; antes volvía silenciosamente a `1`.
- El coordinador vuelve a `estable` al terminar el último resultado aceptado, salvo que
  exista una decisión, una pausa u otro ciclo `coordinatorBusy`. Esto evita bloquear el
  siguiente incidente y evita una carrera entre ciclos.
- Hay regresiones para seed, velocidad de reset, estabilización al terminar acciones y
  callbacks que llegan mientras otro ciclo está activo.

## Qué falta, por riesgo para la demo

### 1. Llamada HappyRobot real — T6 (`doing`), T9 (`review`)

El usuario confirma que la llamada saliente real ya se probó antes de esta validación; no se
repitió para evitar contactar otra vez al número configurado. La puerta nativa y sus tests
están en `main`. Esta sesión verificó además que el endpoint público existe y exige token.

### 2. Recorrido T17 con servicios reales

El test integrado simulado pasa. En una instancia aislada con llamadas `sim`, Helmcode
`deepseek-v4-flash`, harness JSON y `reasoning_effort=low`, el evento inicial agotó tres
rondas porque varias acciones traían `verificationTarget` inválidos. No creó la decisión
humana. T17 sigue `doing` hasta corregir ese contrato y repetir el recorrido.

### 3. T18 público y ensayo

Backend, frontend y Cloudflare estaban arrancados manualmente. El Quick Tunnel tuvo una
conexión lista; `/health` y `/state` públicos respondieron `200`, y
`POST /workflow/happyrobot/results` sin token respondió `401`. En una instancia aislada,
SQLite, `clock.seed` y `CLOCK_SPEED=30` sobrevivieron al reinicio. Queda el ensayo completo
con operador; T18 sigue `doing`.

### 4. Modo vivo con LLM

La spec T32 conserva sin marcar el criterio de tres incidencias respondidas en diez minutos
reales. En una instancia aislada a velocidad 30 y modo `open`, el agente mundo generó tres
incidencias distintas. La primera coordinación terminó con dos acciones simuladas; otras
fallaron por `verificationTarget` inválidos y por usar `set_place` sobre `gate-oeste`.
Terminó en `replanificando`, aunque sin llamadas ni acciones abiertas.

### 5. Entrega

- Transporte (T13), pitch/vídeo (T19), revisión final (T21) y transcripción P2 (T22) siguen
  `todo`.
- T1, T9, T12, T14–T16, T33–T35 siguen en `review`.
- Aprendizaje entre ejecuciones (T20) sigue `todo` y es bonus.

## Bloqueos y de quién dependen

| Qué | Depende de | ¿Externo? |
|---|---|---|
| Evidencia de llamada real | conservar resultado y callback de la prueba informada por el usuario | Sí — HappyRobot y equipo |
| T17 aceptado | corregir `verificationTarget` de la salida LLM y repetir el recorrido | No |
| T18 aceptado | ensayo completo con operador | No |
| Modo vivo con LLM | corregir targets y distinguir operaciones de puerta/lugar | No |
| Pitch final | actor telefónico, número de interacciones y desenlace | No |

## Ramas vivas sin mergear

| Rama | Qué tiene |
|---|---|
| `fix/zhi-demo-readiness` | Endurecimiento de seed/reset/coordinador descrito arriba; basada en `da6f49f`, sin push. |
| `feat/ventura-jev-confirmacion` | PR #48 abierto: tolera `verificationTarget` fuera de la demo y documenta `reasoning_effort=low`. |
| `Prueba-de-plataforma-y-llamada-real` | Seis commits antiguos de Web call, sala de voz y frontend; diverge de D14 y no tiene PR abierto. |
| `docs/estado-1200` | Un commit de estado basado en `c371546`; obsoleto y sin PR abierto. |

`origin/feat/pep-afluencia` aparece como no mergeada por un commit de merge, pero su diff
contra `main` está vacío.

## Decisiones pendientes que bloquean a otros

1. Quién hace de responsable de recinto al teléfono y qué respuestas dará.
2. Cuántas interacciones reales entran en la demo; propuesta vigente: una llamada y un SMS.
3. Cómo termina el relato: plan cerrado o limitación abierta y honesta.
4. Si la demo usa Helmcode tras corregir los targets o mantiene `rules` como respaldo.

## Avisos para el siguiente agente

- Usa Node 22. En esta máquina es 22.23.2; no existe `~/.nvm/nvm.sh`.
- `scripts/demo.sh` arranca por defecto en `rules` + `sim`. Para servicios reales usa
  `DEMO_COORDINATOR_MODE=llm DEMO_CALL_MODE=real`; el preflight no muestra secretos.
- Reiniciar conserva SQLite, pero pierde callbacks `sim` programados solo en memoria. Si
  se reinicia durante una llamada simulada, ejecuta `reset calm` antes del ensayo.
- Un Quick Tunnel cambia de URL al arrancar. HappyRobot debe usar el `callbackUrl` del
  payload, no una URL copiada a mano.
- No des por cumplido el criterio LLM de T32 solo porque aparezcan tres ids: espera estado
  `estable`, cero acciones abiertas y cero llamadas `en_curso`.
- T17 y T18 no están cerradas hasta validar servicios reales y ensayo.
- Haz `git fetch` antes de analizar: `main` se mueve rápido.
