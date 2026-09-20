# T44: HappyRobot Reasoning Agent como coordinador principal

## Qué y para qué

Ejecutar los dos ciclos de la demo con la arquitectura nativa de HappyRobot: workflow `Orquestador`, Reasoning Agent `gpt-5.6-luna-low` y herramientas `consult_world` / `submit_plan`. El backend conserva la autoridad: valida, rechaza o aplica el plan.

## Criterios de aceptación

- [ ] La toma usa `COORDINATOR_HARNESS=happyrobot` y aplica exclusivamente planes aceptados por `submit_plan`.
- [ ] `POST /workflow/coordinator/happyrobot/consult` y `.../submit` rechazan sesiones, `runId` y `planVersion` obsoletos.
- [ ] `submit_plan` valida forma, reglas y operaciones antes de persistir; el Reasoning Agent corrige feedback estructurado.
- [ ] Los incidentes `principal_pipe_burst` y `dock_blocked` producen dos runs y dos correlaciones distintas del coordinador.
- [ ] Cada ciclo se acepta en un único `submit_plan`, sin `validationErrors`.
- [ ] El primer plan usa B 450 + Lounge 150 y cinco acciones: B, Lounge, Catering, Transporte y Asistentes.
- [ ] El segundo plan incorpora el muelle bloqueado y cambia Catering, Transporte y Asistentes.
- [ ] Los cuatro especialistas muestran `objective`, `reason` y `lastResult`; sus comunicaciones siguen etiquetadas como `sim`.
- [ ] Si HappyRobot falla, el backend no oculta una segunda inferencia: informa del fallo y usa solo el respaldo determinista disponible.
- [ ] El E2E real audita runs, nodos, latencia, idempotencia, cierre y ausencia de comunicaciones reales.
- [ ] `make check` pasa sin llamar a proveedores externos.

## Fuera de alcance

Telefonía real para los dos inputs, activar acciones reales de especialistas o comparar proveedores en la toma.

## Notas

Decisión D20: HappyRobot es el coordinador principal de la demo; sustituye a D15 para la toma final. El contenido de llamada y SMS sigue siendo simulado y se presenta como tal.
