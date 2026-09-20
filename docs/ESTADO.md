# Estado del proyecto

> Foto de `origin/main` (`98d6138`). No hay PRs abiertos. T57–T61 y T21 están en `main`. Actualizar esta página después de cada merge relevante.

| | |
|---|---|
| **Foto tomada** | 20 de septiembre de 2026, 10:45 CEST |
| **Base** | `98d6138` (`origin/main`; T57 en #109, T58 en #110, T59 en #111, T21 en #112, T60 en #113, T61 en #114) |
| **Trabajo en curso** | ninguno de código pendiente de merge; quedan cambios de producción (workflows y variables Railway) |
| **Entrega** | domingo 20 a las 11:00, hora de Madrid |
| **Generado por** | sesión de merge: no quedaba ningún PR abierto; `main` local fast-forward a `origin/main` |

## Salud

| Comprobación | Resultado |
|---|---|
| `make check` | **OK** en T61 antes del merge (#114): 382 tests (375 pass, 7 skipped, 0 fail). `origin/main` es ese commit (`a51886a`) más el merge `98d6138`. No reejecutado en esta sesión |
| Tests de `happyrobot-coordinator.test.ts` | 17 pass, 0 fail (15 previos + 2 nuevos de T61) |
| Node usado en esta sesión | v22 (verificado con `npx tsc`/`npx tsx` en `backend/`) |
| Railway producción | servicio `hackspain` **online**, región `sfo`. `/health` responde `{"status":"ok"}` |
| Trigger del coordinador HappyRobot en producción | **verificado con `/coordinator/happyrobot/shadow`** (modo shadow, no aplica plan): `status: "accepted"`, `happyrobotRunId` real, plan completo devuelto. Antes de T61 daba 404 en todos los eventos (ver abajo) |
| Resto de `origin/main` (T58/T59/T60, ramas viejas, otras tareas) | no reauditado en esta sesión; ver la foto anterior en el historial de `docs/ESTADO.md` para esos detalles |

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

## Qué cambió: T60, tres fallas vistas en una llamada real (D28)

Una sola llamada de producción (`call-8d8f5c0a`) dejó ver tres defectos distintos.

**1. Nuestra respuesta HTTP entraba en la conversación.** La transcripción guardada contiene,
atribuida al humano, la línea
`{"steps":[{"node":"POST transcript parcial","output":{"added":4,...,"total":4}}]}`. Es la
respuesta de nuestro endpoint de transcripción: HappyRobot devuelve al agente la salida de sus
nodos, el agente la leyó como conversación, perdió el hilo y repitió el saludo hasta que la
llamada murió. Ahora el endpoint responde `204` sin cuerpo y la cuenta de líneas va al log.
**El `204` no lo cierra solo**: el nodo tiene que dejar de devolver su salida al agente.

**2. Cada replanificación volvía a llamar.** Espacios llamó dos veces por el mismo Lounge. La
contraparte lo dijo en voz alta («me acaba de llamar su compañera») y contestó 120 plazas en una
y 150 en la otra. El ejecutor descarta ahora una llamada cuyo objetivo normalizado coincida, o
esté contenido, en otra a la misma área y contraparte dentro de `CALL_COOLDOWN_MS` (120 s). El
resultado lleva `eventId` `no-repeat-` y **no** relanza al coordinador: replanificar generaría
otra llamada repetida.

**3. Una acción de `email` marcaba un teléfono.** Quedó registrada como `channel: "email"` con
transcripción de voz. `isReal()` exige ahora `kind === "call"`, y el prompt dice que hoy el
único canal que llega a una persona es la llamada. Consecuencia aceptada: el KPI «Informados»
deja de moverse solo.

La guarda anti-repetición es **deliberadamente conservadora**: compara el encargo, no solo la
contraparte. Volver a llamar al mismo recinto por otro espacio es legítimo y tiene que pasar;
dejar un área muda hunde la demo mucho más que una llamada de más. Quien evita la repetición
reescrita es la regla del prompt.

## Qué cambió: T61, el trigger del coordinador dejaba de coincidir con su propio log (D29)

Todas las llamadas del coordinador al Orquestador de HappyRobot morían con 404
(`no live development version found for use case 1i6zafb6wodb`), sin crear ejecución,
pese a que el log de informe decía `entorno: production`.

Causa raíz, confirmada en Railway producción (`railway variables --kv`):
`HAPPYROBOT_COORDINATOR_ENVIRONMENT=production` (correcto, alimenta solo la etiqueta del
log) convivía con `HAPPYROBOT_COORDINATOR_HOOK_URL=.../hooks/development/1i6zafb6wodb`
(el que de verdad enruta la llamada, apuntando a `development`, que no tiene versión
viva). Dos fuentes de verdad independientes, y solo una se había actualizado.

Se intentó primero quitar el hook y disparar siempre contra
`{apiBase}/workflows/{id}/runs`: probado en vivo con `/coordinator/happyrobot/shadow`,
esa ruta devuelve `Workflow not found` en la cuenta EU (documentado también en
`docs/runbook-happyrobot-coordinator.md`). El hook es obligatorio para esta cuenta; no
se tocó ese mecanismo.

Cambios:

- Railway producción: `HAPPYROBOT_COORDINATOR_HOOK_URL` corregido a
  `https://workflows.platform.eu.happyrobot.ai/hooks/1i6zafb6wodb` (sin el segmento
  `development`, según la convención de `.env.example`: `/hooks/<slug>` en production,
  `/hooks/<entorno>/<slug>` en cualquier otro entorno).
- `loadHappyRobotCoordinatorConfig` (`backend/src/agents/coordinator/happyrobot-config.ts`)
  ahora compara el entorno codificado en `HAPPYROBOT_COORDINATOR_HOOK_URL` contra
  `HAPPYROBOT_COORDINATOR_ENVIRONMENT` y lanza un error claro al arrancar si no
  coinciden, en vez de dejar que cada trigger falle en silencio con un 404 confuso.
- 2 tests nuevos en `happyrobot-coordinator.test.ts` cubren el error de divergencia y el
  caso donde ambas variables coinciden (production sin segmento, y cualquier otro
  entorno con segmento).

**Verificado en producción tras el fix**, con `/coordinator/happyrobot/shadow`
(modo shadow, no aplica el plan): `status: "accepted"`, `happyrobotRunId` real, plan
completo devuelto por el Reasoning Agent.

## Qué falta, por riesgo para la demo

0. **Silenciar `reportar_transcript` en el workflow de voz.** Es el arreglo con más efecto y no
   depende de ningún merge. Mientras el nodo devuelva su salida al agente, las llamadas se
   seguirán rompiendo solas. (Sin verificar en esta sesión si sigue pendiente tras T60.)
1. **`CALLS_ON_DEMAND=true` en Railway, solo si el nodo `emitir_llamada` del Orquestador ya
   apunta a `POST /workflow/coordinator/happyrobot/call` (T59).** Con la variable puesta y el
   nodo antiguo, no sale ninguna llamada. Estado de esa publicación: sin comprobar en esta
   sesión.
2. **Configurar `HAPPYROBOT_HOOK_DEFAULT` en Railway** (por ejemplo el mismo hook
   `my5asz8ibzd3`). Sin esa variable, tres de las cuatro áreas siguen sin canal. Estado: sin
   comprobar en esta sesión.
3. **Comprobar el nombre del token del transcript** en el outbound
   (`HAPPYROBOT_WEBHOK_TOKEN`, sin la `O`). Si la variable real es `HAPPYROBOT_WEBHOOK_TOKEN`,
   el Bearer va vacío, `/workflow/happyrobot/transcript` responde 401 y el panel no enseña la
   conversación en directo. El fallo es silencioso. Sin comprobar en esta sesión.
4. **Verificación con llamada real** de que un «no» real produce un plan distinto. No
   ejecutada: hace sonar un teléfono real. Pendiente de autorización humana.
5. **Latencia:** Railway está en `sfo` y HappyRobot en `eu`. Cada `consult_world` cruza el
   Atlántico. El sondeo del run es cada 5 s. Sin medir en esta sesión. La llamada de prueba de
   esta sesión al Orquestador (vía `/shadow`) tardó 6,7 s en total.
6. Lo anterior a T58 sigue pendiente y sin volver a comprobar: rotar el bearer de HappyRobot,
   aprobar textos de T45, grabar la toma.

## Bloqueos

| Qué | Depende de | Externo |
|---|---|---|
| `CALLS_ON_DEMAND` y `HAPPYROBOT_HOOK_DEFAULT` en Railway | decisión humana; es cambio de producción, y el orden importa | No |
| Prueba con llamada real | autorización humana; suena un teléfono de verdad | Sí |
| Rotación de bearer, textos T45, grabación | sin comprobar en esta sesión | Parcial |

## Ramas vivas sin mergear

No hay PRs abiertos. El código de entrega (T57–T61, T21) está en `main`.

Ramas con commits por delante de `main` que **no** se han mergeado a propósito (WIP o ya superadas):

- `feat/pep-take-call` / `feat/pep-chat-anclado` local: motor `take_call` experimental.
- `Prueba-de-plataforma-y-llamada-real`: prototipo T6 de voz, choca con el panel actual.
- `feat/pep-catering`: reinstauraría `incidents.ts`, borrado a propósito en T57.
- `feat/pep-quitar-kpis`: el efecto ya está en `main` vía #96 y #98.
- `feat/ventura-specs-cerebro`, `docs/estado-1200`: docs antiguas.

## Decisiones pendientes

1. ¿Se añade `HAPPYROBOT_HOOK_DEFAULT` en Railway para dar voz a las cuatro áreas, o se
   acepta que solo Espacios llame?
2. ¿Se mantiene el arranque en pausa de `c4883c3` como comportamiento definitivo? Hoy implica
   que `/events`, `/interventions` y el ingreso de HappyRobot responden 409 hasta que alguien
   pulsa iniciar en el panel. Si en la toma llega una llamada real antes de ese clic, se
   pierde con un 409.

## Avisos para el siguiente agente

- El trigger del coordinador HappyRobot **necesita** `HAPPYROBOT_COORDINATOR_HOOK_URL`
  (cuenta EU: la ruta directa de la API da `Workflow not found`). No lo quites. Si tocas su
  valor o `HAPPYROBOT_COORDINATOR_ENVIRONMENT`, ambos tienen que codificar el mismo entorno o
  el backend no arranca (D29) — es la señal correcta, no un bug.
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
