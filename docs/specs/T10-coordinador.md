# T10: Coordinador

## Qué y para qué

El agente que decide. Recibe el `CrisisState` y devuelve, en JSON, qué ha cambiado, qué acciones lanzar ahora (cada una con su porqué) y qué hay que escalar al humano. Desbloquea el resto del sistema: sin él los especialistas no reciben órdenes y el panel corre sobre la simulación con guion.

## Criterios de aceptación

- [ ] Acepta como entrada un `CrisisState` completo (`frontend/src/domain/types.ts`) sin pedir campos que no existan en él.
- [ ] Ante el estado inicial (Pabellón Principal cerrado, nada confirmado) devuelve al menos una `action` con `area: "espacios"`, `objective`, `counterpart` y `dueAt`.
- [ ] Cada `action` lleva `reason` en una frase, y el panel la muestra tal cual sin reescribirla.
- [ ] T37: emite `estimatedCost` independiente de `decision`; nunca escala por importe. Solo una elección operativa explícita puede generar `decision.kind: operational`.
- [ ] No emite cobertura: asigna `guestGroups[].assignedSpaceId` y la suma asignada a un espacio nunca supera su `capacity`. Los totales los deriva el panel con `kpis()`.
- [ ] Un espacio sin aceptación verificable sale como `propuesto`, `en_consulta` o `aceptado_condiciones`, nunca como `confirmado`.
- [ ] Las acciones independientes salen con `dependsOn` vacío; las que esperan una condición la citan.
- [ ] Devuelve JSON válido en 10 ejecuciones seguidas: claves en inglés camelCase, valores de enum en español tal como los define `types.ts`, y tiempos en segundos desde medianoche (12:15 = 44100).

## Fuera de alcance

- El bucle de ejecución y el envío real de las acciones (backend).
- Validar aforo y consistencia de importes: el coordinador propone, el backend valida. No hay topes presupuestarios.
- Integración con HappyRobot y persistencia del estado.
- Reservar espacios o comprometer gasto por su cuenta.

## Notas

- Salida: `reading`, `planVersion`, `coordinatorStatus`, `actions[]`, `commitments[]`, `decision`, `unverified[]`. Cada campo aterriza en una estructura que el panel ya pinta: `actions` en `agents[]` y `commitments[]`, `decision` en `Decision` (`DecisionCard.tsx`), `reading` en un `TimelineEvent`.
- **Dependencia:** `reason` en `Agent` y `rationale` en `Decision` no existen todavía en `types.ts`. Hay que pedírselos a Pepe y actualizar `docs/api-contract.md` en el mismo PR.
- Se puede desarrollar contra un `CrisisState` de ejemplo tomado de `frontend/src/domain/initialState.ts`, sin esperar al estado en el backend (T7).
- Responsabilidades del coordinador: §6.1 de [`escenario/escenario.md`](../../escenario/escenario.md).
