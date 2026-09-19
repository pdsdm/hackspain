# T30: Afluencia con picos y saturación de accesos

## Qué y para qué

La gente no llega en línea recta. Cada acceso sigue una curva con picos (apertura, antes de la carrera) más ráfagas aleatorias con semilla. El backend mueve los accesos en su tick; hoy solo lo hace el reducer del frontend en modo `sim`. Cuando un acceso satura, el coordinador tiene que reaccionar. Plan: [`../plan-mundo-dinamico.md`](../plan-mundo-dinamico.md).

## Criterios de aceptación

- [ ] `Gate.arrivalProfile?: { at: number; perMin: number }[]` opcional. Sin perfil, el acceso se comporta como hoy.
- [ ] El tick de `clock.ts` actualiza `entered`, `waiting`, `status` y `arrivalsPerMin` (valor efectivo del minuto) de cada acceso no cerrado. El panel en modo `api` ve moverse los accesos sin cambios en el frontend.
- [ ] PRNG propio con semilla (`SIM_SEED`; si falta, se genera en el reset y se expone en `clock.seed`). Dos ejecuciones con la misma semilla producen la misma serie de llegadas. Test con semilla fija.
- [ ] Ráfaga: con probabilidad por minuto simulado, un acceso recibe `+N` personas durante `M` minutos y la cronología lo anota como `info`.
- [ ] Saturación: `waiting` sobre umbral pone `status: saturado`, añade `incidencia` a la cronología y manda un evento al coordinador. En `COORDINATOR_MODE=rules`, regla determinista: abre el otro acceso de la misma zona si está `cerrado`.
- [ ] A `CLOCK_SPEED=60` desde `calm`, hay al menos una saturación en los primeros 10 minutos simulados.
- [ ] `make check` pasa.

## Fuera de alcance

- Ampliar el reducer `sim` del frontend.
- Vehículos e incidencias (T31, T32).

## Notas

- Fórmula de referencia: `frontend/src/domain/reducer.ts` líneas 34–42.
- Archivos: `backend/src/domain/clock.ts`, `backend/src/domain/plan-rules.ts`, nuevo `backend/src/domain/random.ts`, `docs/api-contract.md` (`clock.seed`, `arrivalProfile`).
- Zona: tick y PRNG → Zhi; regla `rules` → Ventura.
