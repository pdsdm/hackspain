# Estado del proyecto

> Foto verificada de `origin/main`. Actualizar esta página después de cada merge relevante.

| | |
|---|---|
| **Foto tomada** | 19 de septiembre de 2026, 22:05 CEST |
| **Base** | `6817259` — PR #77, director reproducible de vídeo |
| **Entrega** | domingo 20 a las 11:00, hora de Madrid |
| **Generado por** | Devin |

## Salud

| Comprobación | Resultado |
|---|---|
| `make check` sobre `6817259` | **OK** |
| Tests backend | 332: **325 pasan, 0 fallan, 7 live omitidos** |
| Lint y builds | Backend y frontend OK |
| Fixtures | 10 JSON reproducibles OK |
| Node verificado | 23.10.0; el repo exige ≥22.13 |

Persisten dos avisos de lint previos (`openaiUsable` y optional chaining en un test) y el aviso del chunk frontend mayor de 500 kB.

## Qué funciona

### Base operativa

- Estado SQLite, cola serial por `planVersion`, callbacks idempotentes y frontend en modo API.
- Coordinador Helmcode/DeepSeek; T44 HappyRobot Reasoning Agent sigue en shadow y no cambia el proveedor principal.
- Cuatro especialistas visibles: Espacios, Catering, Transporte y Asistentes.
- Cierre honesto mediante `resolved`, `closureSummary` o `coordinatorStatus: atascado`.
- Costes informativos; no bloquean la recuperación ni crean aprobaciones económicas.

### Camino de vídeo T45–T51

- **T45, en revisión:** `docs/video-scenario.md` congela relato, textos, checkpoints, widgets, etiquetas de simulación y finales principal/respaldo; falta aprobación literal de Carlos/equipo.
- **T46, PR #71:** `POST /workflow/happyrobot/events` acepta solo `principal_pipe_burst` y `dock_blocked`, con bearer, idempotencia, serialización y procedencia `call | sms`.
- **T50, PR #73:** el coordinador conoce seis personas de recepción, las coordina mediante Asistentes y permite que Catering dependa de la apertura del muelle.
- **T51 parcial, PR #74:** Catering y Asistentes actualizan entregas, informados y `lastResult`; las necesidades de accesibilidad/dieta generan una tarea separada.
- **T49, PR #75, cerrada:** overlay de incidencias activas y cronología con canal, actor y etiqueta de simulación, derivados de `CrisisState`. Revisión exacta: 1920×1080 sin solapes ni scroll horizontal; 390×844 muestra solo cronología y formulario.
- **T47, PR #76:** instalador idempotente del workflow `Demo Incident Inputs`, bearer oculto y POST estricto a T46.
- **T48, PR #77:** director reproducible con `--inputs=happyrobot|external|api`, reset, checkpoints y cues de grabación.

Los dos incidentes se probaron localmente contra T46: Principal cerró, Muelle Este cerró y las entregas quedaron bloqueadas. El recorrido HappyRobot completo no se ha ejecutado porque falta crear/publicar el workflow.

## Qué falta, por riesgo para la demo

1. **Crear y publicar `Demo Incident Inputs` (T47).** La API key actual devuelve `403 Cannot create use cases`. Un owner debe ejecutar el instalador o crearlo en la UI.
2. **Ejecutar una toma HappyRobot completa (T48/T52).** Falta rellenar `HAPPYROBOT_DEMO_INPUT_WORKFLOW_ID` y correr el director con `--inputs=happyrobot`.
3. **Completar Transporte (T13/T51).** La parte de Álvaro continúa `todo`; Catering y Asistentes ya están integrados.
4. **Aprobar textos y storyboard (T45).** Carlos/equipo deben aprobar los dos mensajes literales y la narración congelada.
5. **Ensayo y grabación final (T52).** Falta repetir el recorrido desde `calm`, guardar una toma HappyRobot y otra con `--inputs=api`.
6. **Revisión humana de T50.** El código y los tests están en `main`; la fila permanece `review`.

## Bloqueos

| Qué | Depende de | Externo |
|---|---|---|
| Publicar workflow T47 | API key/usuario HappyRobot con permiso owner | Sí |
| Cerrar T51 | Transporte de Álvaro | No |
| Cerrar T48/T52 | workflow T47 publicado y ensayo en el ordenador de grabación | Parcial |

## Ramas vivas sin mergear

- `origin/feat/pep-take-call`: cambios de executor/engine sobre una base anterior; no integrar sin revisar contra T46–T51.
- `origin/Prueba-de-plataforma-y-llamada-real`: implementación antigua con servidor Python y frontend propio; no incorporar sobre `main` a ciegas.
- `origin/feat/pep-afluencia`: aparece como no mergeada, pero no aporta diff útil frente al `main` actual.
- `origin/docs/estado-1200`: fotografía antigua.

Las ramas `feat/ventura-demo-staff-coordination`, `feat/ventura-demo-specialists`, `feat/ventura-demo-incidents-ui`, `feat/ventura-happyrobot-incident-inputs` y `feat/ventura-demo-director` ya están mergeadas mediante PRs #73–#77.

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

- Para la toma principal:

```bash
cd backend
npm run demo:video -- --inputs=happyrobot
```

- Respaldo reproducible:

```bash
cd backend
npm run demo:video -- --inputs=api
```

- T44 continúa fuera del camino crítico. No activarlo como coordinador principal antes de un E2E separado.
