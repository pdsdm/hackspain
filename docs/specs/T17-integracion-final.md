# T17 — Integración y pruebas críticas

## Objetivo

Demostrar el recorrido real del motor: evento libre → coordinador → propuesta con gasto → aprobación humana → llamada → callback → giro → replanificación.

## Criterios de aceptación

- Un test integrado arranca desde `calm`, inyecta la salida estructurada que se espera de Helmcode y atraviesa la API del panel.
- Una propuesta por encima del límite deja exactamente una decisión pendiente y no despacha acciones antes de aprobarla.
- Tras `approve_spend`, el adaptador `sim` abre una llamada marcada como simulada y un callback autenticado a `/workflow/results` la termina.
- Repetir el mismo callback es idempotente: no vuelve a ejecutar el coordinador ni duplica decisiones o acciones.
- `lounge_unavailable` invalida el compromiso afectado, aumenta `planVersion`, crea la acción de contingencia y termina sin llamadas `en_curso`.
- `make check` pasa.
- Antes de cerrar T17, el mismo recorrido se repite con Helmcode y una llamada HappyRobot reales; esta última validación depende de T6.

## Verificación

```bash
cd backend
node --import tsx --test test/integration-journey.test.ts
cd ..
make check
```
