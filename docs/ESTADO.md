# Estado del proyecto

> Foto verificada de `origin/main` más T55 en esta rama. Actualizar esta página después de cada merge relevante.

| | |
|---|---|
| **Foto tomada** | 20 de septiembre de 2026, 02:45 CEST |
| **Base** | `origin/main` (0c5b7f9, PR #98) + T55 en `fix/pep-replan-loop` |
| **Trabajo en revisión** | T55: corrección del bucle de replanificación observado en producción |
| **Entrega** | domingo 20 a las 11:00, hora de Madrid |
| **Generado por** | Pep, durante T55 |

## Salud

| Comprobación | Resultado |
|---|---|
| `make check` en `fix/pep-replan-loop` | **OK** |
| Tests backend | 353: **346 pasan, 0 fallan, 7 live omitidos** |
| Lint y builds | Backend y frontend OK |
| Fixtures | 10 JSON reproducibles OK |
| Producción (`hackspain-production.up.railway.app`) | `/health` OK, pero el estado está en bucle: `planVersion 43`, 168 llamadas, 78 reales |
| Crédito Railway | **"30 days or $4.96 left"**: hay que subir de plan antes de las 11:00 |

Persisten dos avisos de lint previos (`openaiUsable` y optional chaining en un test) y el aviso del chunk frontend mayor de 500 kB.

## Producción a las 02:00: qué se observó

- Logs de Railway: `[coord] bucle happyrobot gpt-5.6-luna-low apply` cada 15–25 s desde las 23:46 sin parar. Producción corre T44 como coordinador principal con `APPLY=true` (decisión del equipo, D20).
- `/state`: `planVersion 43`, `coordinatorStatus replanificando`, 168 llamadas, 78 reales al teléfono de pruebas, 54 con `sin_respuesta`. Dos llamadas reales a Espacios arrancaron con 1 s de diferencia; la segunda dio ocupado.
- Causa: cada `no_answer` relanzaba al coordinador (`engine.ts`, `callResultChangesPlan`), el coordinador creaba otra llamada a Espacios, el executor marcaba mientras la anterior aún sonaba, el teléfono daba ocupado y volvía el `no_answer`.
- Logs ilegibles: `[coord] think` imprime el razonamiento línea a línea (`verbose=sí`). Los únicos errores de nivel `error` en 24 h son 4 `[sim] contraparte This operation was aborted` (timeouts de DeepSeek en la contraparte simulada).

## Qué funciona

### Base operativa

- Estado SQLite, cola serial por `planVersion`, callbacks idempotentes y frontend en modo API.
- Coordinador Helmcode/DeepSeek; T44 HappyRobot Reasoning Agent sigue en shadow y no cambia el proveedor principal.
- Cuatro especialistas visibles: Espacios, Catering, Transporte y Asistentes.
- Cierre honesto mediante `resolved`, `closureSummary` o `coordinatorStatus: atascado`.
- Costes informativos; no bloquean la recuperación ni crean aprobaciones económicas.

### T22 en `feat/devin-transcripcion`

- `POST /workflow/happyrobot/transcript` acepta snapshots acumulativos autenticados, los ordena, fusiona sin duplicar y persiste en SQLite.
- El callback final conserva las líneas recibidas en vivo y el panel mantiene accesible el transcript completo al terminar.
- Las llamadas reales muestran las líneas recibidas aunque el reloj de simulación esté pausado; las simuladas conservan la revelación por `at`.
- La cronología global conserva solo el resumen final de la llamada.
- El workflow de development tiene `reportar_transcript`, callbacks dinámicos y usa `contact.phone`. Tres intentos llegaron al nodo de voz, pero la telefonía terminó como `user_missed_call` antes de iniciar audio.

### T55 en `fix/pep-replan-loop`

- `no_answer` ya no relanza al coordinador: la misma tarea se reencola una vez (`:retry`); al segundo `no_answer` el agente queda en `incidencia` sin nueva tarea.
- El executor solo mantiene una llamada real en curso; el resto de tareas reales esperan `pending` hasta el siguiente tick.
- Tras 3 relanzamientos seguidos provocados por resultados sin input externo nuevo, el coordinador se pausa y la cronología lo anota (`espera`). Cualquier input humano, giro o incidencia lo reactiva.
- `COORDINATOR_VERBOSE` vacío equivale a `0` cuando existe `RAILWAY_ENVIRONMENT`.
- Contrato actualizado en `docs/api-contract.md` (resultados de especialistas y timeout de 180 s).

### Camino de vídeo T45–T52

- **T45, PR #79, en revisión:** `docs/video-scenario.md` congela relato, textos, checkpoints, widgets, etiquetas de simulación y finales principal/respaldo; falta aprobación literal de Carlos/equipo.
- **T46, PR #71:** `POST /workflow/happyrobot/events` acepta solo `principal_pipe_burst` y `dock_blocked`, con bearer, idempotencia, serialización y procedencia `call | sms`.
- **T50, PR #73:** el coordinador conoce seis personas de recepción, las coordina mediante Asistentes y permite que Catering dependa de la apertura del muelle.
- **T51 parcial, PR #74:** Catering y Asistentes actualizan entregas, informados y `lastResult`; las necesidades de accesibilidad/dieta generan una tarea separada.
- **T49, PR #75, cerrada:** overlay de incidencias activas y cronología con canal, actor y etiqueta de simulación, derivados de `CrisisState`. Revisión exacta: 1920×1080 sin solapes ni scroll horizontal; 390×844 muestra solo cronología y formulario.
- **T47, PR #76:** instalador idempotente del workflow `Demo Incident Inputs`, bearer oculto y POST estricto a T46.
- **T48, PR #77:** director reproducible con `--inputs=happyrobot|external|api`, reset, checkpoints y cues de grabación.
- **T52, rama actual:** el director admite `--rehearsals=N`, usa `HAPPYROBOT_DEMO_INPUT_HOOK_URL`, valida M0/M2/M3/final con `/state` y `/actions`, mantiene `SIMULACIÓN ·` y guarda evidencia privada en `.demo/` también al fallar.

V4 en development y V6 en production de `Demo incident inputs` atravesaron HappyRobot → hook → T46 para los dos inputs. Producción validada con runs `c438a4a3-77cd-4a0a-a410-6964628c889c` y `bb4dc3d9-0c99-4bed-beed-0ffb88425cec`: Principal y Muelle Este cerraron, CAT-01/CAT-02 quedaron bloqueadas y ambos eventos conservaron procedencia. La puerta final falla honestamente porque en modo `rules` los cuatro especialistas no exponen `reason` ni `lastResult`. No hubo grabación.

## Qué falta, por riesgo para la demo

0. **Subir el plan de Railway.** El banner dice "$4.96 left". Si se agota, el backend y el frontend de Vercel (`zhivel.vercel.app`, apunta a Railway) se quedan sin servicio antes de la demo. Lo hace un humano con la tarjeta.
0b. **Mergear T55, redesplegar y resetear producción.** `POST /simulation/reset` deja `planVersion 1` y reloj pausado (T42). Sin T55 el bucle vuelve con el primer `no_answer`.
1. **Rotar el bearer antes de la toma final.** El token inspeccionado debe sustituirse en backend y en las versiones live de HappyRobot sin publicarlo ni copiarlo a documentación.
2. **Completar la evidencia de especialistas (T51/T52).** Los cuatro agentes carecen de `reason` y `lastResult` en el recorrido `rules`; Transporte sigue sin cerrar.
3. **Superar tres ensayos HappyRobot (T52).** El hook de producción ya llega a M3; faltan tres recorridos que superen la puerta final.
4. **Superar tres ensayos API (T52).** La automatización existe, pero la puerta final aún falla por la evidencia de especialistas.
5. **Aprobar textos y storyboard (T45).** Carlos/equipo deben aprobar los dos mensajes literales y la narración congelada.
6. **Grabar toma maestra y respaldo (T52).** No se ha grabado ninguna toma.
7. **Revisión humana de T50.** El código y los tests están en `main`; la fila permanece `review`.

## Bloqueos

| Qué | Depende de | Externo |
|---|---|---|
| Servicio en Railway | crédito de prueba casi agotado; hay que pagar el plan | Sí |
| Rotar bearer | owner actualiza backend, development y production con el mismo valor oculto | Parcial |
| Validar live transcript real | HappyRobot/telco inicia la run pero devuelve `user_missed_call` antes del audio | Sí |
| Superar la puerta final T52 | `reason` y `lastResult` coherentes en los cuatro especialistas; cerrar Transporte T51 | No |
| Grabar T52 | tres ensayos superados y ordenador de grabación | Parcial |

## Ramas vivas sin mergear

- `fix/pep-replan-loop` (T55): corrección del bucle de replanificación; `make check` OK; pendiente de PR y merge.
- `feat/devin-transcripcion` (local): T22 implementada y verificada localmente; E2E telefónico bloqueado antes del audio.
- `origin/feat/pep-take-call`: cambios de executor/engine sobre una base anterior; no integrar sin revisar contra T46–T51.
- `origin/Prueba-de-plataforma-y-llamada-real`: implementación antigua con servidor Python y frontend propio; no incorporar sobre `main` a ciegas.
- `origin/feat/pep-afluencia`: aparece como no mergeada, pero no aporta diff útil frente al `main` actual.
- `origin/docs/estado-1200`: fotografía antigua.
- `feat/zhi-demo-recording-readiness` (local): slice de T52 descrito arriba; pendiente de revisión.

Las ramas `feat/ventura-demo-staff-coordination`, `feat/ventura-demo-specialists`, `feat/ventura-demo-incidents-ui`, `feat/ventura-happyrobot-incident-inputs`, `feat/ventura-demo-director` y `docs/ventura-video-scenario` ya están mergeadas mediante PRs #73–#77 y #79.

## Decisiones pendientes

1. Carlos/equipo aprueban los textos literales y la narración de T45.
2. Quién rota el bearer en backend y en ambas versiones live de HappyRobot.
3. Quién termina Transporte y verifica los cuatro shuttles.
4. Qué ordenador graba la toma maestra y quién opera el frontend.
5. Si la toma principal usa HappyRobot y la de respaldo `--inputs=api` — recomendación actual: sí.

## Avisos para el siguiente agente

- Ejecutar siempre `git fetch` antes de analizar; `main` se mueve rápido.
- No presentar la llamada/SMS simulados como telefonía real. Los actores llevan el prefijo `SIMULACIÓN ·`.
- La key HappyRobot actual puede leer y ejecutar workflows, pero no crearlos.
- Para crear/publicar el workflow con una key owner:

```bash
node --env-file-if-exists=.env --import tsx scripts/setup-happyrobot-demo-inputs.mts --publish
```

- Para los tres ensayos HappyRobot, después de publicar T47:

```bash
npm --prefix backend run demo:video -- --inputs=happyrobot --rehearsals=3
```

- Para los tres ensayos API:

```bash
npm --prefix backend run demo:video -- --inputs=api --rehearsals=3
```

- La evidencia queda en `.demo/` y está ignorada por Git. El ensayo API local verificado llegó a M3, pero no superó la puerta final de especialistas.
- Ningún ensayo de este documento demuestra por sí solo que exista una grabación.
- T44 es el coordinador principal en producción desde el 19/09 a las 23:46 (`COORDINATOR_HARNESS=happyrobot`, `HAPPYROBOT_COORDINATOR_APPLY=true`). El equipo lo confirmó el 20/09 (D20). Todo lo observado en el bucle de producción es con este harness.
- Después de desplegar T55: filtra los logs de Railway por `"bucle"` durante 10 minutos; debe aparecer solo tras inputs reales, no cada 20 s. En `/state.calls` nunca debe haber más de una llamada `simulated:false` en `en_curso`.
