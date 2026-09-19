# T31: Actores móviles — taxis, VIP y repartidores de última hora

## Qué y para qué

Colección nueva `vehicles` con tres tipos de actor que hoy no existen: taxis con invitados, traslados VIP de directores de equipo al paddock y repartidores de última hora. Se mueven en el mapa, llegan, se retienen y el coordinador los puede desviar. Plan: [`../plan-mundo-dinamico.md`](../plan-mundo-dinamico.md).

## Criterios de aceptación

- [ ] `CrisisState.vehicles?: Vehicle[]` opcional, con el tipo definido en el plan (§3, T31). `shuttles` y `deliveries` no cambian. Los 7 fixtures cargan sin `vehicles`.
- [ ] `calm.json` y el seed traen 3 VIP → `paddockNorte`, 4 taxis → `accesoSur`, 2 repartidores → `muelleSur` y `muelleEste`, cada uno con `counterpart` y un contacto de prueba en `contacts`.
- [ ] El tick pone `llegado` al pasar `arriveAt` y anota la llegada en la cronología. Un vehículo `retenido` no avanza.
- [ ] Operación del coordinador `redirect_vehicle { id, destinationId, note }`, validada como `redirect_delivery` (destino existente, no `cerrado`, misma zona o traslado). `scenario.ts` describe los vehículos al LLM.
- [ ] Con el giro `dock_blocked`, el coordinador LLM desvía al repartidor de `muelleEste` a otro muelle; en `rules` se registra sin desviar.
- [ ] El mapa pinta cada tipo con icono propio y ruta animada, reutilizando `vehicleIcon`.
- [ ] `make check` pasa.

## Fuera de alcance

- Llamadas reales a taxis o repartidores: van por `sim` etiquetado.
- Incidencias automáticas (T32).

## Notas

- Archivos: `frontend/src/domain/types.ts`, `backend/src/domain/clock.ts`, `backend/src/domain/apply-coordinator.ts`, `backend/src/agents/coordinator/{prompt,scenario,validate}.ts`, `frontend/src/components/map/CrisisMap.tsx`, `docs/api-contract.md`.
- Zona: tipo, seed y tick → Zhi; mapa → Pep; operación y prompt → Ventura.
- Solo empieza si el LLM responde en < 15 s (decisión #5 de `plan-sabado.md`). Sin LLM son marcadores que se mueven.
