# Estado del proyecto

> Memoria del proyecto: contrastar esta foto con `origin/main` antes de trabajar.

| | |
|---|---|
| **Foto tomada** | 19 de septiembre de 2026, 17:15 CEST |
| **Base de `main` integrada** | `origin/main` al crear `feat/pep-supabase` |
| **Trabajo verificado** | T40 persistencia Supabase; `make check` OK |
| **Entrega** | domingo 20 a las 11:00, hora de Madrid |
| **Generado por** | Cursor |

## Salud

| Comprobación | Resultado |
|---|---|
| `make check` en esta rama | OK |
| Lint y build | Backend y frontend OK |
| Fixtures | 10 JSON reproducibles OK |
| Node de esta verificación | 22.22.3 |

El build del frontend conserva el aviso de chunk mayor de 500 kB.
Navegador de esta sesión: no se reabrió el panel (sin verificar).

## Qué funciona

- `main` incluye panel API, motor persistente, HappyRobot, JEV opcional, afluencia,
  actores, incidencias, giros, rutas dinámicas, costes informativos (T38) y
  `reasoning_effort` bajo en Helmcode (PR #52).
- **T39, rama `feat/pep-mapa-fullscreen`:** el mapa ocupa toda la vista; KPIs, aforo,
  coordinador y cronología (chat, lo nuevo abajo) flotan sobre él con estilo cristal.
  La llamada solo aparece mientras está `en_curso`. Sin tarjeta de coste ni panel de
  operaciones. Velocidad ×1→×2→×5→×10→×20 en modo `sim`. Lo secundario va en un cajón lateral.
- **T40, rama `feat/pep-supabase`:** el estado operativo (runs, tareas, eventos) se
  copia a Postgres del proyecto `vdekfueryshivtdkbbti` cuando hay service role.
  SQLite sigue siendo el motor. El panel no habla con Supabase directo.
- T38 ya está en `main`: costes informativos, sin límites ni aprobaciones económicas.
- T6 tiene código integrado en `main`. No se han repetido llamadas reales en esta sesión.

## Qué falta, por riesgo para la demo

1. Pegar `SUPABASE_SERVICE_ROLE_KEY` en `.env` y comprobar que el backend loguea
   `Supabase persistence enabled`; revisar tablas en el dashboard.
2. Revisar y mergear T39 (`feat/pep-mapa-fullscreen`).
2. Sincronizar el prompt desplegado de HappyRobot con el guion actualizado del repo;
   comprobar el extractor `result.data.committedCost` con evidencia real (sin verificar).
3. Ensayar el recorrido con LLM y HappyRobot reales; T17/T18 no se cierran por
   pasar las pruebas simuladas.
4. Al integrar el trabajo local de recursos y T20, retirar sus límites presupuestarios
   y recomendaciones `ask_budget`; esas ramas no se han modificado aquí.

## Bloqueos y de quién dependen

| Qué | Depende de | ¿Externo? |
|---|---|---|
| Prompt y extractor de voz desplegados | Responsable de HappyRobot | Sí |
| Ensayo con proveedores reales | Entorno y credenciales del portátil de demo | Sí |
| Integración de recursos y aprendizaje | Sus ramas locales y revisión del equipo | No |

## Ramas vivas sin mergear

- `feat/pep-supabase`: T40 espejo Postgres; falta la clave de servicio en el `.env` local.
- `feat/pep-mapa-fullscreen`: T39 lista para revisión, con `origin/main` integrado.
- `feat/ventura-routing-local`: trabajo local de ciclo de recursos sobre una base anterior.
- `feat/ventura-aprendizaje`: trabajo local T20; incluye memoria `ask_budget`.

## Decisiones pendientes

- Coordinar T38 (ya en main) con las ramas de recursos/aprendizaje y el workflow de voz.

## Avisos para el siguiente agente

- Los campos `contingency`, `autonomousLimit` y `authorized` quedan por compatibilidad,
  pero ya no limitan, autorizan ni aparecen en los prompts o el panel.
- `approve_spend`/`reject_spend` devuelven 409; el giro `reject_spend` devuelve 400.
- JEV conserva su prompt congelado, umbrales, privacidad y efectos desactivados por defecto.
- El script de demo arranca en `rules + sim`. Para probar eventos libres con LLM y llamadas
  simuladas: `DEMO_COORDINATOR_MODE=llm DEMO_CALL_MODE=sim ./scripts/demo.sh up-local`.
