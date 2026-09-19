# Estado del proyecto

> Memoria del proyecto: contrastar esta foto con `origin/main` antes de trabajar.
> Todo lo afirmado aquí sale de comandos ejecutados o se marca como información del equipo.

| | |
|---|---|
| **Foto tomada** | 19 de septiembre de 2026, 20:18 CEST |
| **Base del candidato** | `2196e35` (T44 integrada) |
| **Trabajo verificado** | H1/H2/H4 sobre `2196e35`; T17/T18 reales siguen abiertas |
| **Entrega** | domingo 20 a las 11:00, hora de Madrid |
| **Generado por** | Devin |

## Salud

| Comprobación | Resultado |
|---|---|
| `JEV_LIVE_EVAL=false make check` en `feat/zhi-demo-gaps` | **OK** |
| Tests de backend | 323: **316 pasan, 0 fallan, 7 live omitidos** |
| Lint y build | Backend y frontend OK; 2 avisos de baseline en backend |
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
- T44: piloto HappyRobot Reasoning Agent disponible en shadow por defecto; el E2E con un run
  real sigue pendiente y el proveedor por defecto no cambia.

### Correcciones H1/H2/H4

- Un callback aceptado de Espacios fusiona condiciones nuevas y aplica `capacity`/`readyAt`
  válidos al ID exacto. Solo un cambio material vigente relanza el coordinador una vez.
- `resolved` exige plazas confirmadas, condiciones resueltas, aforo y acceso. El panel separa
  sede asignada de plaza confirmada y muestra un plan condicionado sin declararlo cerrado.
- El payload saliente a HappyRobot incluye `kind` y `channel` para `call`, `sms` y `email`.
- Duplicados, callbacks obsoletos, rechazos, `no_answer` y datos inválidos conservan las
  protecciones de run/versión e idempotencia. `make check` pasa con 316/323 pruebas.
- La semántica conservadora de cierre requiere revisión funcional del equipo. No se ha probado
  ningún canal real ni el recorrido humano T17/T18.

### Cambios de `fix/zhi-demo-readiness` ya contenidos en `main`

- `clock.seed` usa `SIM_SEED` o una semilla por reset y migra `attendanceSeed` antiguo.
- `POST /simulation/reset` conserva `CLOCK_SPEED`.
- El último resultado aceptado no pisa otro ciclo; el cierre decide después entre `estable` y `atascado`.
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

La corrección H1/H2/H4 cubre la propagación de condiciones/hechos, el cierre permisivo y la
señal de canal. Está verificada sobre `2196e35`; el criterio conservador de cierre mantiene
pendiente la revisión funcional de Ventura/Pep.

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
| Criterio de cierre H2 | revisión funcional Ventura/Pep antes del ensayo final | No |
| T18 aceptado | ensayo completo y recuperación con el entorno de demo | Parcial |
| Prompt/extractor de voz | sincronizar workflow desplegado con T38 | Sí |
| Simulación LLM estable | decidir si `sim-world` adversarial es ensayo o modo caos | No |

## Ramas vivas sin mergear

- `origin/feat/pep-take-call`: serialización, timeout y toma de llamada; toca executor/engine
  sobre una base anterior y sigue sin mergear en esta foto.
- `origin/Prueba-de-plataforma-y-llamada-real`: rama de voz antigua con ocho archivos de diff;
  no incorporar su frontend o servidor Python sobre `main` a ciegas.
- `origin/docs/estado-1200`: foto antigua basada en `c371546`; no sustituye este estado.
- `origin/feat/pep-afluencia`: aparece no mergeada por el grafo, pero su diff contra `main` está vacío.

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
- Una aceptación solo relanza el coordinador si acaba de aplicar una condición o hecho material;
  `rejected` y `no_answer` solo lo relanzan si el resultado aún pertenece al run/versión vigentes.
- El script de demo arranca en `rules + sim`. Para LLM con llamadas simuladas:
  `DEMO_COORDINATOR_MODE=llm DEMO_CALL_MODE=sim ./scripts/demo.sh up-local`.
- Un deployment nuevo en Railway crea un run `calm` pausado; reiniciar el mismo deployment
  conserva su run. Los callbacks de runs anteriores quedan como evidencia sin aplicarse.
- Reiniciar conserva SQLite, pero pierde callbacks simulados programados en memoria.
- Un Quick Tunnel cambia de URL al arrancar; HappyRobot debe usar el `callbackUrl` enviado.
- `COORDINATOR_HARNESS=happyrobot` es el único interruptor del piloto T44; `HAPPYROBOT_API_KEY`
  sola no lo activa. Sin `HAPPYROBOT_COORDINATOR_APPLY=true` el plan aceptado no se persiste.
- Haz `git fetch` antes de analizar: `main` se mueve rápido.

## Cierre reproducible de la crisis (T43, PR #62 mergeada en `36d9af7`)

Verificado sobre `main` actualizado con T42. `make check`: **301 de 308 pasan, 0 fallan,
7 live omitidos**.

- Los compromisos avanzan a `aceptado_condiciones`; el despacho enlaza cada acción con su
  compromiso cuando hay un ganador claro.
- `resolved`, `closureSummary` y `coordinatorStatus: atascado` dan al recorrido un final
  cerrado o una limitación explícita.
- Las intervenciones humanas se reflejan inmediatamente; la replanificación sigue en cola.
- Las tareas `pending` del plan anterior se arrastran si siguen vigentes y se cancelan si
  están supersedidas o dependen de una acción fallida. Esto elimina la tarea zombi que
  bloqueaba el cierre indefinidamente.
- Un callback simulado fuera de contexto se descarta con log: antes la excepción escapaba
  del tick del reloj y terminaba el backend.
- `DEMO_TUNNEL=lhr` usa localhost.run cuando la wifi de la ETSIT no resuelve
  `trycloudflare.com`; `/health` público y autenticación del callback verificados.

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

## Retoque visual local de Carlos · 19 de septiembre de 2026

En `fix/carlos-demo-ui`, pendiente de revisión humana y sin subir al remoto: se
conserva solo Vista general; en anchos inferiores a 1024 px se muestra la cronología
con cabecera compacta y formulario. La cronología comparte el cristal y las cabeceras del dashboard: tarjetas casi
rectas, tinte tenue y acento semántico por tipo de evento, hora y área, sin máscara
de difuminado. El formulario usa neutros y el botón circular negro de la marca. El ejemplo del formulario rellena
el texto y el botón circular lo envía mediante la acción existente. No se han
modificado backend, contratos ni lógica de escenario.

Verificación: `make check` OK (301 tests correctos, 7 live omitidos, 10 fixtures);
revisión visual en escritorio y marco móvil de 390 px, y envío desde el formulario.
Se mantienen los avisos previos de lint del backend y de tamaño del bundle.

## Panel de agentes · revisión local de Carlos

En `feat/carlos-panel-agentes`, creada desde `main` (`a869a7e`): el antiguo bloque
lateral Coordinador se sustituye por una franja inferior con cinco tarjetas en
paralelo: Coordinador, Espacios, Catering, Transporte y Asistentes. Cada especialista
conserva estado, objetivo y último resultado; los detalles largos tienen scroll.
El coordinador muestra su estado real y la versión del plan. La franja reserva
espacio bajo el mapa, a la izquierda de la cronología, que llega hasta el borde
inferior del dashboard; en móvil se conserva solo la cronología.

Solo presentación, sin cambios de backend ni contratos. `make check` OK: 316
tests pasan, 7 live omitidos y 10 fixtures verificadas. Revisión visual local en
localhost:5178. Pendiente de revisión humana, sin commit ni push.

## T50 · coordinación de staff mediante Asistentes

En `feat/ventura-demo-staff-coordination`, el coordinador recibe la restricción agregada
de seis personas de recepción, exige una acción de Asistentes en el primer plan y su
reasignación cuando cambia el muelle. Catering puede depender de que Recepción abra el
punto de descarga. No se añade `Staff[]` ni un quinto agente. El panel de agentes muestra
también el motivo de cada especialista. `make check` OK: 316 tests pasan, 7 live omitidos
y 10 fixtures verificadas; permanecen los dos avisos de lint y el aviso de chunk ya
presentes en `main`.
