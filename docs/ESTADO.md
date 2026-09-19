# Estado del proyecto

> Foto verificada de `origin/main` más el slice T52 de esta rama. Actualizar esta página después de cada merge relevante.

| | |
|---|---|
| **Foto tomada** | 19 de septiembre de 2026, 22:50 CEST |
| **Base** | `d704a3c` — PR #79, escenario y storyboard de vídeo |
| **Entrega** | domingo 20 a las 11:00, hora de Madrid |
| **Generado por** | Devin, durante T52 |

## Salud

| Comprobación | Resultado |
|---|---|
| `make check` sobre `d704a3c` + cambios T52 | **OK** |
| Tests backend | 333: **326 pasan, 0 fallan, 7 live omitidos** |
| Tests focalizados T46/T52 | 7: **7 pasan, 0 fallan** |
| Lint y builds | Backend y frontend OK |
| Fixtures | 10 JSON reproducibles OK |
| Node verificado | 22.23.2; el repo exige ≥22.13 |

Persisten dos avisos de lint previos (`openaiUsable` y optional chaining en un test) y el aviso del chunk frontend mayor de 500 kB.

## Qué funciona

### Base operativa

- Estado SQLite, cola serial por `planVersion`, callbacks idempotentes y frontend en modo API.
- Coordinador Helmcode/DeepSeek; T44 HappyRobot Reasoning Agent sigue en shadow y no cambia el proveedor principal.
- Cuatro especialistas visibles: Espacios, Catering, Transporte y Asistentes.
- Cierre honesto mediante `resolved`, `closureSummary` o `coordinatorStatus: atascado`.
- Costes informativos; no bloquean la recuperación ni crean aprobaciones económicas.

### Camino de vídeo T45–T52

- **T45, PR #79, en revisión:** `docs/video-scenario.md` congela relato, textos, checkpoints, widgets, etiquetas de simulación y finales principal/respaldo; falta aprobación literal de Carlos/equipo.
- **T46, PR #71:** `POST /workflow/happyrobot/events` acepta solo `principal_pipe_burst` y `dock_blocked`, con bearer, idempotencia, serialización y procedencia `call | sms`.
- **T50, PR #73:** el coordinador conoce seis personas de recepción, las coordina mediante Asistentes y permite que Catering dependa de la apertura del muelle.
- **T51 parcial, PR #74:** Catering y Asistentes actualizan entregas, informados y `lastResult`; las necesidades de accesibilidad/dieta generan una tarea separada.
- **T49, PR #75:** overlay de incidencias activas y cronología con canal, actor y etiqueta de simulación, derivados de `CrisisState`.
- **T47, PR #76:** instalador idempotente del workflow `Demo Incident Inputs`, bearer oculto y POST estricto a T46.
- **T48, PR #77:** director reproducible con `--inputs=happyrobot|external|api`, reset, checkpoints y cues de grabación.
- **T52, rama actual:** el director admite `--rehearsals=N`, valida M0/M2/M3/final con `/state` y `/actions`, mantiene `SIMULACIÓN ·` y guarda evidencia privada en `.demo/` también al fallar.

Un ensayo API local real desde `calm` alcanzó M0, M2 y M3: Principal cerró, los dos inputs conservaron canal/actor/evidencia, Muelle Este cerró y CAT-01/CAT-02 quedaron bloqueadas. La puerta final falló honestamente porque en modo `rules` los cuatro especialistas no exponen `reason` ni `lastResult`; no hubo run HappyRobot ni grabación.

## Qué falta, por riesgo para la demo

1. **Crear y publicar `Demo Incident Inputs` (T47).** La API key actual devuelve `403 Cannot create use cases`. Un owner debe ejecutar el instalador o crearlo en la UI.
2. **Completar la evidencia de especialistas (T51/T52).** El ensayo API local detecta que los cuatro agentes carecen de `reason` y `lastResult` en el recorrido `rules`; Transporte sigue sin cerrar.
3. **Superar tres ensayos HappyRobot (T52).** Falta rellenar `HAPPYROBOT_DEMO_INPUT_WORKFLOW_ID` y correr `--inputs=happyrobot --rehearsals=3`.
4. **Superar tres ensayos API (T52).** La automatización existe, pero la puerta final aún falla por la evidencia de especialistas.
5. **Aprobar textos y storyboard (T45).** Carlos/equipo deben aprobar los dos mensajes literales y la narración congelada.
6. **Revisión visual (T49).** Falta validar que el overlay no tapa KPIs, llamada, coordinador o resultado a 1920×1080.
7. **Grabar toma maestra y respaldo (T52).** No se ha grabado ninguna toma.
8. **Revisión humana de T50.** El código y los tests están en `main`; la fila permanece `review`.

## Bloqueos

| Qué | Depende de | Externo |
|---|---|---|
| Publicar workflow T47 | API key/usuario HappyRobot con permiso owner; la key actual responde `403` | Sí |
| Ensayos HappyRobot T52 | T47 publicado y `HAPPYROBOT_DEMO_INPUT_WORKFLOW_ID` configurado | Sí |
| Superar la puerta API T52 | `reason` y `lastResult` coherentes en los cuatro especialistas; cerrar Transporte T51 | No |
| Cerrar T49 | revisión visual de Carlos/equipo | No |
| Grabar T52 | tres ensayos superados y ordenador de grabación | Parcial |

## Ramas vivas sin mergear

- `origin/feat/pep-take-call`: cambios de executor/engine sobre una base anterior; no integrar sin revisar contra T46–T51.
- `origin/Prueba-de-plataforma-y-llamada-real`: implementación antigua con servidor Python y frontend propio; no incorporar sobre `main` a ciegas.
- `origin/feat/pep-afluencia`: aparece como no mergeada, pero no aporta diff útil frente al `main` actual.
- `origin/docs/estado-1200`: fotografía antigua.
- `feat/zhi-demo-recording-readiness` (local): slice de T52 descrito arriba; pendiente de revisión.

Las ramas `feat/ventura-demo-staff-coordination`, `feat/ventura-demo-specialists`, `feat/ventura-demo-incidents-ui`, `feat/ventura-happyrobot-incident-inputs`, `feat/ventura-demo-director` y `docs/ventura-video-scenario` ya están mergeadas mediante PRs #73–#77 y #79.

## Decisiones pendientes

1. Carlos/equipo aprueban los textos literales y la narración de T45.
2. Qué owner de HappyRobot ejecuta el instalador T47.
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
- T44 continúa fuera del camino crítico. No activarlo como coordinador principal antes de un E2E separado.
