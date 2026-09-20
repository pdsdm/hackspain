# Estado del proyecto

> Foto de `origin/main` (`6f62593`, T58 ya mergeada en PR #110) más el trabajo sin mergear de `feat/pep-no-y-telefono-ui` (T59). Actualizar esta página después de cada merge relevante.

| | |
|---|---|
| **Foto tomada** | 20 de septiembre de 2026, 07:40 CEST |
| **Base** | `6f62593` (`origin/main`; T57 en PR #109 y T58 en PR #110, las dos mergeadas) + T59 sin mergear |
| **Trabajo en curso** | T59: el coordinador es el único que lanza llamadas, y su `emitir_llamada` pasa por el backend. Decisión D27 |
| **Entrega** | domingo 20 a las 11:00, hora de Madrid |
| **Generado por** | Devin, sesión de implementación de T58 y T59 |

## Salud

| Comprobación | Resultado |
|---|---|
| **Tests en `origin/main`** | **359 pass, 0 fail, 7 skipped.** `main` está verde. Verificado en worktree limpio de `6f62593` |
| Historia de las 10 fallas | `c4883c3` («bloquea operaciones hasta iniciar») dejó 10 tests HTTP rojos: cada ejecución arranca en pausa y `/events`, `/interventions` y `/workflow/happyrobot/events` responden 409 con la mesa detenida. T58 los arregló y el merge #110 ya está en `main` |
| Tests en `feat/pep-no-y-telefono-ui` | **366 pass, 0 fail, 7 skipped** (373 en total). Los 7 nuevos son de T59 |
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

## Qué cambió: T59, un único dueño de las llamadas (D27)

T58 no bastaba. Auditando los workflows reales de HappyRobot apareció una segunda vía de
llamada que el backend no controlaba:

- El Orquestador tiene una tool `emitir_llamada` que hacía **POST directo** al hook del agente
  de voz (`hooks/my5asz8ibzd3`), con el teléfono copiado de un directorio escrito en el prompt
  del nodo. El teléfono del panel no pintaba nada en ese camino.
- Sus parámetros `taskId`, `callId` y `callbackUrl` eran opcionales, así que el resultado
  volvía con un `taskId` que el backend no conocía y
  `translateHappyRobotResult` lo cortaba con 404. **La memoria de llamadas de T58 nunca se
  activaba en ese camino**, y `callResults` seguía vacío, así que el recorrido congelado de
  demo se aplicaba siempre.
- Además el plan encola sus acciones y el tick también las marcaba. Con un hook activo, el
  mismo encargo salía **dos veces** al mismo número: una por el plan y otra por la tool.

Cambios:

- `POST /workflow/coordinator/happyrobot/call` atiende la tool. Valida `run_id`/`plan_version`
  con la convención `stale` de `consult`/`submit`, crea o **reutiliza** la tarea de esa área
  (para que su clave se complete y las acciones dependientes se desbloqueen), y devuelve
  `taskId`, `callId` y un `status` de despacho. No exige sesión activa: el workflow puede
  llamarlo después de que `submit_plan` cierre la ejecución.
- `CALLS_ON_DEMAND=true` retiene las llamadas reales que crea el plan: quedan encoladas y
  visibles, y solo salen cuando el coordinador las pide. SMS, email y las áreas sin canal real
  siguen saliendo solas. Es **opt-in** a propósito: producción ya tiene
  `COORDINATOR_HARNESS=happyrobot`, así que atarlo a esa variable habría dejado la demo sin
  ninguna llamada antes de actualizar el workflow.
- Lo que el coordinador ya pidió deja de estar retenido: si la línea estaba ocupada, el
  `status` es `busy` y el tick la marca al liberarse, sin pedirla otra vez.
- `TaskRepository.claim(taskId)` reclama una tarea concreta con los mismos requisitos que
  `claimNext`, ahora compartidos en una sola condición SQL.
- Prompt: `emitir_llamada` se describe como la única vía real, el backend elige el teléfono, y
  se dice explícitamente que la tool no trae la respuesta de la contraparte.
- `agent/happyrobot/CAMBIOS-WORKFLOW.md`: qué tocar en los tres workflows, con el orden de
  publicación y los dos fallos encontrados (`HAPPYROBOT_WEBHOK_TOKEN` sin la `O` en el Bearer
  del transcript del outbound; tool de registro inexistente citada en el prompt del inbound).

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

1. **Publicar la versión nueva del Orquestador** con `emitir_llamada` apuntando a
   `POST /workflow/coordinator/happyrobot/call`. Guion en
   [`agent/happyrobot/CAMBIOS-WORKFLOW.md`](../agent/happyrobot/CAMBIOS-WORKFLOW.md). Las tres
   versiones están bloqueadas (`is_version_locked`), así que hay que forkear. **Sin esto, el
   resultado de cada llamada del coordinador se sigue perdiendo con 404.**
2. **Mergear T59.** Mientras no se mergee, el backend desplegado no tiene el endpoint al que
   debe apuntar el nodo nuevo.
3. **`CALLS_ON_DEMAND=true` en Railway, después del paso 1 y nunca antes.** Con la variable
   puesta y el nodo antiguo, no sale ninguna llamada. **No la he tocado.**
4. **Configurar `HAPPYROBOT_HOOK_DEFAULT` en Railway** (por ejemplo el mismo hook
   `my5asz8ibzd3`). Sin esa variable, tres de las cuatro áreas siguen sin canal. **No la he
   tocado: es un cambio de producción y necesita tu OK.**
5. **Comprobar el nombre del token del transcript** en el outbound
   (`HAPPYROBOT_WEBHOK_TOKEN`, sin la `O`). Si la variable real es `HAPPYROBOT_WEBHOOK_TOKEN`,
   el Bearer va vacío, `/workflow/happyrobot/transcript` responde 401 y el panel no enseña la
   conversación en directo. El fallo es silencioso.
6. **Verificación con llamada real** de que un «no» real produce un plan distinto. No
   ejecutada: hace sonar el teléfono `+34616500586`. Pendiente de autorización humana.
7. **Latencia:** Railway está en `sfo` y HappyRobot en `eu`. Cada `consult_world` cruza el
   Atlántico. El sondeo del run es cada 5 s. Sin medir en esta sesión.
8. Lo anterior a T58 sigue pendiente y sin volver a comprobar: rotar el bearer de HappyRobot,
   aprobar textos de T45, grabar la toma.

## Bloqueos

| Qué | Depende de | Externo |
|---|---|---|
| Que el «no» llegue en producción | publicar la versión nueva del Orquestador en HappyRobot | Sí |
| Merge de T58 + T59 a `main` (y con ello arreglar `main`) | revisión humana | No |
| `CALLS_ON_DEMAND` y `HAPPYROBOT_HOOK_DEFAULT` en Railway | decisión humana; es cambio de producción, y el orden importa | No |
| Prueba con llamada real | autorización humana; suena un teléfono de verdad | Sí |
| Rotación de bearer, textos T45, grabación | sin comprobar en esta sesión | Parcial |

## Ramas vivas sin mergear

- `feat/pep-no-y-telefono-ui`: un commit por delante de `main` (`39c3bfd`, T59). `make check` en
  verde. T58 ya está en `main` por PR #110, y la rama se reutiliza para T59.
- `feat/pep-sin-simulacion`: ya mergeada en `main` vía PR #109; la rama sigue en el remoto.
- El resto de ramas remotas no se ha vuelto a auditar en esta sesión (`git branch -r`).

## Decisiones pendientes

1. Aprobar y mergear T59 (D27). T58 (D25, D26) ya está en `main`.
2. ¿Se añade `HAPPYROBOT_HOOK_DEFAULT` en Railway para dar voz a las cuatro áreas, o se
   acepta que solo Espacios llame?
3. ¿Se mantiene el arranque en pausa de `c4883c3` como comportamiento definitivo? Hoy implica
   que `/events`, `/interventions` y el ingreso de HappyRobot responden 409 hasta que alguien
   pulsa iniciar en el panel. Si en la toma llega una llamada real antes de ese clic, se
   pierde con un 409.

## Avisos para el siguiente agente

- `origin/main` está verde desde el merge de T58 (#110). Si ves 10 tests HTTP rojos, te falta
  ese merge: los tests tienen que iniciar la operación antes de enviar eventos.
- Con el reloj en pausa, el backend **rechaza** eventos e intervenciones con 409. Es
  intencionado (`c4883c3`), no un bug. Y con la mesa detenida **no sale ninguna llamada ni
  vence ningún plazo**: T58 hizo que el tick bombeara la cola en pausa y se revirtió después
  por decisión humana. Para la toma: inicia la operación antes de nada.
- El plazo de «no contesta» es tiempo real: `ActionExecutor.DISPATCH_TIMEOUT_MS`, y
  `fireDue()` se llama sin argumentos. Si le pasas segundos de escenario, no vence nunca.
- No mezcles `HAPPYROBOT_ENDPOINT` con `HAPPYROBOT_HOOK_DEFAULT`. La primera es una variable
  antigua sin uso en el código; la segunda abre canales reales.
- Al tocar el prompt, cuidado con las palabras: el test «events are processed one after
  another» busca la cadena `primero` dentro del prompt de usuario. Una cabecera con esa
  palabra lo rompe sin que parezca tener relación.
- El teléfono del panel vive en `app_metadata`, no en el estado. Un `POST /simulation/reset`
  no lo borra, y por eso tampoco aparece en los fixtures.
