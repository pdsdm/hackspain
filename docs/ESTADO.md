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
| **Foto tomada** | sábado 19 de septiembre de 2026, 13:32 CEST |
| **Commit de `main`** | `027ea69` (PR #32) |
| **Entrega** | domingo 20 a las 11:00, hora de Madrid |
| **Generado por** | Devin, cierre del tramo técnico T17/T18 |

## Salud

| Comprobación | Resultado |
|---|---|
| `make check` | OK |
| Tests de backend | **110 de 110** |
| Lint y build | Backend y frontend OK |
| Fixtures | 10 JSON reproducibles OK |

Verificado sobre `027ea69` con Node 22.23.2. El frontend mantiene el aviso conocido de
chunk mayor de 500 kB; no falla el build.

## Qué funciona

Todo lo de esta sección está mergeado en `main`.

- **Panel real** (T27): frontend en modo `api`, eventos, intervenciones, giros y polling de
  `/state` contra el backend.
- **Motor y estado** (T2, T7, T24, T25): Express + SQLite, ejecuciones persistentes,
  reloj, reglas deterministas y cola por `planVersion`.
- **Coordinador** (T10, T26): bucle JSON/tools/Devin en proceso y proveedor Helmcode
  configurado por D15, con `rules` como respaldo.
- **Control y giro** (T15, T16): aprobación, decisiones obsoletas, invalidación de
  compromisos, incremento de `planVersion`, cancelación/traslado de tareas y reavisos.
- **Camino de llamada** (T9, T28): el backend despacha a HappyRobot y recibe resultados
  autenticados en `/workflow/results`; el panel no maneja credenciales.
- **Recorrido técnico T17** (PR #32): test integrado `evento → propuesta → aprobación →
  llamada sim → callback HTTP → lounge_unavailable → replan`. Termina sin decisiones
  duplicadas ni llamadas `en_curso`.
- **Protecciones T17** (PR #32): no salen acciones nuevas antes de aprobar gasto y un
  callback duplicado no vuelve a ejecutar el coordinador.
- **Entorno T18 local** (PR #32): `scripts/demo.sh` arranca backend con SQLite persistente
  y frontend API; permite `status`, `reset`, `restart-backend` y `down`. El arranque local,
  el proxy de Vite y la persistencia tras reinicio se comprobaron manualmente.
- **Especialistas**: Espacios (T11) y Asistentes/SMS segmentado (T14) tienen guion,
  extractor y tests.

## Qué falta, por riesgo para la demo

### 1. Llamada HappyRobot real — T6 (`doing`), T9 (`review`)

No se ha verificado una llamada saliente real que termine con el callback y un compromiso
visible en `/state`. Faltan, como mínimo, trigger, API key, teléfono E.164 y token de
callback válidos en el `.env` del portátil de demo.

El equipo informó de un Quick Tunnel anterior, pero no se verificó en esta sesión. En este
entorno `cloudflared` no está en `PATH` y no hay proceso activo. El modo `up` falla de forma
explícita antes de arrancar nada si falta el binario.

### 2. Recorrido T17 con servicios reales

El test usa una salida estructurada inyectada equivalente a la esperada de Helmcode y un
callback simulado. Falta repetir el mismo recorrido con Helmcode `deepseek-v4-flash` y
HappyRobot reales. T17 permanece `doing` hasta esa validación.

### 3. T18 público y ensayo

La automatización del Quick Tunnel está mergeada, pero no se ejecutó contra una URL
pública en esta sesión. Falta comprobar `/health` público, token del callback, recuperación
tras reinicio y un ensayo completo. T18 permanece `doing`.

### 4. Resto

- Catering y Transporte (T12, T13): `todo`.
- Pitch, ensayo y vídeo (T19): `todo`.
- T30–T32: `todo`; no abrirlos antes de completar y ensayar el recorrido principal.
- Aprendizaje entre ejecuciones (T20): bonus, `todo`.

## Bloqueos y de quién dependen

| Qué | Depende de | ¿Externo? |
|---|---|---|
| Llamada real | trigger, credenciales, número de prueba y callback público | Sí — HappyRobot y portátil de demo |
| T17 aceptado | llamada real T6 y prueba Helmcode | Parcial |
| T18 aceptado | Quick Tunnel operativo, callback real y ensayo | Parcial |
| Pitch final | decidir actor telefónico y desenlace | No |

## Ramas vivas sin mergear

| Rama | Qué tiene |
|---|---|
| `Prueba-de-plataforma-y-llamada-real` | 6 commits; Web call y sala de voz de respaldo, además de cambios frontend que no deben sustituir D14. |
| `docs/estado-1200` | Un commit de `ESTADO.md` basado en `c371546`; está obsoleto y no tiene PR abierto. |

No hay PRs abiertos en GitHub al tomar esta foto.

## Decisiones pendientes que bloquean a otros

1. Quién hace de responsable de recinto al teléfono y qué respuestas dará.
2. Cuántas interacciones reales entran en la demo; propuesta vigente: una llamada y un SMS.
3. Cómo termina el relato: plan cerrado o limitación abierta y honesta.
4. Dónde está el binario `cloudflared` del portátil y quién aporta las credenciales T6.

## Avisos para el siguiente agente

- Usa Node 22. En esta máquina Node 22.23.2 viene de `pi-node`; no existe
  `~/.nvm/nvm.sh`.
- `scripts/demo.sh` arranca por defecto en `rules` + `sim`. Para servicios reales usa
  `DEMO_COORDINATOR_MODE=llm DEMO_CALL_MODE=real`; el preflight comprueba que las
  variables necesarias existen sin mostrar sus valores.
- Reiniciar conserva SQLite, pero pierde callbacks `sim` programados solo en memoria. Si
  se reinicia durante una llamada simulada, ejecuta `reset calm` antes del ensayo.
- Un Quick Tunnel cambia de URL al arrancar. HappyRobot debe usar el `callbackUrl` del
  payload, no una URL copiada a mano.
- T17 y T18 no están cerradas: su tramo técnico está en `main`, pero falta la validación
  real descrita en sus specs.
- Haz `git fetch` antes de analizar: `main` se mueve rápido y las ramas remotas antiguas
  pueden estar ya mergeadas.
