# T52: integración, ensayo y grabación final

## Qué y para qué

Validar y grabar el recorrido congelado con inputs y coordinador HappyRobot reales, especialistas simulados y supervisión humana visible.

## Criterios de aceptación

- [ ] Desde `calm`, dos runs HappyRobot crean `principal_pipe_burst` y `dock_blocked` exactamente una vez y conservan canal, actor y evidencia.
- [ ] El operador puede pausar y reanudar sin mutar `planVersion`.
- [ ] M1 se ve en menos de dos segundos: Principal cerrado y 600 VIP afectados.
- [ ] M2 muestra B 450 + Lounge 150, prioridad de sede y acciones con owner/reason de las cuatro áreas.
- [ ] M3 ocurre después de M2, bloquea Muelle Este y CAT-01/CAT-02, y fuerza una segunda correlación del coordinador.
- [ ] M4 cambia Catering, Transporte y Asistentes; no repite el primer plan ni propone recursos inventados.
- [ ] Los dos ciclos provienen de HappyRobot, se aplican en un único `submit_plan` y no tienen errores de validación.
- [ ] Los especialistas usan `sim`, terminan con `objective`, `reason` y `lastResult`, y no dejan tareas o llamadas abiertas.
- [ ] El final es `resolved` o `atascado` con `closureSummary`; nunca promete servicio completo con condiciones abiertas.
- [ ] Un tercer run con el mismo `eventId` devuelve `duplicate: true` y no muta el estado.
- [ ] La evidencia incluye runs/nodos HappyRobot, versiones, tiempos por fase y latencia media/mediana de HappyRobot.
- [ ] El recorrido completo pasa tres veces sin redeploys ni resets concurrentes; `make check` pasa.
- [ ] Se graban toma maestra HappyRobot y respaldo API, ambos etiquetando correctamente lo simulado.
- [ ] Voz y subtítulos no afirman telefonía real, aprendizaje inexistente ni resolución falsa.

## Fuera de alcance

Comparar proveedores, activar llamadas reales de especialistas o añadir incidentes fuera del storyboard.
