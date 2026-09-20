# Estado del proyecto

> Foto verificada de `origin/main` (PR #105) más T56 en esta rama. Actualizar esta página después de cada merge relevante.

| | |
|---|---|
| **Foto tomada** | 20 de septiembre de 2026, 03:50 CEST |
| **Base** | `f13c8c3` (`origin/main`, PR #105) + `fix/pep-deps-retry` |
| **Trabajo en revisión** | T56 (PR #101): dependencias con `:retry`, sin replan por condiciones, resumen de atasco legible |
| **Entrega** | domingo 20 a las 11:00, hora de Madrid |
| **Generado por** | Pep, durante T56 |

## Salud

| Comprobación | Resultado |
|---|---|
| `make check` en `fix/pep-deps-retry` (con `origin/main` integrado) | **OK** |
| Tests backend | 357: **350 pasan, 0 fallan, 7 live omitidos** |
| Lint y builds | Backend y frontend OK |
| Fixtures | 10 JSON reproducibles OK |
| Node verificado | 23.10.0; el repo exige ≥22.13 |
| Producción (`hackspain-production.up.railway.app`) | `/health` OK; run activo observado en `planVersion 3`, `replanificando`, 5 llamadas y 3 abiertas (origen del ensayo sin verificar) |
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
- Por D20, HappyRobot Reasoning Agent es el coordinador principal de la toma; el backend valida y aplica `submit_plan`. `rules` queda como contingencia técnica.
- Cuatro especialistas visibles: Espacios, Catering, Transporte y Asistentes.
- Cierre honesto mediante `resolved`, `closureSummary` o `coordinatorStatus: atascado`.
- Costes informativos; no bloquean la recuperación ni crean aprobaciones económicas.

### T22 (PR #89, mergeada)

- `POST /workflow/happyrobot/transcript` acepta snapshots acumulativos autenticados, los ordena, fusiona sin duplicar y persiste en SQLite.
- El callback final conserva las líneas recibidas en vivo y el panel mantiene accesible el transcript completo al terminar.
- Las llamadas reales muestran las líneas recibidas aunque el reloj de simulación esté pausado; las simuladas conservan la revelación por `at`.
- La cronología global conserva solo el resumen final de la llamada.
- El workflow de development tiene `reportar_transcript`, callbacks dinámicos y usa `contact.phone`. Tres intentos llegaron al nodo de voz, pero la telefonía terminó como `user_missed_call` antes de iniciar audio.

### T55 (PR #100, mergeada)

- `no_answer` ya no relanza al coordinador: la misma tarea se reencola una vez (`:retry`); al segundo `no_answer` el agente queda en `incidencia` sin nueva tarea.
- El executor solo mantiene una llamada real en curso; el resto de tareas reales esperan `pending` hasta el siguiente tick.
- Tras 3 relanzamientos seguidos provocados por resultados sin input externo nuevo, el coordinador se pausa y la cronología lo anota (`espera`). Cualquier input humano, giro o incidencia lo reactiva.
- `COORDINATOR_VERBOSE` vacío equivale a `0` cuando existe `RAILWAY_ENVIRONMENT`.
- Contrato actualizado en `docs/api-contract.md` (resultados de especialistas y timeout de 180 s). Decisión D21.

### T52 triaje y llamada controlada (PR #102 y #104, mergeadas)

- El primer input es `inbox_batch`: diez mensajes sintéticos en 3,6 s; el Reasoning Agent debe usar `consult_world`, seleccionar la rotura y persistir el triaje 10/1/9.
- `assignments[]` queda en `/state`; cierre y frontend distinguen 600 asignados de cero plazas confirmadas cuando quedan condiciones.
- `--confirm-real-transport-call` autoriza una única invocación de `emitir_llamada` desde el coordinador; las tareas persistidas siguen `sim` y el modo seguro no llama.
- El segundo plan debe redirigir CAT-01/CAT-02 a Muelle Sur y no puede proponer Muelle Norte sin ruta exterior.
- Código verificado localmente; falta merge, deployment y E2E con el destinatario de la llamada preparado.

### T56 en `fix/pep-deps-retry` (PR #101)

- Con T55 desplegada, el ensayo API local seguía fallando en M2 por timeout. Dos causas, ambas reproducidas y corregidas:
  - Cada `accepted_with_conditions` con texto nuevo contaba como cambio material y relanzaba al coordinador (plan 3 → 6 en dos minutos, 19 llamadas). Ahora solo relanzan los cambios de hechos de `spaces[]`; las condiciones se anotan sin replanificar.
  - La tarea `:retry` tiene otra `idempotencyKey`, así que una tarea con `dependsOn` sobre la original se quedaba `pending` para siempre; el plan nunca llegaba a `atascado`. Ahora la dependencia se satisface con la original o su `:retry`; si ambas fallan, la dependiente se cancela y la cronología lo anota como `fallo`.
- `closureSummary` en `atascado` enumera como mucho tres condiciones y cuenta el resto (antes salían 38 seguidas).
- Ensayo API local con `COORDINATOR_HARNESS=tools` y sin hooks reales: **1/1 superado** (M0, M2, M3 y final `atascado` con `closureSummary`, 2 ciclos de coordinador, 11 llamadas, 0 tareas abiertas). Decisión D23.
- Logs de Railway de las últimas 24 h: solo `SIGTERM` de redeploys y `[sim] contraparte This operation was aborted` (timeouts de DeepSeek; cae al fallback determinista). Desde el arranque de las 02:54 el backend imprime `verbose=no`.

### Camino de vídeo T45–T52

- **T45, PR #79, en revisión:** `docs/video-scenario.md` congela relato, textos, checkpoints, widgets, etiquetas de simulación y finales principal/respaldo; falta aprobación literal de Carlos/equipo.
- **T46, PR #71 + rama actual:** `POST /workflow/happyrobot/events` acepta `inbox_batch`, `principal_pipe_burst` y `dock_blocked`, con bearer, idempotencia, serialización y procedencia `call | sms`.
- **T50, PR #73:** el coordinador conoce seis personas de recepción, las coordina mediante Asistentes y permite que Catering dependa de la apertura del muelle.
- **T51 parcial, PR #74:** Catering y Asistentes actualizan entregas, informados y `lastResult`; las necesidades de accesibilidad/dieta generan una tarea separada.
- **T49, PR #75, cerrada:** overlay de incidencias activas y cronología con canal, actor y etiqueta de simulación, derivados de `CrisisState`. Revisión exacta: 1920×1080 sin solapes ni scroll horizontal; 390×844 muestra solo cronología y formulario.
- **T47, PR #76:** instalador idempotente del workflow `Demo Incident Inputs`, bearer oculto y POST estricto a T46.
- **T48, PR #77:** director reproducible con `--inputs=happyrobot|external|api`, reset, checkpoints y cues de grabación.
- **T44, decisión D20:** la toma usa el workflow `Orquestador` como coordinador principal; PR #99 endurece prompt, especialistas, cierre y gates E2E.
- **T52, PR #99 mergeada:** el director admite `--rehearsals=N`, usa `HAPPYROBOT_DEMO_INPUT_HOOK_URL`, valida M0/M2/M3/final con `/state` y `/actions`, mantiene `SIMULACIÓN ·` y guarda evidencia privada en `.demo/` también al fallar.

El E2E real de PR #99 pasó en producción: dos planes HappyRobot aceptados/aplicados, B 450 + Lounge 150, idempotencia y recorrido de 34,8 s. La revisión de evidencia detectó dos límites: las asignaciones solo estaban en SQLite y los especialistas eran respuestas locales de 3 s. La rama actual expone el reparto en `/state`, añade triaje 10/1/9 y autoriza una única llamada real controlada de Transporte. Falta desplegarla y repetir con el destinatario preparado.

## Qué falta, por riesgo para la demo

0. **Subir el plan de Railway.** El banner dice "$4.96 left". Si se agota, el backend y el frontend de Vercel (`zhivel.vercel.app`, apunta a Railway) se quedan sin servicio antes de la demo. Lo hace un humano con la tarjeta.
0b. **Mergear T56 (PR #101) y redesplegar.** Sin T56, un `no_answer` doble sobre una tarea con dependientes deja el plan en `replanificando` para siempre, y las condiciones de la contraparte generan rondas extra de llamadas.
1. **Superar el nuevo E2E con triaje y llamada controlada.** Debe mostrar 10/1/9, `consult_world`, B 450 + Lounge 150 en `/state`, una llamada real de Transporte con run hijo auditable y ninguna otra comunicación real.
2. **Rotar el bearer antes de la toma final.** El token inspeccionado debe sustituirse en backend, development y production sin publicarlo.
3. **Validar la conversación de Transporte.** El destinatario autorizado debe contestar; el run hijo de voz debe completar sin `user_missed_call` y quedar en la evidencia del coordinador.
4. **Superar tres ensayos HappyRobot (T52).** El hook de producción ya llega a M3; faltan tres recorridos que superen la puerta final.
5. **Superar tres ensayos API (T52).** La automatización existe, pero la puerta final aún falla por la evidencia de especialistas.
6. **Aprobar textos y storyboard (T45).** Carlos/equipo deben aprobar los dos mensajes literales y la narración congelada.
7. **Grabar toma maestra y respaldo (T52).** No se ha grabado ninguna toma.
8. **Revisión humana de T50.** El código y los tests están en `main`; la fila permanece `review`.

## Bloqueos

| Qué | Depende de | Externo |
|---|---|---|
| Servicio en Railway | crédito de prueba casi agotado; hay que pagar el plan | Sí |
| Rotar bearer | owner actualiza backend, development y production con el mismo valor oculto | Parcial |
| Llamada real de Transporte | destinatario confirma que puede contestar durante el E2E; el run de voz debe completar sin `user_missed_call` | Sí |
| Superar la puerta final T52 | mergear esta rama y pasar triaje, reparto público, llamada única, muelle Sur e idempotencia | No |
| Grabar T52 | tres ensayos superados y ordenador de grabación | Parcial |

## Ramas vivas sin mergear

- `fix/pep-deps-retry` (T56, PR #101): dependencias con `:retry`, sin replan por condiciones, resumen de atasco legible.
- `origin/feat/events-history`: `GET /events/history`; pendiente de revisar y mergear.
- `origin/feat/pep-take-call`: cambios de executor/engine sobre una base anterior; no integrar sin revisar contra T46–T51.
- `origin/Prueba-de-plataforma-y-llamada-real`: implementación antigua con servidor Python y frontend propio; no incorporar sobre `main` a ciegas.
- `origin/feat/pep-afluencia`: aparece como no mergeada, pero no aporta diff útil frente al `main` actual.
- `origin/docs/estado-1200`: fotografía antigua.

Las ramas `feat/t52-happyrobot-primary-demo`, `feat/devin-transcripcion`, `feat/zhi-demo-recording-readiness`, `feat/ventura-demo-staff-coordination`, `feat/ventura-demo-specialists`, `feat/ventura-demo-incidents-ui`, `feat/ventura-happyrobot-incident-inputs`, `feat/ventura-demo-director` y `docs/ventura-video-scenario` ya están mergeadas.

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
- T44 forma parte del camino crítico por D20. No grabar hasta que el E2E demuestre dos planes HappyRobot aplicados sin reintentos ni errores de validación.
- Después de desplegar T55: filtra los logs de Railway por `"bucle"` durante 10 minutos; debe aparecer solo tras inputs reales, no cada 20 s. En `/state.calls` nunca debe haber más de una llamada `simulated:false` en `en_curso`.
