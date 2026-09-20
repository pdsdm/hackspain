# T44: HappyRobot Reasoning Agent como coordinador principal

## Qué y para qué

Ejecutar los dos ciclos de la demo con la arquitectura nativa de HappyRobot: workflow `Orquestador`, Reasoning Agent `gpt-5.6-luna-low` y herramientas `consult_world` / `submit_plan`. El backend conserva la autoridad: valida, rechaza o aplica el plan.

## Criterios de aceptación

- [ ] La toma usa `COORDINATOR_HARNESS=happyrobot` y aplica exclusivamente planes aceptados por `submit_plan`.
- [ ] `POST /workflow/coordinator/happyrobot/consult` y `.../submit` rechazan sesiones, `runId` y `planVersion` obsoletos.
- [ ] `submit_plan` valida forma, reglas y operaciones antes de persistir; el Reasoning Agent corrige feedback estructurado.
- [ ] `inbox_batch` y `dock_blocked` producen dos runs y dos correlaciones distintas; el primero usa `consult_world` y persiste triaje 10/1/9.
- [ ] Cada ciclo se acepta en un único `submit_plan`, sin `validationErrors`.
- [ ] El primer plan usa B 450 + Lounge 150 y cinco acciones: B, Lounge, Catering, Transporte y Asistentes.
- [ ] El segundo plan incorpora el muelle bloqueado y cambia Catering, Transporte y Asistentes.
- [ ] Los cuatro especialistas muestran `objective`, `reason` y `lastResult`; el coordinador puede invocar una vez `emitir_llamada` para Transporte y todas las tareas persistidas siguen `sim`.
- [ ] Si HappyRobot falla, el backend no oculta una segunda inferencia: informa del fallo y usa solo el respaldo determinista disponible.
- [ ] El E2E audita runs, nodos, latencia, idempotencia, cierre, una única llamada real autorizada y ausencia de cualquier otra comunicación real.
- [ ] `make check` pasa sin llamar a proveedores externos.

## Fuera de alcance

Telefonía real para los inputs, más de una acción real de especialista o comparar proveedores en la toma.

## Notas

Decisión D20: HappyRobot es el coordinador principal de la demo; sustituye a D15 para la toma final. El contenido de llamada y SMS sigue siendo simulado y se presenta como tal.
