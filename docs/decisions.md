<!--
  PARA EL EQUIPO: registro de decisiones, para que nadie (ni ningún agente) vuelva a discutir lo ya decidido.
  - Una entrada por decisión, 2-3 líneas como mucho: qué, por qué y qué descartamos.
  - Los agentes pueden proponer entradas; un humano confirma antes de mergear.
  - Si una decisión cambia, no la borres: añade una nueva que diga "sustituye a DX".
-->

# Decisiones

### D1: `AGENTS.md` es la fuente única de instrucciones para agentes

- **Por qué:** lo leen la mayoría de herramientas (Codex, Cursor, Copilot, Gemini…). `CLAUDE.md` solo importa `AGENTS.md`, así cada persona usa el agente que prefiera sin duplicar reglas.
- **Descartado:** tener un archivo de reglas distinto por herramienta.

### D2: separar reglas estables del estado del trabajo

- **Por qué:** si `AGENTS.md` crece como diario, el agente pierde foco. Reglas → `AGENTS.md`; tareas → `TASKS.md`; features → `docs/specs/`; decisiones → este archivo.
- **Descartado:** un único `AGENTS.md` que va acumulando todo.

### D3: track HappyRobot con gestión de eventos y un caso de crisis

- **Por qué:** cliente de empresa creíble, crisis en directo, llamadas reales. Sustituida por D4.
- **Descartado:** gestión de emergencias de la ciudad, Enchufados, Groundhold, y la producción completa del evento sin crisis.

### D4: escenario MADRING (sustituye a D3)

- **Qué:** el producto es un centro de operaciones agéntico para un bloque de hospitalidad el domingo de Gran Premio en MADRING. El incidente es el cierre del Pabellón Principal (600 invitados, 45 min a la apertura). Nexo Events es ficticia; el recinto y la separación Norte/Sur son del circuito real.
- **Por qué:** se entiende en segundos, la cuenta atrás es de carrera, y Norte/Sur sin conexión interior obliga a coordinar espacios, shuttles, catering y mensajes. Encaja con HappyRobot (llamadas y SMS a recinto, proveedores e invitados) y con el criterio de creatividad del jurado.
- **Descartado:** gala corporativa genérica (D3), crisis de ciudad, dirigir la carrera o a seguridad/FIA, y operar el GP entero (fuera de alcance de la demo).

### D5: frontend con Vite + React + TypeScript + Tailwind, mapa con Leaflet

- **Qué:** SPA en `frontend/` (Vite 8, React 19, Tailwind 4, `react-leaflet`, `lucide-react`). Tiles de OpenStreetMap con filtro CSS oscuro. El escenario se simula en el navegador (`src/domain/`) y la UI no distingue si el estado viene de la simulación o del backend.
- **Por qué:** build en < 1 s, sin servidor Node en la demo, y la pantalla funciona de principio a fin aunque el backend caiga. Los tiles de CARTO ahora piden API key.
- **Descartado:** Next.js (más lento y nadie despliega en HappyRobot Apps este finde), plano SVG propio (menos impacto visual).

### D6: el frontend lee `VITE_API_URL` y `VITE_DATA_SOURCE`

- **Qué:** `VITE_API_URL` (por defecto `http://localhost:8000`) y `VITE_DATA_SOURCE` (`sim` | `api`). `NEXT_PUBLIC_API_URL` se mantiene en `.env.example` por compatibilidad pero no se usa.
- **Por qué:** Vite solo expone variables con prefijo `VITE_`.

### D7: backend con Node.js, TypeScript, Express y SQLite

- **Qué:** Node.js 22 + TypeScript + Express 5 en `backend/`; persistencia local con `node:sqlite` para evitar un driver nativo adicional.
- **Por qué:** comparte lenguaje con el frontend y el SDK de HappyRobot, arranca rápido y mantiene el estado en una sola instancia. Descartados FastAPI y dos backends paralelos.
- **Nota:** `node:sqlite` es experimental en Node 22 y avisa con `ExperimentalWarning` al arrancar; se acepta. Requiere Node ≥ 22.13 (también en el entorno de demo). No sustituir por `better-sqlite3` u otro driver nativo.

### D8: rutas del mapa con OSRM público y respaldo a polilínea

- **Qué:** el frontend pide la geometría de cada ruta (shuttles y entregas) a `https://router.project-osrm.org` (perfil `driving`) con origen, destino y los puntos intermedios que coinciden con un espacio del escenario. Sin dependencia nueva: `fetch` y caché en memoria. Si la petición falla, se usa la polilínea del dominio (`route`).
- **Por qué:** los vehículos circulan por calles reales y la ruta cambia sola cuando un evento cambia el destino (`destinationId` / `dockId`). Sin clave de API y sin servidor propio.
- **Nota:** el servidor demo de OSRM no garantiza disponibilidad. La demo no depende de él: sin red, el mapa muestra las rutas rectas.
- **Circuito (T54):** se piden `alternatives=3` y se elige la ruta que menos metros comparte con el trazado (`TRACK` y `PIT_LANE`, corredor de 25 m). Cruzar el trazado por un túnel o puente suma pocos metros y no penaliza; ir en paralelo sí. Si la mejor sigue compartiendo más de 150 m, se prueban puntos de paso a 300, 600 y 900 m a cada lado del tramo solapado, parando en cuanto queda por debajo de 60 m, y se conserva la mejor. Las rutas se pintan debajo del trazado para que el resto quede tapado por el circuito. Las peticiones van en cola (2 en vuelo) para no saturar el servidor público. Varios destinos (Muelle Este, Parking Norte, Muelle Norte) están pegados al trazado, así que su aproximación final puede seguir compartiendo calle.

### D16: orígenes libres con Nominatim + OSRM (amplía D8)

- **Qué:** el coordinador no usa un diccionario de sitios. `consult_world` / `spawn_vehicle` resuelven `from` contra `world.json` por id o nombre; si no está, Nominatim (OpenStreetMap) geocodifica el texto y OSRM calcula calles y minutos. El mapa pide a OSRM solo origen y destino. Sin clave. Si Nominatim u OSRM fallan, queda la recta y un ETA por distancia.
- **Por qué:** una llamada tipo «pieza en un concesionario» no cabe en paradas precargadas. HappyRobot negocia con el transportista; el trazado no se hardcodea.
- **Descartado:** Google Directions (clave), API de DHL/SEUR (no hay cuenta ni encaja en 36 h), y una lista McLaren/DHL/Chamartín en código.

### D9: plano operativo y comparación de estados (amplía D5)

- **Qué:** vista esquemática sin dependencias de red como entrada al dashboard; Leaflet sigue disponible como mapa. Se conserva el diseño Zhivel. La comparación usa una referencia fija de la sesión que el operador puede actualizar.
- **Por qué:** mostrar Norte/Sur, cambios y decisiones con claridad, incluso sin tiles. En API la referencia es el primer snapshot recibido; nunca se inventa un estado anterior. En simulación se usa el fixture normal de T5.

### D10: `CrisisState` es el contrato del estado de la crisis

- **Qué:** `frontend/src/domain/types.ts` define el estado público compartido por panel, backend y agentes. Los tiempos son segundos desde medianoche y la replanificación usa `planVersion`; el coordinador propone y el backend valida aforo y presupuesto. SQLite puede mantener tablas operativas internas fuera de `/state`.
- **Por qué:** el panel y los fixtures ya usan ese formato; conservar el objeto completo evita traductores y pérdida de campos durante la demo.
- **Descartado:** un contrato público propio del backend, claves traducidas y confiar al coordinador reglas con efectos externos.

### D11: coordinador en proceso con bucle JSON sobre `llm.ts`

- **Qué:** el coordinador corre dentro del backend. Cada evento dispara un bucle de hasta 3 rondas: `complete()` de `llm.ts` (Helmcode/OpenAI/Anthropic, sin SDK) devuelve JSON con `operations[]`, `queries[]` y `done`. El backend responde las consultas del mundo, aplica las operaciones en un borrador y reintenta si hay errores de regla. HappyRobot solo ejecuta conversaciones (llamadas, SMS, email). `POST /workflow/coordinator/proposals` se mantiene para un coordinador externo.
- **Por qué:** un evento de texto libre no cabe en reglas fijas; el bucle JSON permite consultar geografía y corregir rechazos sin bloquear el proveedor ni añadir dependencias.
- **Descartado:** tool use con SDK (deps nuevas y atado a un proveedor) y solo reglas deterministas (no cubren el chat del jurado). Ampliado por D12.

### D12: Cognition/Devin como inferencia y harness (amplía D11)

- **Qué:** con `COGNITION_API_KEY` o `DEVIN_API_KEY` el coordinador usa SWE (`swe-1.7`) por `/v1/chat/completions` (compatible con OpenAI, sin SDK). El harness por defecto (`COORDINATOR_HARNESS=tools`) es function calling local: `consult_world` y `submit_plan`, validadas igual que D11. `COORDINATOR_HARNESS=json` conserva el bucle D11. `COORDINATOR_HARNESS=devin` crea una sesión en `api.devin.ai` (`DEVIN_ORG_ID`, `devin_mode=fast`) y lee structured output. HappyRobot sigue siendo solo voz/SMS/email.
- **Por qué:** SWE está entrenado en el harness de Devin; las sesiones cloud tardan de más para un replan de <60 s. El tool loop local da el mismo estilo de agente a tiempo de demo.
- **Descartado:** LiteLLM u otro proxy, y usar Devin cloud como camino por defecto.

### D13: los giros rompen el mundo; los planes de contingencia son del recinto, no del agente

- **Qué:** el efecto determinista de un giro se limita al daño y a sus consecuencias mecánicas. Dos de los nueve (`lounge_unavailable`, `reject_split`) activan además el plan de contingencia del recinto (Norte C `propuesto`), que el coordinador puede adoptar o descartar. Todo estado que active una contingencia lleva nota de origen para que se distinga de una propuesta del coordinador. Detalle en [`giros-y-contingencias.md`](giros-y-contingencias.md).
- **Por qué:** un recinto de GP tiene contingencias escritas; modelarlo así es más realista y prueba mejor el criterio del agente, que es elegir o rechazar la alternativa obvia con un motivo. Además abre la cadena `lounge_unavailable` → `provider_silent`, donde la propia contingencia se queda sin transporte.
- **Descartado:** quitar la contingencia y que el agente invente Norte C desde cero (menos realista y no prueba criterio); y dejarla sin nota de origen, que impide distinguir la contingencia de una decisión del coordinador y disimula una caída del LLM.

### D14: HappyRobot se lanza solo desde el backend (resuelve T28)

- **Qué:** el panel envía eventos e intervenciones al backend; `ActionExecutor` llama al trigger de HappyRobot y `/workflow/results` recibe el resultado. El panel solo lee el estado resultante.
- **Por qué:** deja un único camino auditable y evita que Vite maneje credenciales o cree una segunda verdad. Descartado: `/api/happyrobot/call` en el servidor de Vite.

### D15: Helmcode con DeepSeek V4 Flash para el coordinador de la demo

- **Qué:** mientras se valida Cognition, el backend usa Helmcode con `deepseek-v4-flash` y harness JSON. Es independiente del modelo de voz, que se elige dentro de HappyRobot.
- **Por qué:** prioriza latencia de replanificación y mantiene `rules` como respaldo. Descartado: confundir `COORDINATOR_MODEL` con el LLM de la llamada en tiempo real.

**Medición del 19/09/2026, `npm run coordinator -- --runs=4 --fixture=crisis`, cuatro ejecuciones por variante:**

| `COORDINATOR_REASONING_EFFORT` | Latencias | Válidas | Invitados asignados |
|---|---|---|---|
| `low` (por defecto con Helmcode desde el 19/09) | 12,4 / 18,4 / 19,9 / 22,1 s | 4/4 | 600 en las cuatro |
| sin campo, el default del proveedor (lo que corría antes) | 18,2 / 20,2 / 27,9 / 31,5 s | 4/4 | 600 en las cuatro |
| `none` (sin thinking) | 6,1 / 7,4 / 7,7 / 8,5 s | 4/4 | **90 / 90 / 450 / 0** |

Con Helmcode, `COORDINATOR_REASONING_EFFORT` vacío ya significa `low`: lo pone `loadLlmConfig`, no el `.env`. A los demás proveedores no se les manda ningún campo de thinking salvo que se pida, porque OpenAI y Cognition no conocen ese parámetro.

**No pongas `none`.** Va tres veces más rápido, pero los planes dejan a la mayoría de los
600 invitados sin asignar, que es justo el criterio de la demo. En otras 15 llamadas
aparecieron dos respuestas de ~100 s y ~120 s: el bucle corta a 120 s y ese evento se queda
sin plan, con el respaldo determinista solo para giros.

### D17: costes informativos durante la crisis (T38, aprobada por Ventura)

- **Qué:** recuperar el servicio tiene prioridad. Se registran costes previstos y comprometidos, sin topes de contingencia, límites autónomos ni aprobaciones económicas. Sustituye la parte presupuestaria de D10 y de las specs anteriores.
- **Se conserva:** validación de importes, aforo, accesos, evidencia, condiciones, idempotencia y control humano operativo. Los campos de límites quedan como legado del contrato, sin efecto. Descartados presupuestos artificialmente altos y aprobaciones humanas automáticas.
- **Integración pendiente:** los cambios locales de ciclo de recursos no deben reintroducir límites por recurso ni reservas de saldo; T20 debe excluir las recomendaciones históricas `ask_budget`. El prompt desplegado en HappyRobot debe sincronizarse con el guion del repo.

### D18: retirada la copia en Supabase; el despliegue va en Railway

- **Qué:** se retira el espejo a Supabase Postgres (`supabase-remote.ts`, `SUPABASE_URL`,
  `SUPABASE_SERVICE_ROLE_KEY` y la dependencia `@supabase/supabase-js`). SQLite con disco
  persistente sigue siendo el único almacén y el despliegue se hace en Railway.
- **Por qué:** decisión del equipo el sábado por la tarde: un solo sitio donde desplegar y
  una dependencia externa menos en el camino crítico de la demo. La copia nunca se validó
  con la clave de servicio puesta.
- **Queda en el código:** el seam genérico `CrisisRemote` de `state/database.ts`
  (`bindRemote` / `notifyRemote`), que sin nada enganchado no hace nada. Es agnóstico del
  proveedor; si algún día hace falta un espejo, ahí está el punto de entrada.

### D19: cada deployment empieza limpio y pausado

- **Qué:** un `RAILWAY_DEPLOYMENT_ID` nuevo crea un run `calm` pausado, sin historial operativo; reiniciar el mismo deployment conserva el run y los anteriores quedan inactivos.
- **Por qué:** evita que llamadas, tareas y reloj de un ensayo contaminen la siguiente versión sin borrar la auditoría SQLite. Descartado: vaciar la base o eliminar el simulador.

### Propuesta T35: JEV verifica evidencia; el backend conserva los efectos

- **Qué:** HTTP sin SDK en el handler de resultados, máximo 1.500 ms y fallback; solo reserva `c-pabB` / Pabellón B Sur. Evaluación sin efectos por defecto; activación separada tras validar español.
- **Por qué:** un «sí» no resuelve gasto, acceso, dependencias o condiciones. Se revalidan dentro de SQLite; no se incrementan invitados ubicados. El texto fuera del vocabulario revisado no sale a JEV.
- **Pendiente de revisión humana antes de mergear:** corpus real, latencia aceptable de HappyRobot, política de privacidad y activación. Descartados Norte, confirmación física, borrado indiscriminado de condiciones y cambios automáticos por defecto.

### Actualización T35: candidato `evidence-v2` y revisión local

- **Qué:** preguntas sobre evidencia verbal y términos estructurados, con los mismos umbrales; amplía la propuesta T35 con huellas de transcripciones completas revisadas previamente por privacidad, configuradas solo en servidor. No añade anonimización automática ni reaplicación de callbacks.
- **Por qué:** el primer prompt descartaba todas las aceptaciones; el candidato congelado acertó 30 casos sintéticos nuevos, repetidos dos veces. Hubo dos timeouts en una regresión adicional; el fallback y los efectos desactivados se conservan.
- **Pendiente:** comparación con callbacks reales de HappyRobot anonimizados y etiquetados, revisión humana y sincronización con main. No activar confirmaciones ni interpretar el corpus sintético como garantía de seguridad.

### T35 bis: JEV pasa de portero a observador, y se queda apagado por defecto

- **Qué:** JEV ya no se plantea confirmar la reserva; cuando el resultado de la llamada
  afirma «aceptado sin condiciones» y la transcripción no lo sostiene, escribe una
  **incidencia** en la cronología explicando el desacuerdo. No toca el estado.
  `JEV_ALLOW_UNREVIEWED_TRANSCRIPTS` (off) permite mandar transcripciones sin revisar, solo
  para datos sintéticos, y `JEV_TIMEOUT_MS` (3000) sustituye al límite fijo de 1.500 ms.
- **Por qué:** medido con 36 llamadas generadas por el sim-world (contraparte LLM, prompt y
  semilla distintos de JEV) sobre el camino real de `/workflow/results`:

| | |
|---|---|
| Bloqueadas por la regla determinista (no `accepted` o con condiciones) | 32 de 36 |
| Candidatas que llegaban a JEV | 4 de 36 |
| Evaluadas de verdad | 2 (935 ms y ~1 s) |
| Timeouts | 2 (a 1.500 y a 3.000 ms; con techo de 25 s la misma clase de caso responde en 935 ms) |
| Desacuerdos señalados | 2 de 2 evaluadas |
| Confirmaciones automáticas | 0 |

- **Conclusión honesta:** esto es **observabilidad, no robustez**. El estado sigue
  cambiando igual; lo que se gana es que el responsable vea que el extractor afirmó más de
  lo que dijo la contraparte. Con n=2 señales no hay base para afirmar que mejore la
  fiabilidad, así que `JEV_ENABLED` sigue en `false` por defecto.
- **Ojo:** con llamadas simuladas JEV no puede dispararse, porque `scheduleSimResult` no
  rellena `sessionId` y la puerta de evidencia lo exige. Activar `JEV_ENABLED` en una demo
  con el adaptador `sim` no cambia nada.
- **Descartado:** bajar los umbrales (0,95/0,95/0,10) o quitar el filtro de privacidad para
  que confirme más. Sería calibrar contra 36 casos sintéticos para arriesgar una falsa
  confirmación en directo.

### D19: piloto JEV para routing a playbooks (T41, resultado 19/09/2026)

- **Qué:** JEV clasifica texto hacia un playbook cerrado solo en modo aislado. El playbook no se activa en la demo: primero debe pasar un gate conservador y una segunda validación determinista del estado. Fallback al coordinador ante ambigüedad, timeout, error, estado cambiado o incidencia compuesta.
- **Resultado:** 60 consultas sintéticas, 0 falsos positivos y 0 verdaderos positivos con el gate inicial; mediana 313/292 ms (desarrollo/holdout). El coordinador fue válido en 6/6 y tuvo mediana 28,3 s. La idea reduce latencia potencial, pero **no está lista para activar por cobertura cero**.
- **Descartado por ahora:** bajar umbrales usando el mismo holdout, conectar JEV al motor y dejar que JEV cree operaciones o mutaciones. Se mantiene el holdout congelado.

### D20: HappyRobot Reasoning Agent es el coordinador principal de la demo (sustituye D15 para la toma final)

- **Qué:** `COORDINATOR_HARNESS=happyrobot` con apply activo genera los dos planes mediante `consult_world` y `submit_plan`; el backend valida y aplica. HappyRobot también transporta los dos inputs simulados. Las acciones de especialistas siguen en `sim` etiquetado.
- **Por qué:** decisión humana del 20/09 tras E2E real en Railway. Conservamos `rules` como contingencia técnica; no presentamos telefonía simulada como real ni usamos Helmcode en el camino de la toma.

### D21: sin replanificación por `no_answer` y una sola llamada real en curso (20/09/2026)

- **Qué:** producción entró en bucle: cada `no_answer` de la llamada real a Espacios relanzaba al coordinador, que creaba otra llamada al mismo teléfono de pruebas mientras la anterior aún sonaba; el teléfono daba ocupado y volvía el `no_answer`. `planVersion` llegó a 43 y hubo 78 llamadas reales en dos horas.
- **Decisión:** `no_answer` reintenta la misma tarea una vez y no relanza al coordinador. El executor solo mantiene una llamada real en curso. Tras 3 relanzamientos seguidos por resultados sin input externo nuevo, el coordinador se pausa hasta que llegue uno. En Railway, `COORDINATOR_VERBOSE` vacío equivale a `0` para que los logs sean legibles.
- **Descartado:** rotar el número de pruebas o subir el timeout de 180 s; no atacan la causa.

### D22: triaje visible y una llamada real controlada en la toma (20/09/2026)

- **Qué:** el primer input es un lote de 10 mensajes sintéticos recibidos en 3,6 s; el Reasoning Agent descarta 9, consulta el mundo y actúa solo por la rotura. El Reasoning Agent invoca una vez su tool `emitir_llamada` para Transporte antes de `submit_plan`; las tareas persistidas siguen en `sim` y M4 no vuelve a llamar.
- **Por qué:** demuestra selección de señal y ejecución externa sin fingir conversaciones con proveedores reales ni repetir el incidente de llamadas de T55. La toma exige flags explícitos y evidencia de transcript.

### D23: las condiciones nuevas no replanifican y una dependencia sin respuesta cancela a sus dependientes (20/09/2026)

- **Qué:** con T55 desplegada, el ensayo API local seguía sin final: cada `accepted_with_conditions` con texto nuevo contaba como cambio material y relanzaba al coordinador (plan 3 → 6 en dos minutos, 19 llamadas). Además, la tarea de reintento `:retry` tenía otra `idempotencyKey`, así que las tareas con `dependsOn` sobre la original quedaban `pending` para siempre y el plan nunca llegaba a `atascado` ni a `resolved`.
- **Decisión:** una aceptación solo relanza al coordinador si cambia un hecho de `spaces[]` (aforo, hora); las condiciones se anotan en el compromiso sin replanificar. Una dependencia se da por satisfecha con la tarea original o con su `:retry` completada. Si ambas fallan, las tareas dependientes se cancelan, la cronología lo anota como `fallo` y el plan puede cerrar como `atascado` con `closureSummary`.
- **Descartado:** cerrar `resolved` con condiciones abiertas. La spec T52 y el contrato exigen un final honesto: `atascado` con el hueco explícito.

### D24: sin comportamiento simulado (20/09/2026, 04:20)

- **Qué:** se elimina todo lo que fingía una llamada, una incidencia o un giro: el adaptador `sim`, el mundo simulado (`sim-world.ts`), `Modo vivo`, la generación de incidencias, `/simulation/twists`, `/simulation/live`, `/simulation/e2e/reset`, `inbox_batch`/`inboxTriage`, `VITE_DATA_SOURCE` y el motor de simulación local del frontend (`reducer.ts`, `script.ts`, `twists.ts`). Solo quedan entradas reales: llamadas de HappyRobot, `principal_pipe_burst`, `dock_blocked` y texto libre.
- **Por qué:** decisión humana: la demo tiene que mostrar la operación real, no una ficción indistinguible en pantalla. Si un área no tiene hook de HappyRobot configurado (`HAPPYROBOT_HOOK_<ÁREA>`) o falta `HAPPYROBOT_API_KEY`, la tarea termina `failed` con `"Sin canal real configurado para <área>"`, sin entrada en `calls[]` y con el agente en `incidencia`; el plan puede acabar `atascado`. Ese es el comportamiento esperado, no un bug.
- **Descartado:** mantener el adaptador `sim` como reserva "por si fallan los hooks" — mezclar datos reales y sintéticos en el mismo panel es justo el problema que se quiere resolver. `applyTwistEffect`/`twistsApplied` se conservan porque los usan `dock_blocked` (real) y `reject_split` (intervención humana), no porque simulen nada.

### D25: el coordinador recuerda lo que le han contestado, y un «no» cambia el mundo (20/09/2026)

- **Qué:** el snapshot que va a HappyRobot incluye `callResults` (área, contraparte, canal, `outcome`, resumen y condiciones de las últimas 8 llamadas con respuesta), el evento `call_result` viaja con texto (`Resultado de llamada (<outcome>): <resumen>`), y `availability: "no_disponible"` del agente de voz pone el espacio en `descartado`. El prompt añade la sección «UN NO ES UN DATO» y el recorrido congelado de demo queda condicionado a que no haya ninguna respuesta todavía.
- **Por qué:** en producción el agente llamaba siempre al mismo sitio. La causa no era el modelo: un rechazo solo invalidaba el compromiso, el espacio seguía pareciendo utilizable y el razonador replanificaba con un mundo idéntico, sin texto de evento y sin memoria de llamadas. Con esos datos, repetir el plan era la respuesta correcta.
- **Descartado:** borrar el recorrido congelado de demo (se condiciona, para no perder el primer plan reproducible de la toma) y marcar el espacio como descartado ante cualquier `rejected` sin dato estructurado (un «no» a un objetivo no siempre mata el recurso).

### D26: canal por área, teléfono desde el panel y plazos en tiempo real (20/09/2026)

- **Qué:** `HAPPYROBOT_HOOK_DEFAULT` da canal a las áreas sin hook propio, con un único workflow de voz. El teléfono de cada área se edita en el panel de agentes (`POST /agents/:area/phone`), vive en `app_metadata` y manda sobre `HAPPYROBOT_TEST_PHONE`, que a su vez sustituye al destino por defecto del equipo (`+34616500586`, constante `DEFAULT_TEST_PHONE`). Siempre hay número: ya no existe la excepción «HAPPYROBOT_TEST_PHONE is required when hooks are enabled». El plazo de «no contesta» pasa a 180 s de tiempo real.
- **Corregido después (20/09/2026):** el tick sí vencía plazos y bombeaba la cola con el reloj en pausa. Se revirtió por decisión humana: con la mesa detenida no sale ninguna llamada ni vence ningún plazo. El plazo sigue midiéndose en tiempo real, pero solo avanza con el reloj en marcha.
- **Por qué:** en Railway solo había `HAPPYROBOT_HOOK_ESPACIOS`, así que catering, transporte y asistentes morían sin llamar. Y con el reloj en pausa, el plazo en segundos de escenario no vencía nunca: una llamada sin resultado bloqueaba la cola entera.
- **Descartado:** heredar el hook por defecto de `HAPPYROBOT_ENDPOINT` (abriría llamadas reales a quien solo tiene esa variable antigua) y guardar el teléfono en el documento de estado (un reset lo borraría).

### D27: un único dueño de las llamadas, y `emitir_llamada` pasa por el backend (20/09/2026)

- **Qué:** la tool `emitir_llamada` del Orquestador deja de hacer POST al hook del agente de voz y pasa a `POST /workflow/coordinator/happyrobot/call`. El backend crea o reutiliza la tarea del área, elige el destino (panel > `HAPPYROBOT_TEST_PHONE` > `+34616500586`), marca la llamada y devuelve `taskId`, `callId` y un `status` de despacho. Con `CALLS_ON_DEMAND=true`, el tick ya no marca las llamadas reales que crea el plan: quedan encoladas y visibles hasta que el coordinador las pide. SMS, email y las áreas sin canal real siguen saliendo solas.
- **Por qué:** había dos dueños de las llamadas. El plan encolaba la acción y el tick la marcaba, y además el coordinador llamaba por su cuenta al hook, así que el mismo encargo salía dos veces al mismo número. Peor: en el camino directo el teléfono lo copiaba el modelo de un directorio escrito en el prompt del nodo (el panel no pintaba nada) y el resultado volvía con un `taskId` inventado, así que `POST /workflow/happyrobot/results` lo rechazaba con 404. Por eso el «no» de la contraparte no llegaba nunca al coordinador, ni siquiera con D25 aplicada.
- **Descartado:** adoptar los resultados huérfanos creando la tarea al recibir el callback (el cuerpo de `registrar_resultado` no lleva área, así que el backend no sabría a quién asignarlo) y activar la retención con `COORDINATOR_HARNESS=happyrobot` (producción ya la tiene puesta: el despliegue habría dejado la demo sin ninguna llamada antes de actualizar el workflow). De ahí la variable propia, apagada por defecto.

### D28: la transcripción no contesta, el mismo encargo no se marca dos veces y un email no llama (20/09/2026)

- **Qué:** `POST /workflow/happyrobot/transcript` responde `204` sin cuerpo. Antes de despachar, el ejecutor descarta una llamada real cuyo objetivo normalizado coincida (o esté contenido) con otra a la misma área y contraparte dentro de `CALL_COOLDOWN_MS` (120000 por defecto); el resultado lleva `eventId` con prefijo `no-repeat-` y no relanza al coordinador. `isReal()` exige `kind === "call"`, y el prompt dice que hoy el único canal que llega a una persona es la llamada.
- **Por qué:** los tres fallos salieron de una llamada real en producción. La transcripción de `call-8d8f5c0a` contiene, atribuida al humano, la línea `{"steps":[{"node":"POST transcript parcial","output":{"added":4,...}}]}`: HappyRobot devuelve al agente la salida de sus nodos y el agente leía nuestra respuesta como conversación, perdía el hilo y repetía el saludo hasta que la llamada moría. En la misma ejecución, Espacios recibió dos llamadas por el mismo Lounge con minutos de diferencia —la contraparte lo dijo en voz alta: «me acaba de llamar su compañera»— y contestó 120 plazas en una y 150 en la otra, porque cada replanificación encola otra vez la acción equivalente y una llamada ya despachada no lo impedía. Y una acción de `email` quedó registrada como `channel: "email"` con transcripción de voz: el hook de área es un workflow de voz que ignora el `kind`.
- **Descartado:** comparar objetivos por parecido de palabras o bloquear por área y contraparte sin mirar el encargo. Las dos variantes bloquean el caso legítimo de volver a llamar al mismo recinto por otro espacio, y dejar un área muda hunde la demo mucho más que una llamada de más. La guarda es deliberadamente conservadora; quien tiene que evitar la repetición reescrita es la regla del prompt. También se descartó dar por cerrado F1 solo con el `204`: mientras el nodo devuelva su salida al agente, seguirá inyectando algo.

### D29: `HAPPYROBOT_COORDINATOR_HOOK_URL` y `HAPPYROBOT_COORDINATOR_ENVIRONMENT` no pueden divergir (20/09/2026)

- **Qué:** `loadHappyRobotCoordinatorConfig` compara el segmento de entorno codificado en `HAPPYROBOT_COORDINATOR_HOOK_URL` (`/hooks/<slug>` en production, `/hooks/<entorno>/<slug>` en cualquier otro) contra `HAPPYROBOT_COORDINATOR_ENVIRONMENT`, y lanza un error claro al arrancar si no coinciden.
- **Por qué:** en Railway producción, `HAPPYROBOT_COORDINATOR_ENVIRONMENT=production` (correcto) convivía con `HAPPYROBOT_COORDINATOR_HOOK_URL=.../hooks/development/1i6zafb6wodb` (development, con el Orquestador sin versión viva ahí). El informe de log decía `entorno: production` porque solo lee la primera variable, pero el trigger de verdad usaba el hook y pedía siempre `development`: dos fuentes de verdad independientes, y las llamadas del coordinador morían con 404 sin que el log lo delatara.
### D30: acceso al panel con código de 6 dígitos al correo (sin OAuth de terceros)

- **Qué:** registro y login son passwordless. El backend genera un código de 6 dígitos, lo guarda hasheado en SQLite y lo envía por correo (Brevo vía `fetch`, sin SDK). El panel manda un bearer de sesión. Sin `BREVO_API_KEY` el código se imprime en el log; `AUTH_DEV_ECHO` lo devuelve en JSON solo en local. `AUTH_REQUIRED=false` deja el panel abierto para tests. HappyRobot sigue con su propio bearer.
- **Por qué:** todo el mundo entraba al panel. Un código al correo cierra la puerta sin contraseñas ni dependencia nueva. En Brevo basta verificar un remitente (sin dominio) para escribir a cualquier correo.
- **Descartado:** Google/GitHub OAuth, magic link, `@supabase/supabase-js` (D18 ya lo retiró), nodemailer y Resend.

