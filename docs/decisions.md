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

- **Qué:** el primer input es un lote de 10 mensajes sintéticos recibidos en 3,6 s; el Reasoning Agent descarta 9, consulta el mundo y actúa solo por la rotura. La primera acción de Transporte llama mediante HappyRobot al teléfono de pruebas autorizado; el resto sigue en `sim` y una segunda acción de Transporte no vuelve a llamar.
- **Por qué:** demuestra selección de señal y ejecución externa sin fingir conversaciones con proveedores reales ni repetir el incidente de llamadas de T55. La toma exige flags explícitos y evidencia de transcript.