# T17 — Integración y pruebas críticas

## Objetivo

Demostrar el recorrido real del motor: evento libre → coordinador → propuesta con coste informativo → llamada sin aprobación económica → callback → giro → replanificación. Las decisiones operativas se verifican por separado (T38).

## Criterios de aceptación

- Un test integrado arranca desde `calm`, inyecta la salida estructurada que se espera de Helmcode y atraviesa la API del panel.
- Una propuesta de 6.000 € conserva esa previsión y despacha sin aprobación económica; no crea decisiones por importe ni compromete dinero al proponer.
- El adaptador `sim` abre una llamada marcada como simulada y un callback autenticado a `/workflow/results` la termina. El resultado registra el coste comprometido explícito una sola vez; un replan conserva costes anteriores aunque el total supere los límites legacy.
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

## Estado verificado — 19/09/2026

Hecho en `fix/zhi-demo-readiness`:

- El recorrido automatizado cumple los criterios locales y `make check` pasa.
- Helmcode usa `reasoning_effort=low`, no crea aprobaciones económicas y despacha el plan.
- Los callbacks aceptados son idempotentes; un callback adverso de una `planVersion`
  obsoleta conserva evidencia pero no vuelve a lanzar el coordinador.
- `verificationTarget` fuera de la demo no invalida el plan y las operaciones `set_place`
  sobre ids `gate-*` se normalizan a `set_gate`.

Pendiente para cerrar T17:

- Repetir en una sola ejecución `evento → Helmcode → llamada HappyRobot real → callback →
  lounge_unavailable → replan` con un actor controlado.
- Conservar evidencia del callback y terminar con cero acciones abiertas y cero llamadas
  `en_curso`. La primera llamada real informada por el equipo no cubre por sí sola este
  recorrido completo tras los fixes.
