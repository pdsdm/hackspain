# Estado del proyecto

> Foto de `origin/main` (`c4883c3`) más el trabajo sin mergear de `feat/pep-no-y-telefono-ui` (T58). Actualizar esta página después de cada merge relevante.

| | |
|---|---|
| **Foto tomada** | 20 de septiembre de 2026, 06:11 CEST |
| **Base** | `c4883c3` (`origin/main`; T57 ya mergeada en PR #109) + `feat/pep-no-y-telefono-ui` sin mergear |
| **Trabajo en curso** | T58: el coordinador ya recibe los «no» y no repite la misma llamada; canal por área; plazos en tiempo real; teléfono editable en el panel. Decisiones D25 y D26 |
| **Entrega** | domingo 20 a las 11:00, hora de Madrid |
| **Generado por** | Devin, sesión de implementación de T58 |

## Salud

| Comprobación | Resultado |
|---|---|
| **Tests en `origin/main`** | **337 pass, 10 fail, 7 skipped.** `main` está rojo. Verificado en worktree limpio de `c4883c3` |
| Causa de esas 10 fallas | `c4883c3` («bloquea operaciones hasta iniciar») hace que cada ejecución arranque en pausa y que `/events`, `/interventions` y `/workflow/happyrobot/events` respondan 409 con la mesa detenida. Los tests HTTP no se actualizaron en ese commit |
| Tests en `feat/pep-no-y-telefono-ui` | **358 pass, 0 fail, 7 skipped** (365 en total). Incluye el arreglo de esas 10 y 10 tests nuevos de T58 |
| `make check` en `feat/pep-no-y-telefono-ui` | **OK** (lint + test + build backend, lint + build frontend, fixtures:check) |
| Lint frontend | 0 avisos, 0 errores |
| Build frontend | OK; el chunk único sigue por encima de 500 kB (aviso, no error) |
| Fixtures | `fixtures:check` verifica los 10 JSON reproducibles |
| Node usado en esta sesión | v22.22.3 (el repo exige ≥ 22.13) |
| Railway producción | servicio `hackspain` **online**, región `sfo`, volumen 65 MB / 500 MB, último arranque 03:26 UTC. `/state` responde con una ejecución nueva del fixture `calm`, reloj en pausa, sin llamadas |

## Qué cambió: T58, el coordinador ya entiende un «no» (D25, D26)

Diagnóstico: en producción el agente llamaba siempre al mismo sitio y no reaccionaba a una
negativa. No era el modelo. Eran cuatro causas nuestras, todas verificadas en el código:

1. **El «no» no llegaba.** El evento `call_result` viajaba sin texto y el snapshot no llevaba
   ningún resultado de llamada. El razonador replanificaba viendo un mundo idéntico.
2. **El mundo no cambiaba.** Un `rejected` solo invalidaba el compromiso. El espacio seguía
   en `pendiente` con su aforo, y `availability: "no_disponible"` del agente de voz se tiraba.
3. **El prompt empujaba a repetir.** El «recorrido congelado de demo» fijaba B 450 + Lounge 150
   sin condición alguna.
4. **Solo había un canal.** En Railway solo existe `HAPPYROBOT_HOOK_ESPACIOS`, así que
   catering, transporte y asistentes morían en «Sin canal real configurado», sin llamar.

Cambios:

- `calls[]` guarda `outcome`, `summary` y `conditions` al cerrarse. `liveCoordinatorInput`
  los proyecta como `callResults` (las 8 últimas) y `buildUserPrompt` los imprime en
  «RESULTADOS DE LLAMADAS». El evento `call_result` lleva texto (`callResultText`).
- `applySpaceFacts` aplica `availability: "no_disponible"` → espacio `descartado` con nota, y
  cuenta como cambio material (dispara un replan con resumen). El aforo y la hora siguen
  aplicándose solo cuando la contraparte acepta.
- Prompt: sección nueva «UN NO ES UN DATO, NO UN ESTORBO»; el recorrido congelado pasa a
  «PRIMER PLAN (solo cuando RESULTADOS DE LLAMADAS está vacío)».
- `HAPPYROBOT_HOOK_DEFAULT` da canal a las áreas sin hook propio. Es opt-in explícito: no se
  hereda de `HAPPYROBOT_ENDPOINT` para no abrir llamadas reales sin pedirlo.
- El plazo de «no contesta» pasa a 180 s de **tiempo real** (`DISPATCH_TIMEOUT_MS`) y el tick
  vence plazos y bombea la cola **también en pausa**. Antes, con el reloj detenido, una
  llamada sin resultado bloqueaba la cola para siempre.
- Teléfono por área editable en el panel: `POST /agents/:area/phone`, `agents[].phone` en
  `/state`, almacenado en `app_metadata` (un reset no lo borra) y con prioridad sobre
  `HAPPYROBOT_TEST_PHONE`. En la UI, es un campo en la tarjeta del agente.
- Se arreglaron las 10 fallas que `c4883c3` dejó en `main`: los tests HTTP ahora inician la
  operación (`POST /simulation/clock {"paused":false}`) antes de enviar eventos.

## Qué funciona (verificado en esta sesión)

- `make check` completo en verde sobre `feat/pep-no-y-telefono-ui`.
- `POST /agents/espacios/phone` contra un backend local: guarda, se ve en `/state`, rechaza
  un formato no E.164 con 400 y la llamada real sale a ese número (test automático).
- Un rechazo con `availability: "no_disponible"` deja el espacio en `descartado` y aparece en
  el prompt del coordinador como `REJECTED` (tests en `backend/test/call-memory.test.ts`).
- Producción responde `/state` y `/health`; el CLI de Railway está instalado y autenticado.
- Base operativa previa (no tocada por T58): estado SQLite, cola serial por `planVersion`,
  callbacks idempotentes, cuatro especialistas, cierre honesto, D20–D24.

## Qué falta, por riesgo para la demo

1. **Mergear `feat/pep-no-y-telefono-ui`.** Mientras no se mergee, `main` sigue con 10 tests
   rojos y el coordinador desplegado sigue repitiendo llamadas.
2. **Configurar `HAPPYROBOT_HOOK_DEFAULT` en Railway** (por ejemplo el mismo hook
   `my5asz8ibzd3`). Sin esa variable, tres de las cuatro áreas siguen sin canal. **No la he
   tocado: es un cambio de producción y necesita tu OK.**
3. **Verificación con llamada real** de que un «no» real produce un plan distinto. No
   ejecutada: hace sonar el teléfono `+34616500586`. Pendiente de autorización humana.
4. **Latencia:** Railway está en `sfo` y HappyRobot en `eu`. Cada `consult_world` cruza el
   Atlántico. El sondeo del run es cada 5 s. Sin medir en esta sesión.
5. Lo anterior a T58 sigue pendiente y sin volver a comprobar: rotar el bearer de HappyRobot,
   aprobar textos de T45, grabar la toma.

## Bloqueos

| Qué | Depende de | Externo |
|---|---|---|
| Merge de T58 a `main` (y con ello arreglar `main`) | revisión humana | No |
| `HAPPYROBOT_HOOK_DEFAULT` en Railway | decisión humana; es cambio de producción | No |
| Prueba con llamada real | autorización humana; suena un teléfono de verdad | Sí |
| Rotación de bearer, textos T45, grabación | sin comprobar en esta sesión | Parcial |

## Ramas vivas sin mergear

- `feat/pep-no-y-telefono-ui`: T58 completa (backend, frontend, 10 tests nuevos, docs).
  `make check` en verde. Arregla además las 10 fallas de `main`. Pendiente de PR.
- `feat/pep-sin-simulacion`: ya mergeada en `main` vía PR #109; la rama sigue en el remoto.
- El resto de ramas remotas no se ha vuelto a auditar en esta sesión (`git branch -r`).

## Decisiones pendientes

1. Aprobar y mergear T58 (D25, D26).
2. ¿Se añade `HAPPYROBOT_HOOK_DEFAULT` en Railway para dar voz a las cuatro áreas, o se
   acepta que solo Espacios llame?
3. ¿Se mantiene el arranque en pausa de `c4883c3` como comportamiento definitivo? Hoy implica
   que `/events`, `/interventions` y el ingreso de HappyRobot responden 409 hasta que alguien
   pulsa iniciar en el panel. Si en la toma llega una llamada real antes de ese clic, se
   pierde con un 409.

## Avisos para el siguiente agente

- **`origin/main` está rojo** (10 tests) por `c4883c3`. No es tu cambio. La rama de T58 lo
  arregla: los tests HTTP tienen que iniciar la operación antes de enviar eventos.
- Con el reloj en pausa, el backend **rechaza** eventos e intervenciones con 409. Es
  intencionado (`c4883c3`), no un bug. Pero los plazos de llamada y la cola sí corren en pausa
  desde T58, y eso también es intencionado.
- El plazo de «no contesta» es tiempo real: `ActionExecutor.DISPATCH_TIMEOUT_MS`, y
  `fireDue()` se llama sin argumentos. Si le pasas segundos de escenario, no vence nunca.
- No mezcles `HAPPYROBOT_ENDPOINT` con `HAPPYROBOT_HOOK_DEFAULT`. La primera es una variable
  antigua sin uso en el código; la segunda abre canales reales.
- Al tocar el prompt, cuidado con las palabras: el test «events are processed one after
  another» busca la cadena `primero` dentro del prompt de usuario. Una cabecera con esa
  palabra lo rompe sin que parezca tener relación.
- El teléfono del panel vive en `app_metadata`, no en el estado. Un `POST /simulation/reset`
  no lo borra, y por eso tampoco aparece en los fixtures.
