# T52: integración, ensayo y grabación final

## Qué y para qué

Validar y grabar el recorrido congelado con inputs y coordinador HappyRobot reales, una llamada real controlada de Transporte, el resto de especialistas simulados y supervisión humana visible.

## Criterios de aceptación

- [ ] Desde `calm`, un lote `inbox_batch` con diez mensajes y un SMS `dock_blocked` llegan mediante runs HappyRobot y conservan canal, actor y evidencia.
- [ ] El lote se ve en menos de dos segundos; el Reasoning Agent usa `consult_world`, descarta nueve mensajes y actúa solo por la rotura.
- [ ] El operador puede pausar y reanudar sin mutar `planVersion`.
- [ ] M1 muestra Principal cerrado, 600 VIP afectados y el contador 10/1/9.
- [ ] M2 muestra B 450 + Lounge 150, prioridad de sede y acciones con owner/reason de las cuatro áreas.
- [ ] M3 ocurre después de M2, bloquea Muelle Este y CAT-01/CAT-02, y fuerza una segunda correlación del coordinador.
- [ ] M4 cambia Catering, Transporte y Asistentes; no repite el primer plan ni propone recursos inventados.
- [ ] Los dos ciclos provienen de HappyRobot, se aplican en un único `submit_plan` y no tienen errores de validación.
- [ ] La primera acción de Transporte realiza exactamente una llamada HappyRobot real al teléfono autorizado, termina con transcript y no se repite; las demás acciones usan `sim`.
- [ ] Los cuatro especialistas terminan con `objective`, `reason` y `lastResult`, sin tareas o llamadas abiertas.
- [ ] `/state.assignments` conserva B 450 + Lounge 150 y el cierre cuenta 600 asignados sin fingir plazas confirmadas.
- [ ] El final es `resolved` o `atascado` con `closureSummary`; nunca promete servicio completo con condiciones abiertas.
- [ ] Un tercer run con el mismo `eventId` devuelve `duplicate: true` y no muta el estado.
- [ ] La evidencia incluye runs/nodos HappyRobot, versiones, tiempos por fase y latencia media/mediana de HappyRobot.
- [ ] El recorrido completo pasa tres veces sin redeploys ni resets concurrentes; `make check` pasa.
- [ ] Se graban toma maestra HappyRobot y respaldo API, ambos etiquetando correctamente lo simulado.
- [ ] Voz y subtítulos no afirman telefonía real, aprendizaje inexistente ni resolución falsa.

## Fuera de alcance

Comparar proveedores, activar llamadas reales de especialistas o añadir incidentes fuera del storyboard.
