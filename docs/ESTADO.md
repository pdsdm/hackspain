# Estado del proyecto

> Memoria del proyecto: contrastar esta foto con `origin/main` antes de trabajar.

| | |
|---|---|
| **Foto tomada** | 19 de septiembre de 2026, 17:50 CEST |
| **Base de `main` integrada** | `origin/main` mergeado en `feat/pep-chat-anclado` (PR #56) |
| **Trabajo verificado** | conflictos de merge resueltos; `make check` OK |
| **Entrega** | domingo 20 a las 11:00, hora de Madrid |
| **Generado por** | Cursor |

## Salud

| Comprobación | Resultado |
|---|---|
| `make check` en esta rama | OK |
| Lint y build | Backend y frontend OK en la foto T40 anterior |
| Fixtures | 10 JSON reproducibles OK |
| Node de esta verificación | 22.22.3 |

El build del frontend conserva el aviso de chunk mayor de 500 kB.

## Qué funciona

- `main` incluye panel API, motor persistente, HappyRobot, JEV opcional, afluencia,
  actores, incidencias, giros, rutas dinámicas, costes informativos (T38) y
  `reasoning_effort` bajo en Helmcode (PR #52).
- **T39 / PR #56:** el mapa ocupa toda la vista; KPIs, aforo, coordinador y
  cronología (chat, lo nuevo abajo, anclado al fondo) flotan sobre él con estilo
  cristal. La llamada solo aparece mientras está `en_curso`. Sin tarjeta de coste
  ni panel de operaciones. Velocidad ×1→×2→×5→×10→×20 en modo `sim`. Lo secundario
  va en un cajón lateral.
- **T40:** el estado operativo (runs, tareas, eventos) se copia a Postgres del
  proyecto `vdekfueryshivtdkbbti` cuando hay service role. SQLite sigue siendo el
  motor. El panel no habla con Supabase directo.
- T38 ya está en `main`: costes informativos, sin límites ni aprobaciones económicas.
- T6 tiene código integrado en `main`. No se han repetido llamadas reales en esta sesión.

## Qué falta, por riesgo para la demo

1. Pegar `SUPABASE_SERVICE_ROLE_KEY` en `.env` y comprobar que el backend loguea
   `Supabase persistence enabled`; revisar tablas en el dashboard.
2. Mergear PR #56 (`feat/pep-chat-anclado`) cuando `make check` y el preview estén verdes.
3. Sincronizar el prompt desplegado de HappyRobot con el guion actualizado del repo;
   comprobar el extractor `result.data.committedCost` con evidencia real (sin verificar).
4. Ensayar el recorrido con LLM y HappyRobot reales; T17/T18 no se cierran por
   pasar las pruebas simuladas.
5. Al integrar el trabajo local de recursos y T20, retirar sus límites presupuestarios
   y recomendaciones `ask_budget`; esas ramas no se han modificado aquí.

## Bloqueos y de quién dependen

| Qué | Depende de | ¿Externo? |
|---|---|---|
| Llamada real | trigger, credenciales, número de prueba y callback público | Sí — HappyRobot y portátil de demo |
| T17 aceptado | llamada real T6 y prueba Helmcode | Parcial |
| T18 aceptado | Quick Tunnel operativo, callback real y ensayo | Parcial |
| Pitch final | decidir actor telefónico y desenlace | No |

## Ramas vivas sin mergear

- `feat/pep-chat-anclado` (PR #56): T39+T40 + chat anclado; `origin/main` integrado.
- `feat/pep-supabase`: T40 espejo Postgres; falta la clave de servicio en el `.env` local.
- `feat/ventura-routing-local`: trabajo local de ciclo de recursos sobre una base anterior.
- `feat/ventura-aprendizaje`: trabajo local T20; incluye memoria `ask_budget`.

## Decisiones pendientes que bloquean a otros

1. Quién hace de responsable de recinto al teléfono y qué respuestas dará.
2. Cuántas interacciones reales entran en la demo; propuesta vigente: una llamada y un SMS.
3. Cómo termina el relato: plan cerrado o limitación abierta y honesta.
4. Dónde está el binario `cloudflared` del portátil y quién aporta las credenciales T6.

## Avisos para el siguiente agente

- Usa Node 22. En esta máquina Node 22.23.2 viene de `pi-node`; no existe
  `~/.nvm/nvm.sh`.
- `scripts/demo.sh` arranca por defecto en `rules` + `sim`. Para servicios reales usa
  `DEMO_COORDINATOR_MODE=llm DEMO_CALL_MODE=real`; el preflight comprueba que las
  variables necesarias existen sin mostrar sus valores.
- Reiniciar conserva SQLite, pero pierde callbacks `sim` programados solo en memoria. Si
  se reinicia durante una llamada simulada, ejecuta `reset calm` antes del ensayo.
- Un Quick Tunnel cambia de URL al arrancar. HappyRobot debe usar el `callbackUrl` del
  payload, no una URL copiada a mano.
- T17 y T18 no están cerradas: su tramo técnico está en `main`, pero falta la validación
  real descrita en sus specs.
- Haz `git fetch` antes de analizar: `main` se mueve rápido y las ramas remotas antiguas
  pueden estar ya mergeadas.
