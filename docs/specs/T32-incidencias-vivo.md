# T32: Generador de incidencias en vivo con semilla

## Qué y para qué

Un «Modo vivo» que, con semilla, lanza microincidencias que nadie ha elegido sobre accesos, vehículos, paddock y catering. Entran por el mismo camino que `POST /events`, así que el coordinador responde a algo fuera de la lista de giros. Es el bloque «¿es un guion?» del pitch. Plan: [`../plan-mundo-dinamico.md`](../plan-mundo-dinamico.md).

## Criterios de aceptación

- [x] Catálogo de 18 incidencias en `backend/src/domain/incidents.ts` (12 originales + 6 sobre parkings, paddock, taxis, VIP y repartidores de T29–T31), cada una con texto, efecto determinista sobre el estado y área. Ninguna repite un giro de `TWIST_IDS`.
- [x] `POST /simulation/live { enabled: boolean, seed?: number }` y `SIM_INCIDENTS=on|off`. Por defecto apagado. `GET /state` expone `clock.live: boolean`.
- [x] Con el modo encendido, el tick lanza como máximo una incidencia cada 3 minutos simulados y nunca mientras `coordinatorStatus` sea `replanificando` o `esperando_decision`.
- [x] Cada incidencia aplica su efecto, añade `incidencia` a la cronología y crea el evento del coordinador. En `rules` solo se aplica y se registra.
- [x] Misma semilla, misma secuencia de incidencias. Test con semilla fija.
- [x] Interruptor «Modo vivo» junto al panel de giros en el frontend, con la semilla visible.
- [ ] A `CLOCK_SPEED=30` desde `calm` con LLM, en 10 minutos reales caen al menos 3 incidencias distintas y el coordinador responde a cada una sin acumular llamadas `en_curso`.
- [x] `make check` pasa.

## Fuera de alcance

- Incidencias que exijan una llamada real.
- Aprendizaje entre ejecuciones (T20).

## Estado (sábado 19, Pep)

- Hecho sobre el mundo actual (shuttles BUS-01..04, accesos, muelles, CAT-01/02, grupos), porque T29–T31 no están. Cuando lleguen, añadir entradas al catálogo con taxis, VIP y repartidores.
- Sin verificar: el criterio de `CLOCK_SPEED=30` con LLM durante 10 minutos reales. Necesita una clave de proveedor.
- Cada incidencia entra al coordinador como evento `source: clock`, `kind: incident`.

## Notas

- Depende de T29, T30 y T31. Solo se hace si el recorrido de las 18:00 corre entero con LLM.
- Archivos: `backend/src/domain/{incidents,clock,engine}.ts`, `backend/src/app.ts`, `frontend/src/components/right/` (panel de giros), `docs/api-contract.md`.
- Zona: backend → Pep con revisión de Zhi; frontend → Pep; carga del coordinador → Ventura.
