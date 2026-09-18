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
