# T47: llamada y SMS reales de entrada

## Qué y para qué

Dos workflows HappyRobot en `development` comunican los incidentes congelados de T45 al endpoint T46: voz para el cierre del Principal y SMS para el bloqueo del muelle.

## Criterios de aceptación

- [ ] Llamada entrante o Web Call real ejecuta `report_incident(principal_pipe_burst)`.
- [ ] SMS real sobre número HappyRobot, Twilio o Telnyx ejecuta `report_incident(dock_blocked)`.
- [ ] `channel`, `actor`, URL, token y session ID son variables/fijos del workflow, no valores inventados.
- [ ] La herramienta solo expone incidentes del allowlist y recibe respuesta estructurada.
- [ ] Cada canal crea un único evento con evidencia revisable en Runs.
- [ ] Ambos inputs pueden lanzarse con pocos segundos de diferencia.
- [ ] Credenciales solo en variables de entorno de HappyRobot.
- [ ] URLs, versión publicada y procedimiento de ensayo quedan documentados sin secretos.

## Fuera de alcance

Modificar workflows salientes o sustituir el coordinador por T44.
