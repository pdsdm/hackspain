# T15: aprobaciones, pausa y control de incidentes

## Qué y para qué

Que el humano pueda intervenir de verdad sobre la operación y que se note en lo que hace
el coordinador después: aprobar o rechazar gasto, pausar agentes, fijar una restricción y
tomar una llamada. Desbloquea el criterio «Control: ¿se entiende qué está haciendo y se
puede intervenir?» de la rúbrica.

## Criterios de aceptación

- [ ] `approve_spend` y `reject_spend` resuelven la decisión y el efecto se ve en el panel.
- [ ] `pause` detiene el despacho de nuevas acciones; el reloj sigue corriendo.
- [ ] `resume` vuelve a despachar sin duplicar lo que ya estaba en cola.
- [ ] `set_constraint` cambia lo que el coordinador propone en el siguiente ciclo (no solo
      se registra en la cronología).
- [ ] `take_call` marca la llamada como atendida por un humano y lo refleja el panel.
- [ ] **Bug de decisiones huérfanas resuelto** (ver abajo), con un test que lo cubra.

---

## Bug conocido: decisiones pendientes que sobreviven a la replanificación

> Verificado el 2026-09-19 sobre `origin/main`. No es una hipótesis: son las líneas que se
> citan. Afecta al camino exacto de la demo (aprobar los 3.200 € → giro del jurado →
> replanificación).

### El síntoma

Tras replanificar, **la decisión de la versión anterior sigue en estado `pendiente`**. Se
puede aprobar el gasto de un plan que ya no existe.

### Por qué pasa

En `backend/src/domain/plan-rules.ts`, dentro de `applyPlanProposal`:

```ts
state.planVersion += 1;                       // sube la versión

for (const commitment of state.commitments) { // los COMPROMISOS sí se invalidan
  if (commitment.planVersion < state.planVersion && …) {
    commitment.status = "invalidado";
  }
}

if (proposal.cost > state.budget.autonomousLimit) {
  state.decisions.push({ …, status: "pendiente" });   // se AÑADE una decisión nueva
  state.waitingForDecision = decisionId;              // se sobrescribe el puntero
}
```

Dos causas, una encima de la otra:

1. **`Decision` no tiene campo `planVersion`** (`frontend/src/domain/types.ts`). `Commitment`
   sí lo tiene, y por eso se puede invalidar por versión. Una decisión no sabe de qué plan
   es.
2. **Nada recorre las decisiones al replanificar.** Se empuja la nueva y se sobrescribe
   `waitingForDecision`; la anterior se queda huérfana pero con `status: "pendiente"`.

### Las dos consecuencias

**A · Se puede autorizar presupuesto de un plan muerto.**
`applyIntervention` (`backend/src/domain/control-service.ts`, ~líneas 176-191) resuelve por
el `decisionId` que llega en el payload y solo comprueba que no esté ya resuelta:

```ts
if (decision.status !== "pendiente") throw new ContractError(`Decision is already resolved…`, 409);
…
if (approved) state.budget.authorized = Math.max(state.budget.authorized, Number(decision.cost ?? 0));
```

Como la decisión vieja sigue `pendiente`, pasa la comprobación y **mueve
`budget.authorized`** con el coste de un plan descartado.

**B · El giro `reject_spend` puede rechazar la decisión equivocada.**
En `control-service.ts` línea ~106:

```ts
const pending = state.decisions.find((decision) => decision.status === "pendiente");
if (pending) pending.status = "rechazada";
state.waitingForDecision = null;
```

`find` devuelve **la primera** del array. Si hay dos pendientes, la vieja se empujó antes,
así que se rechaza la vieja, **la viva se queda pendiente** y además `waitingForDecision`
pasa a `null`, con lo que el panel deja de señalar la decisión que sí está abierta.

### Cómo reproducirlo sin LLM

```bash
# dos propuestas seguidas por encima del límite autónomo (1.500 €)
curl -X POST localhost:8000/workflow/coordinator/proposals -H 'content-type: application/json' \
  -d '{ … "cost": 3200 … }'
curl -X POST localhost:8000/workflow/coordinator/proposals -H 'content-type: application/json' \
  -d '{ … "cost": 4100 … }'

curl -s localhost:8000/state | jq '.decisions[] | {id, status, cost}'
```

**Esperado hoy (incorrecto):** dos objetos con `status: "pendiente"`.
**Esperado tras el arreglo:** una pendiente (la de la última versión) y la anterior
resuelta como obsoleta.

### Arreglo recomendado

La opción barata, que **no toca el contrato** (`CrisisState` es contrato público, D10, y
`DecisionStatus` solo admite `'pendiente' | 'aprobada' | 'rechazada'`):

En `applyPlanProposal`, **antes** de empujar la decisión nueva, marcar como `rechazada`
toda decisión que siga `pendiente`, con motivo explícito en la cronología
(«obsoleta: el plan al que pertenecía ya no está activo»). Y en el giro `reject_spend`,
resolver **la decisión apuntada por `waitingForDecision`** en vez de la primera pendiente
del array.

La opción completa, **si se acepta tocar el contrato**: añadir `planVersion` a `Decision` y
un estado `invalidada` a `DecisionStatus`, invalidar por versión igual que los
compromisos, y devolver 409 al intentar resolver una decisión de una versión vieja. Si se
elige esta, hay que actualizar `docs/api-contract.md` y el tipo del frontend **en el mismo
PR**, y avisar al grupo.

Para lo que queda de hackathon, la opción barata cubre las dos consecuencias.

### Test que debería acompañarlo

- Dos propuestas por encima del límite → solo queda una decisión `pendiente`.
- Intentar resolver la decisión obsoleta → no mueve `budget.authorized`.
- `reject_spend` con dos decisiones en el array → resuelve la viva, no la vieja.

## Fuera de alcance

- Caducidad por tiempo de las aprobaciones.
- Rediseño de la tarjeta de decisión en el panel: basta con que refleje el estado real.
- Tocar la lógica de invalidación de compromisos, que ya funciona (T16, PR #21).

## Notas

- Endpoints implicados: `POST /interventions`, y `POST /workflow/coordinator/proposals`
  para reproducir. Ver `docs/api-contract.md`.
- Archivos clave: `backend/src/domain/plan-rules.ts` (`applyPlanProposal`),
  `backend/src/domain/control-service.ts` (`applyIntervention`, `applyTwistEffect`),
  `frontend/src/domain/types.ts` (`Decision`, `DecisionStatus`).
- Zona de propiedad: el backend base es de Zhi. Si el arreglo toca `plan-rules.ts`,
  acordadlo con él antes de empujar (ver `docs/plan-sabado.md`).
