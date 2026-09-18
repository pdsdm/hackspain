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

- **Por qué:** es un cliente de empresa creíble (operadores tipo Fever) en el que pasa algo cada noche. Las llamadas a artistas, salas y asistentes son interacciones reales, negociar por voz es el terreno de HappyRobot y ningún otro equipo va a hacer ocio en directo. La emergencia de la ciudad (tormenta, apagón) es el detonante, no el producto.
- **Descartado:** gestión de emergencias de la ciudad (idea obvia, comprador público y llamadas simuladas), Enchufados, Groundhold, y la gestión de la producción completa del evento (sin crisis no cumple el reto).
