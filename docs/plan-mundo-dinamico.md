# Plan: mundo dinámico — más sitio, más gente, más actores, incidencias en vivo

> Escrito el sábado 19 a las 13:00 sobre `main` (`a78a2e1`). Entrega: domingo 11:00.
> Este plan **añade** al mundo actual. No cambia ningún id, fixture ni regla que ya exista.
> Manda `plan-sabado.md` en horarios y en la regla de recorte: nada de aquí se hace antes que
> la llamada real, la intervención humana, el giro y el ensayo.

## 1. El problema

Hoy la demo parece un guion aunque no lo sea:

- El mundo es pequeño y fijo: 2 accesos, 4 espacios, 2 muelles, 4 shuttles, 2 entregas.
- La afluencia es lineal: `arrivalsPerMin` constante por acceso. En modo `api` el backend
  **ni siquiera mueve los accesos**: solo lo hace el reducer del frontend en modo `sim`.
- Solo hay un tipo de actor móvil por área (shuttle, entrega). No hay taxis, ni VIP, ni
  repartidores de última hora.
- Lo único que pasa es lo que alguien pulsa: 9 giros cerrados o un evento escrito a mano.

Lo dinámico de verdad (coordinador LLM, `POST /events` libre, llamada real) existe pero
no se ha demostrado. Este plan no lo sustituye: le da un mundo donde se note.

## 2. Principios

1. **Aditivo.** Ids nuevos, campos nuevos siempre opcionales. Los 7 fixtures de
   `backend/fixtures/madring/states/` cargan sin tocarlos. Los 105 tests siguen en verde.
2. **Aleatorio con semilla.** Todo lo aleatorio sale de un PRNG propio (`mulberry32`, sin
   dependencia) alimentado por `SIM_SEED`. Misma semilla, misma ejecución. Los tests fijan
   la semilla. La demo usa una distinta cada reset y la enseña en `clock.seed`.
3. **El backend es la verdad.** Picos, vehículos e incidencias se calculan en el tick de
   `backend/src/domain/clock.ts`. El frontend solo pinta. El reducer `sim` no se amplía.
4. **Todo lo nuevo se ve.** Cada entidad nueva mueve algo en pantalla: mapa, KPI o
   cronología. Si no se ve, no se hace.
5. **No ahogar al coordinador.** `ESTADO.md` ya reporta 20 llamadas encoladas tras un
   giro. Ninguna incidencia automática se lanza mientras `coordinatorStatus` sea
   `replanificando` o `esperando_decision`, ni más de una cada 3 minutos simulados.
6. **Contrato en el mismo PR.** T29, T31 y T32 cambian `CrisisState` o añaden un endpoint.
   Cada PR actualiza `docs/api-contract.md` y lo dice en la descripción.

## 3. Las cuatro tareas

| ID | Qué | Riesgo | Horas | Cuándo |
|---|---|---|---|---|
| T29 | Mundo ampliado: paddock, parkings, más accesos, muelle Norte | Bajo | 2 | Hoy, ya |
| T30 | Afluencia con picos y saturación de accesos en el backend | Medio | 3 | Hoy, tras T29 |
| T31 | Nuevos actores móviles: taxis, VIP, repartidores de última hora | Medio | 4 | Hoy solo si el LLM responde en < 15 s |
| T32 | Generador de incidencias en vivo con semilla | Alto | 3 | Solo si el recorrido de las 18:00 corre entero |

Specs: [`T29`](specs/T29-mundo-ampliado.md) · [`T30`](specs/T30-afluencia-picos.md) ·
[`T31`](specs/T31-actores-moviles.md) · [`T32`](specs/T32-incidencias-vivo.md).

### T29 · Mundo ampliado

Lugares nuevos en `seed.json`, `world.json` y `calm.json`:

| Id | Tipo | Zona | Aforo | Para qué |
|---|---|---|---|---|
| `paddockNorte` | `paddock` | norte | 120 | Directores de equipo y VIP. Acceso restringido |
| `parkingNorte` | `parking` | norte | 400 vehículos | Llegadas de taxis y VIP |
| `parkingSur` | `parking` | sur | 900 vehículos | Llegadas de taxis e invitados por libre |
| `accesoSur2` | `acceso` | sur | — | Segunda puerta Sur. Alternativa si `accesoSur` satura |
| `accesoNorte2` | `acceso` | norte | — | Segunda puerta Norte |
| `accesoPaddock` | `acceso` | norte | — | Solo pase paddock |
| `muelleNorte` | `muelle` | norte | — | Alternativa real para `dock_blocked` |

`SpaceKind` gana `paddock` y `parking`. `Gate` no cambia de forma. El mapa pinta los tipos
nuevos con icono propio. `scenario.ts` ya describe todos los `spaces` y `gates` al LLM, así
que el coordinador los ve sin tocar el prompt; `consult_world` los encuentra por zona.

### T30 · Afluencia con picos

- `Gate.arrivalProfile?: { at: number; perMin: number }[]`: curva escalonada por acceso.
  Base propuesta: rampa 12:00–13:00, pico 13:00–13:20 (apertura), valle, segundo pico
  14:30–15:00 (antes de la carrera), cola larga después.
- Ráfagas aleatorias con semilla: cada minuto simulado, con probabilidad `p`, un acceso
  recibe `+N` personas durante `M` minutos. Se anota en la cronología (`info`).
- El tick del backend aplica la misma fórmula que hoy tiene el reducer del frontend
  (`entered`, `waiting`, `status`). `arrivalsPerMin` pasa a ser el valor efectivo del
  minuto, así el panel actual no cambia.
- Saturación (`waiting` sobre umbral): evento `incidencia` en la cronología y evento
  interno al coordinador («Acceso Sur saturado, 2.800 esperando»). En modo `rules`, regla
  determinista: abrir el otro acceso de la misma zona. En modo LLM, `set_gate` ya existe.

### T31 · Actores móviles

Colección nueva y opcional `vehicles?: Vehicle[]` en `CrisisState`. `shuttles` y
`deliveries` no se tocan.

```ts
interface Vehicle {
  id: string
  kind: 'taxi' | 'vip' | 'repartidor'
  name: string
  who: string
  count: number
  from: string
  destinationId: string
  route: LatLng[]
  departAt: number
  arriveAt: number
  delayMin: number
  status: 'en_ruta' | 'retenido' | 'desviado' | 'llegado'
  counterpart: string
  note?: string
}
```

Semilla: 3 VIP (directores de equipo → `paddockNorte`), 4 taxis (invitados → `accesoSur`),
2 repartidores de última hora (→ `muelleSur`, `muelleEste`). Un contacto de prueba por
tipo en `contacts`. El tick los hace llegar; `retenido` no avanza. Operación nueva del
coordinador `redirect_vehicle { id, destinationId, note }`, validada como `redirect_delivery`.
El mapa reutiliza `vehicleIcon` con un icono por tipo.

### T32 · Incidencias en vivo

Catálogo de 10–12 microincidencias con texto y efecto determinista, sobre lo de T29–T31:

- «Taxi TX-03 con 4 invitados retenido: `parkingSur` lleno» → vehículo `retenido`.
- «Repartidor REP-01 en muelle equivocado (`muelleNorte`)» → `desviado`.
- «Director de equipo llega 20 min antes a `paddockNorte`: sala sin montar» → `readyAt`.
- «Pico de 400 personas en `accesoSur2`» → ráfaga de T30.
- «Seguridad cierra `accesoNorte2` 15 min» → `cerrado` con `readyAt`.
- «BUS-03 pinchazo en el traslado» → `retrasado` +15.
- «Catering: faltan 60 menús sin gluten en la entrega CAT-02» → `note` + evento.

Cada una entra por el mismo camino que `POST /events`, así que el coordinador LLM
responde a algo que no está en la lista de giros. En modo `rules` se aplica el efecto y
se registra; no hay respuesta. Control: `SIM_INCIDENTS=on|off`, endpoint
`POST /simulation/live { enabled, seed? }` y un interruptor «Modo vivo» junto al panel de
giros. Por defecto **apagado**; se enciende en el pitch en el momento «no está previsto».

## 4. Orden, dependencias y recorte

```
T29 mundo ─┬─→ T30 picos ──────────────┐
           └─→ T31 actores ─→ T32 incidencias ─→ ensayo con «Modo vivo»
                  ▲
        LLM < 15 s (decisión #5 de plan-sabado.md)
```

- T29 y T30 no dependen del LLM. Se ven con `rules`. Se hacen hoy.
- T31 sin LLM son marcadores que se mueven; vale, pero no justifica 4 horas si la llamada
  real o el pitch necesitan manos. Se decide en el punto de control de las 14:00.
- T32 sin LLM es ruido. Solo se hace si el recorrido de las 18:00 corre entero con LLM.
- **Recorte, en este orden:** T32 → T31 → T30 → T29. Antes de recortar nada de
  `plan-sabado.md` se recorta todo esto.
- **Congelación a las 22:00** vale también para esto. Lo que no esté mergeado a esa hora
  no entra en la demo.

## 5. Reparto propuesto

Sigue el mapa de propiedad de `plan-sabado.md`. Si alguien tiene un hueco, lo dice en el
grupo y se cambia aquí.

| Tarea | Backend y datos | Frontend | Prompt y validación |
|---|---|---|---|
| T29 | Carlos (seed, world, `calm`) | Pep (mapa, plano, iconos) | Ventura verifica que `scenario.ts` los describe |
| T30 | Zhi (tick, PRNG, saturación) | Pep (nada nuevo si `arrivalsPerMin` es el efectivo) | Ventura (regla `rules` de saturación) |
| T31 | Zhi (tipo, seed, tick) | Pep (mapa) | Ventura (`redirect_vehicle`, `scenario.ts`) |
| T32 | Pep (catálogo, generador, endpoint) con revisión de Zhi | Pep (interruptor «Modo vivo») | Ventura (que el LLM no se ahogue) |

## 6. Cómo se enseña en el pitch

Un bloque nuevo de 30 segundos, después del giro y antes del cierre: el presentador
enciende «Modo vivo», cae una incidencia que nadie ha elegido, el coordinador la lee, la
replanifica y llama o avisa. Es el momento que responde a «¿es un guion?». Si T32 no
llega, ese bloque lo cubre un evento libre escrito por el jurado en el chat de eventos.
