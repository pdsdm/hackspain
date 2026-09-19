# T49: incidencias activas y procedencia en el frontend

## Qué y para qué

Hacer visibles a la vez el Principal cerrado y el Muelle bloqueado, su impacto y el canal real que los reportó, sin crear una segunda fuente de estado.

## Criterios de aceptación

- [x] Overlay compacto con máximo tres incidencias derivadas de `CrisisState`.
- [x] Principal muestra cierre, 600 VIP afectados y canal de llamada.
- [x] Muelle muestra bloqueo, servicios afectados y canal SMS.
- [x] Marcadores, rutas y entregas usan los estados reales y destacan cambios.
- [x] Cronología distingue voz, SMS, sistema y simulado cuando haya procedencia.
- [ ] No tapa KPIs, coordinador, llamada ni resultado a 1920×1080.
- [x] En móvil se conserva la cronología y el envío de eventos.
- [x] Lint y build pasan.

## Fuera de alcance

Rediseñar todo el dashboard o mostrar dos transcripciones simultáneas.
