# T7: estado persistente, reglas y despacho

## Qué y para qué

Persistir cada ejecución de la crisis y ejecutar propuestas mediante reglas deterministas, sin duplicar efectos ni aceptar resultados obsoletos.

## Criterios de aceptación

- [x] Una ejecución se crea desde los fixtures T5 y `GET /state` devuelve su `CrisisState` completo tras reiniciar el backend.
- [x] El estado conserva campos desconocidos del contrato y usa segundos desde medianoche y `planVersion`.
- [x] Las asignaciones no duplican invitados ni exceden aforo; Norte exige acceso y traslado confirmados.
- [x] El gasto superior a `budget.autonomousLimit` crea una decisión pendiente y no se compromete sin aprobación.
- [x] Cambiar de plan incrementa la versión e invalida compromisos activos de versiones anteriores.
- [x] Las tareas usan claves idempotentes; resultados duplicados o de otra ejecución/versión quedan como evidencia sin mutar el estado.
- [x] La cola solo despacha tareas de la ejecución activa y del `planVersion` vigente; las de planes anteriores no generan llamadas.
- [x] Tests y `make check` pasan.

## Fuera de alcance

- Llamadas reales, prompts del coordinador y controles de intervención pendientes de T3/T9/T10/T15.

## Notas

- `frontend/src/domain/types.ts` define el contrato público; SQLite puede guardar datos operativos auxiliares que `/state` no expone.
- Los campos `scriptId`, `scriptCursor` y `nextScriptAt` son constantes de compatibilidad en el backend.
