# Estado del proyecto

> Memoria del proyecto: contrastar esta foto con `origin/main` antes de trabajar.
> Todo lo afirmado aquí sale de comandos ejecutados o se marca como información del equipo.

| | |
|---|---|
| **Foto tomada** | 19 de septiembre de 2026, 19:05 CEST |
| **Commit de `main`** | `3450107` (PR #64) |
| **Trabajo verificado** | T42 en Vercel y Railway de producción |
| **Entrega** | domingo 20 a las 11:00, hora de Madrid |
| **Generado por** | Devin |

## Salud

| Comprobación | Resultado |
|---|---|
| `make check` en la rama T42 | OK |
| Tests de backend | 297: **290 pasan, 0 fallan, 7 live omitidos** |
| Lint y build | Backend y frontend OK |
| Fixtures | 10 JSON reproducibles OK |
| Node | 22.23.2 |

El build del frontend conserva el aviso de chunk mayor de 500 kB.

## Qué funciona

### Mergeado en `main`

- Panel API, motor SQLite, cola por `planVersion`, callbacks HappyRobot e idempotencia.
- JEV opcional con efectos desactivados por defecto (T35).
- Mundo dinámico: afluencia, actores, incidencias, giros automáticos y rutas dinámicas.
- Costes informativos (T38): no bloquean acciones ni crean aprobaciones económicas.
- Decisiones operativas separadas del coste mediante `approve_plan` y `reject_plan`.
- Helmcode usa `deepseek-v4-flash`, harness JSON y `reasoning_effort=low` por defecto.
- T17 automatizado: evento → plan → llamada sim → callback → giro → replan, sin aprobación
  económica ni doble cargo.
- T18 local: frontend API, SQLite persistente, reset, reinicio y parada.
- T39: mapa a pantalla completa, paneles flotantes y cronología tipo chat.
- T42 (PR #64): cada deployment de Railway crea un run `calm` nuevo; reiniciar el mismo
  deployment lo conserva y mantiene los anteriores inactivos en SQLite.
- Producción validada: `simSeconds=43200` estable durante tres segundos, reloj pausado,
  `planVersion=1`, coordinador estable y cero eventos, llamadas, decisiones o acciones.
- README documenta frontend Vercel, backend Railway, healthcheck y volumen SQLite.

### En `fix/zhi-demo-readiness`, aún sin mergear

- `clock.seed` usa `SIM_SEED` o una semilla por reset y migra `attendanceSeed` antiguo.
- `POST /simulation/reset` conserva `CLOCK_SPEED`.
- El coordinador vuelve a `estable` tras el último resultado aceptado sin pisar otro ciclo.
- Un callback adverso con `planVersion` obsoleta se registra, pero no vuelve a lanzar el
  coordinador ni multiplica replans de una versión anterior.
- El prompt no presenta `verificationTarget` como campo genérico.
- `set_place` sobre un id `gate-*` se normaliza a `set_gate`.
- Hay regresiones para seed, reset, concurrencia, callbacks obsoletos, targets y puertas.

## Qué falta, por riesgo para la demo

### 1. T17 con servicios reales — Zhi (`doing`)

El recorrido automatizado pasa. Helmcode real aplicó la política nueva en una instancia
aislada: cero decisiones económicas y despacho inmediato. Esa prueba detectó callbacks
adversos de una versión antigua que podían relanzar replans; la rama lo corrige y añade una
regresión. No se repitió el ensayo externo después del fix.

Para cerrar T17 falta repetir el recorrido completo con actor HappyRobot controlado,
callback y giro. El usuario informó de una primera llamada real previa, pero no se verificó
en esta foto el recorrido completo tras el fix.

### 2. T18 ensayo completo — Zhi (`doing`)

Se verificaron `/health` y `/state` públicos por Quick Tunnel, autenticación del callback,
persistencia SQLite, seed y velocidad tras reinicio. Falta un ensayo completo que incluya
T17 real y recuperación operativa.

### 3. Integraciones del equipo

- El prompt y extractor desplegados en HappyRobot deben reflejar costes informativos y
  `result.data.committedCost` (sin verificar).
- T37 figura `doing` aunque PR #50 está mergeado; corresponde a Pep actualizar su fila.
- T38 figura `review` aunque PR #51 está mergeado; corresponde a Ventura actualizar su fila.
- T39 figura `review` aunque PR #53 está mergeado; corresponde a Pep actualizar su fila.
- T13, T19, T20–T22 siguen `todo`; T1, T9, T12, T14–T16 y T33–T35 siguen `review`.

### Añadido en PR #56 (T39 y T40)

- **T39:** el mapa ocupa toda la vista; KPIs, aforo, coordinador y cronología tipo chat
  flotan sobre él. La llamada solo aparece mientras está `en_curso`. Velocidad
  ×1→×2→×5→×10→×20 en modo `sim`.
- **T40 descartada:** se retira la copia en Supabase; el despliegue va en Railway y SQLite
  con disco persistente es el único almacén (D18).

### Aviso de integración

El merge `585a5e3` descartó 38 commits de `main` (PR #51, #52, #53 y #54, `world/locate.ts`,
el `sim-world` de T36 y los tests de coste). Se recuperaron sin reescribir historia. Si
`make check` baja de golpe el número de tests, sospechad de un merge resuelto a lo bruto.

## Bloqueos y de quién dependen

| Qué | Depende de | ¿Externo? |
|---|---|---|
| T17 aceptado | actor HappyRobot controlado, callback y giro en el mismo recorrido | Sí |
| T18 aceptado | ensayo completo y recuperación con el entorno de demo | Parcial |
| Prompt/extractor de voz | sincronizar workflow desplegado con T38 | Sí |
| Simulación LLM estable | decidir si `sim-world` adversarial es ensayo o modo caos | No |

## Ramas vivas sin mergear

- `backup/pre-demo-cleanup-20260919`: copia exacta de `4e63383` antes de T42.
- `fix/ventura-cierre-demo`: cierre de crisis y túnel alternativo, tres commits sobre `main`.
- `feat/ventura-routing-local`: trabajo local de ciclo de recursos sobre una base anterior.
- `feat/ventura-aprendizaje`: trabajo local T20; incluye memoria `ask_budget`.

1. Usar un actor/guion controlado para el ensayo T17 o aceptar `sim-world` adversarial como
   modo caos; el segundo no garantiza convergencia.
2. Quién hace de responsable de recinto y qué respuestas dará durante el ensayo real.
3. Cómo termina el relato: plan cerrado o limitación abierta y honesta.
4. Cuándo sincronizar el prompt y extractor desplegados de HappyRobot con T38.

## Avisos para el siguiente agente

- T17 ya no usa `approve_spend`: los costes son informativos y las acciones no esperan una
  aprobación económica. Las decisiones, si existen, son operativas.
- Helmcode recibe `reasoning_effort=low` por defecto; la variable de entorno puede
  sobrescribirlo.
- `accepted` no relanza el coordinador; `rejected` y `no_answer` solo lo relanzan si el
  resultado todavía pertenece al `runId` y `planVersion` vigentes.
- El script de demo arranca en `rules + sim`. Para LLM con llamadas simuladas:
  `DEMO_COORDINATOR_MODE=llm DEMO_CALL_MODE=sim ./scripts/demo.sh up-local`.
- Un deployment nuevo en Railway crea un run `calm` pausado; reiniciar el mismo deployment
  conserva su run. Los callbacks de runs anteriores quedan como evidencia sin aplicarse.
- Reiniciar conserva SQLite, pero pierde callbacks simulados programados en memoria.
- Un Quick Tunnel cambia de URL al arrancar; HappyRobot debe usar el `callbackUrl` enviado.
- Haz `git fetch` antes de analizar: `main` se mueve rápido.

## Piloto de routing con JEV (T41, sin activar)

Medido el 19/09/2026 con corpus sintético congelado (40 textos: 20 desarrollo, 20 holdout;
60 consultas en total) y un playbook en memoria, aislado del `Engine`.

| Split | Falsos positivos | Verdaderos positivos | Mediana | P95 |
|---|---:|---:|---:|---:|
| Desarrollo | 0 | 0 | 313 ms | 842 ms |
| Holdout | 0 | 0 | 292 ms | 838 ms |

El coordinador de referencia acertó 6 de 6 con mediana de 28,3 s. El piloto es mucho más
rápido y no produjo ningún falso positivo, pero **con el gate inicial su cobertura es cero**:
no reconoció ningún caso, así que hoy no sustituye a nadie. No se activa en la demo y no
toca la ruta de eventos reales. Detalle en [`T41`](specs/T41-jev-routing-pilot.md).
