# T3: contrato backend, frontend y workflows

## Qué y para qué

Cerrar formatos y semántica para que panel, coordinador y especialistas trabajen en paralelo sin inventar IDs, estados ni reglas de aplicación.

## Criterios de aceptación

- [x] `docs/api-contract.md` define estado, errores, intervenciones, giros, reset, propuestas del coordinador y resultados de especialistas.
- [x] Todo mensaje de workflow lleva `eventId`, `runId` y `planVersion`; acciones y resultados llevan además `taskId` cuando corresponde.
- [x] El backend valida cuerpos y enums, devuelve errores JSON y persiste las mutaciones públicas publicadas.
- [x] Propuestas duplicadas son idempotentes; propuestas de otra ejecución o versión reciben `409` sin cambiar estado ni despachar tareas.
- [x] Resultados duplicados o antiguos quedan como evidencia, pero solo un resultado de la ejecución y versión vigentes actualiza el panel.
- [x] Los endpoints de workflow exigen `Authorization: Bearer $HAPPYROBOT_WEBHOOK_TOKEN`; el secreto no aparece en código ni respuestas.
- [x] Los tipos públicos admiten `Agent.reason` y `Decision.rationale` sin romper los fixtures existentes.
- [x] Hay pruebas HTTP del recorrido contractual y `make check` pasa.

## Fuera de alcance

- Crear workflows o llamadas reales en HappyRobot, prompts de T10–T14 y replanificación específica de T16.
- Confiar en un workflow para confirmar recursos, comprometer gasto o saltarse las reglas deterministas de T7.
