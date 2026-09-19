# Estado del proyecto

> Memoria del proyecto: contrastar esta foto con `origin/main` antes de trabajar.
> Todo lo afirmado aquí sale de comandos ejecutados o se marca como información del equipo.

| | |
|---|---|
| **Foto tomada** | 19 de septiembre de 2026, 17:09 CEST |
| **Commit de `main`** | `c2c0482` (PR #52) |
| **Rama verificada** | `fix/zhi-demo-readiness` sobre `c2c0482` |
| **Entrega** | domingo 20 a las 11:00, hora de Madrid |
| **Generado por** | Devin |

## Salud

| Comprobación | Resultado |
|---|---|
| `make check` en `origin/main` | OK |
| Tests de backend en `origin/main` | 266: **259 pasan, 0 fallan, 7 live omitidos** |
| `make check` en `fix/zhi-demo-readiness` | OK |
| Tests de backend en la rama | 269: **262 pasan, 0 fallan, 7 live omitidos** |
| Lint y build | Backend y frontend OK |
| Fixtures | 10 JSON reproducibles OK |
| Node | 22.23.2 |

El build del frontend conserva el aviso de chunk mayor de 500 kB.

## Qué funciona

### Mergeado en `main`

- Panel API, motor SQLite, cola por `planVersion`, callbacks HappyRobot e idempotencia.
- JEV opcional con efectos desactivados por defecto (T35).
- Mundo dinámico: afluencia, actores, incidencias, giros automáticos y rutas dinámicas.
- Costes informativos (T38): no bloquean acciones ni crean aprobaciones económicas;
  `estimatedCost` y `committedCost` registran información sin inventar disponibilidad.
- Decisiones operativas separadas del coste mediante `approve_plan` y `reject_plan`.
- Helmcode usa `deepseek-v4-flash`, harness JSON y `reasoning_effort=low` por defecto.
- T17 automatizado: evento → plan con coste informativo → llamada sim → callback → giro →
  replan, sin aprobación económica y sin duplicar coste.
- T18 local: frontend API, SQLite persistente y comandos de arranque, reset, reinicio y parada.

### En `fix/zhi-demo-readiness`, aún sin mergear

- `clock.seed` usa `SIM_SEED` o una semilla por reset y migra `attendanceSeed` antiguo.
- `POST /simulation/reset` conserva `CLOCK_SPEED`.
- El coordinador vuelve a `estable` tras el último resultado aceptado sin pisar otro ciclo.
- El prompt no presenta `verificationTarget` como campo genérico; sigue disponible solo para
  la llamada confirmable de `c-pabB`.
- Una operación `set_place` sobre un id `gate-*` se normaliza a `set_gate`.
- Hay regresiones para seed, reset, concurrencia de callbacks, targets opcionales y puertas.

## Qué falta, por riesgo para la demo

### 1. T17 con servicios reales — Zhi (`doing`)

El recorrido automatizado pasa. En una prueba aislada, Helmcode real aplicó la política
nueva: cero decisiones económicas y despacho inmediato. No convergió porque el simulador
de contrapartes produjo `no_answer` y `rejected`; cada resultado adverso lanzó otro replan
y acumuló versiones y acciones. La instancia se detuvo sin llamadas reales.

Para cerrar T17 falta repetir el recorrido con el actor HappyRobot real/controlado, callback
y giro. El usuario informó de una primera llamada real previa, pero no se repitió ni se
verificó en esta foto el recorrido completo de T17.

### 2. T18 ensayo completo — Zhi (`doing`)

En la sesión anterior se verificaron `/health` y `/state` públicos por Quick Tunnel,
autenticación del callback, persistencia SQLite, seed y velocidad tras reinicio. Falta un
ensayo completo que incluya el T17 real y recuperación operativa.

### 3. Integraciones del equipo

- El prompt y extractor desplegados en HappyRobot deben reflejar costes informativos y
  `result.data.committedCost` (sin verificar).
- T37 figura `doing` aunque PR #50 está mergeado; corresponde a Pep actualizar su fila.
- T38 figura `review` aunque PR #51 está mergeado; corresponde a Ventura actualizar su fila.
- T13, T19, T20–T22 siguen `todo`; T1, T9, T12, T14–T16 y T33–T35 siguen `review`.

## Bloqueos y de quién dependen

| Qué | Depende de | ¿Externo? |
|---|---|---|
| T17 aceptado | actor HappyRobot controlado, callback y giro en el mismo recorrido | Sí |
| T18 aceptado | ensayo completo y recuperación con el entorno de demo | Parcial |
| Prompt/extractor de voz | sincronizar workflow desplegado con T38 | Sí |
| Simulación LLM estable | decidir si `sim-world` adversarial es ensayo o solo modo caos | No |

## Ramas vivas sin mergear

- `fix/zhi-demo-readiness`: fixes de seed, reset, estado del coordinador, target opcional y
  operaciones de puertas; basada en `c2c0482`, sin push.
- `Prueba-de-plataforma-y-llamada-real`: seis commits antiguos de voz y frontend; diverge
  del camino único de D14 y no tiene PR abierto.
- `docs/estado-1200`: estado obsoleto basado en `c371546`.
- `origin/feat/pep-afluencia`: referencia con commit de merge, sin diff funcional contra main.

No hay PRs abiertos en GitHub al tomar esta foto.

## Decisiones pendientes

1. Usar un actor/guion controlado para el ensayo T17 o aceptar `sim-world` adversarial como
   parte de la demo; el segundo no garantiza convergencia.
2. Quién hace de responsable de recinto y qué respuestas dará durante el ensayo real.
3. Cómo termina el relato: plan cerrado o limitación abierta y honesta.
4. Cuándo sincronizar el prompt y extractor desplegados de HappyRobot con T38.

## Avisos para el siguiente agente

- T17 ya no usa `approve_spend`: los costes son informativos y las acciones no esperan una
  aprobación económica. Las decisiones, si existen, son operativas.
- Helmcode recibe `reasoning_effort=low` por defecto; la variable de entorno puede
  sobrescribirlo.
- Los resultados `accepted` no relanzan el coordinador; `rejected` y `no_answer` sí. Varias
  respuestas adversas de `sim-world` pueden producir una cascada legítima de replans.
- El script de demo arranca en `rules + sim`. Para LLM con llamadas simuladas:
  `DEMO_COORDINATOR_MODE=llm DEMO_CALL_MODE=sim ./scripts/demo.sh up-local`.
- Reiniciar conserva SQLite, pero pierde callbacks simulados programados solo en memoria.
- Un Quick Tunnel cambia de URL al arrancar; HappyRobot debe usar el `callbackUrl` enviado.
- Haz `git fetch` antes de analizar: `main` se mueve rápido.
