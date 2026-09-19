# T8: Dashboard y plano Norte/Sur

Responsable: Carlos. Rama: `feat/carlos-dashboard`. Base: diseño Zhivel integrado en `a7e94ec`.

## Qué y para qué
Entender situación, cambios e intervención desde una pantalla. Conservar la marca y el diseño del equipo y consumir el `CrisisState` vigente, sin endpoints nuevos.

## Criterios de aceptación
- [ ] Resumen legible de impacto, cuatro KPIs diferenciados y cuenta atrás; cuatro especialistas con actividad.
- [ ] Comparación antes → ahora persistente, con hora de referencia explícita, diferencias de recursos/acuerdos/grupos/presupuesto y posibilidad de fijar una nueva referencia. El reloj y la selección no generan cambios operativos.
- [ ] Plano esquemático Norte/Sur usable sin tiles externos, sin cruce interior, con accesos, espacios, muelles, espera y vehículos seleccionables; recursos cambiados resaltados. Mapa geográfico conservado como vista alternativa.
- [ ] Intervención visible, decisión con efectos y acciones bloqueadas cuando no corresponden; diálogos con cierre y acceso por teclado.
- [ ] API con carga inicial, último estado recibido, aviso de desconexión/datos antiguos y feedback de envío; datos simulados claramente identificados.
- [ ] Fixtures de T5 disponibles para ensayo. Verificar crisis, aprobación, caída de Lounge y reducción de aforo, reinicio y comparación.
- [ ] Pruebas de diferencias, `make check`, comprobación visual a 1366×768 y tamaño móvil.

## Fuera de alcance
Motor/backend T7/T16, workflows HappyRobot, permisos de negocio T15 y nueva cartografía real. La comparación solo abarca esta sesión; no sustituye el historial persistente del backend.
