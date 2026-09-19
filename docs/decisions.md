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

### D9: plano operativo y comparación de estados (amplía D5)

- **Qué:** vista esquemática sin dependencias de red como entrada al dashboard; Leaflet sigue disponible como mapa. Se conserva el diseño Zhivel. La comparación usa una referencia fija de la sesión que el operador puede actualizar.
- **Por qué:** mostrar Norte/Sur, cambios y decisiones con claridad, incluso sin tiles. En API la referencia es el primer snapshot recibido; nunca se inventa un estado anterior. En simulación se usa el fixture normal de T5.

### D10: `CrisisState` es el contrato del estado de la crisis

- **Qué:** `frontend/src/domain/types.ts` define el estado público compartido por panel, backend y agentes. Los tiempos son segundos desde medianoche y la replanificación usa `planVersion`; el coordinador propone y el backend valida aforo y presupuesto. SQLite puede mantener tablas operativas internas fuera de `/state`.
- **Por qué:** el panel y los fixtures ya usan ese formato; conservar el objeto completo evita traductores y pérdida de campos durante la demo.
- **Descartado:** un contrato público propio del backend, claves traducidas y confiar al coordinador reglas con efectos externos.
