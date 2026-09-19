# T16: Replanificación e invalidación de acuerdos

## Qué y para qué

Cuando el jurado mete un giro en directo, decide qué plan nuevo se propone y a quién hay que volver a avisar. Es lo que demuestra el criterio de adaptación de la evaluación.

## Criterios de aceptación

- [ ] Ante el giro `lounge_unavailable`, invalida los `commitments` que dependían del Lounge Sur y propone un plan nuevo con `planVersion` incrementada.
- [ ] Lista a quién hay que volver a contactar: los `guestGroups` con `informedCount > 0` cuyo `assignedSpaceId` cambia, indicando el canal.
- [ ] Si no hay solución completa lo dice con números («450 plazas confirmadas en Sur, 150 personas sin ubicación») y deja `resolved` en `false`.
- [ ] Ante `reject_split` (el organizador no acepta dividir la hospitalidad), descarta Pabellón B + Lounge Sur y evalúa Norte C, con su `readyAt: 49500` y el retraso que implica.
- [ ] Ante `pabellon_b_400`, detecta que la cobertura baja a 550 y no declara el plan viable.
- [ ] El plan nuevo respeta la separación Norte/Sur: reubicar entre zonas exige un traslado acordado, nunca un paso a pie.
- [ ] No propone volver a avisar a quien ya tiene la instrucción vigente correcta.

## Fuera de alcance

- La invalidación mecánica en cascada de los compromisos (backend).
- El panel de simulación desde el que el jurado introduce el giro (ya existe en `SimulacionPanel.tsx`).
- Reintentos de envío y deduplicación de notificaciones.

## Notas

- Los nueve giros posibles son el tipo `TwistId` de `frontend/src/domain/types.ts`; no hay que inventar otros. Su descripción está en §9 de [`escenario/escenario.md`](../../escenario/escenario.md).
- Reutiliza el formato de salida de T10; la replanificación no introduce un esquema nuevo.
- Estados de un compromiso: `CommitmentStatus` en `types.ts` y §7 del escenario.
