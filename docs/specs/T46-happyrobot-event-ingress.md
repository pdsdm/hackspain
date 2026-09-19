# T46: entrada autenticada de incidentes HappyRobot

## Qué y para qué

Recibir informes de llamada y SMS desde HappyRobot como incidentes idempotentes y trazables, tanto en un ensayo real como en la demo simulada. HappyRobot identifica el hecho; el backend aplica un efecto permitido y conserva la autoridad del estado.

## Criterios de aceptación

- [ ] `POST /workflow/happyrobot/events` exige `HAPPYROBOT_WEBHOOK_TOKEN`.
- [ ] Contrato: `eventId`, `channel`, `actor`, `incidentId`, `summary`, `evidence.sessionId`.
- [ ] `principal_pipe_burst` cierra Principal e invalida el plan original; `dock_blocked` reutiliza el efecto existente.
- [ ] Allowlist estricta: el workflow no envía operaciones ni parches de estado.
- [ ] `eventId` duplicado no vuelve a aplicar ni coordinar.
- [ ] Eventos casi simultáneos se procesan en orden sobre el estado/versión vigentes.
- [ ] Canal y actor quedan disponibles para cronología; campos nuevos son opcionales y retrocompatibles.
- [ ] Contrato API y tests de auth, duplicado, orden y payload inválido actualizados.

## Fuera de alcance

Configurar números de HappyRobot o cambiar el proveedor LLM del coordinador.
