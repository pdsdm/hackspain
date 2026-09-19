# Estado del proyecto

> Memoria del proyecto: contrastar esta foto con `origin/main` antes de trabajar.

| | |
|---|---|
| **Foto tomada** | 19 de septiembre de 2026, 18:40 CEST |
| **Commit de `main`** | `de7919c` (PR #53, mapa a pantalla completa) |
| **Rama verificada** | `fix/ventura-cierre-demo` (T40) sobre `de7919c` |
| **Entrega** | domingo 20 a las 11:00, hora de Madrid |
| **Generado por** | Devin, sobre un recorrido real con Helmcode y llamadas simuladas |

## Salud

| Comprobación | Resultado |
|---|---|
| `make check` en `main` (`de7919c`) | OK · 266 de 273 tests, 7 live omitidos |
| `make check` en `fix/ventura-cierre-demo` | OK · 267 de 274 tests, 7 live omitidos |
| Lint y build | Backend y frontend OK |
| Fixtures | 10 JSON reproducibles OK |
| Node de esta verificación | 23.10.0 |

El build del frontend conserva el aviso de chunk mayor de 500 kB.

## Qué funciona

- `main` incluye panel API, motor persistente, HappyRobot, JEV opcional, afluencia,
  actores, incidencias, giros, rutas dinámicas, costes informativos (T38) y
  `reasoning_effort` bajo en Helmcode (PR #52).
- **T39 (PR #53):** el mapa ocupa toda la vista; KPIs, aforo,
  coordinador y cronología (chat, lo nuevo abajo) flotan sobre él con estilo cristal.
  La llamada solo aparece mientras está `en_curso`. Sin tarjeta de coste ni panel de
  operaciones. Velocidad ×1→×2→×5→×10→×20 en modo `sim`. Lo secundario va en un cajón lateral.
- T38 ya está en `main`: costes informativos, sin límites ni aprobaciones económicas.
- T39 ya está en `main` (PR #53).
- T6 tiene código integrado en `main`. No se han repetido llamadas reales en esta sesión.
- **Recorrido de punta a punta medido tres veces** con `DEMO_COORDINATOR_MODE=llm
  DEMO_CALL_MODE=sim` (Helmcode `deepseek-v4-flash`): texto libre → plan en 20-25 s →
  invalidación del plan viejo → llamadas en paralelo con transcripción y condiciones →
  `no_answer` gestionado → **plan cerrado entre 75 s y 5 min** de reloj real. Un giro
  `lounge_unavailable` reabre la crisis y replanifica.

### T40, rama `fix/ventura-cierre-demo` (sin mergear)

Arregla lo que impedía grabar un recorrido con final:

- Los compromisos ya avanzan a `aceptado_condiciones`. Antes se quedaban en `en_consulta`
  para siempre: el adaptador `sim` no devuelve `data.commitmentId` y nadie lo aportaba.
  Ahora el despacho anota el compromiso de cada acción (contraparte y objetivo, con solape
  de palabras y solo si hay ganador claro) y el resultado lo usa como respaldo.
- Cierre explícito: `resolved`, `closureSummary` y `coordinatorStatus: "atascado"`.
  Antes el panel se quedaba en `replanificando` indefinidamente (medido: 21 llamadas y
  `planVersion` 7 sin final) y `resolved` no se ponía a `true` en ningún sitio del backend.
- Las intervenciones humanas se aplican al estado al instante; solo la replanificación
  espera en la cola. Antes una restricción podía tardar más de un minuto en aparecer.
- El KPI de invitados cuenta sede asignada, no `confirmado`: solo el camino JEV pone un
  espacio en `confirmado`, y con JEV apagado el indicador se quedaba en 0/600 toda la demo.
- Tarjeta de resultado en el mapa con el desenlace, y `log_event` sin texto ya no ensucia
  la cronología.
- `./scripts/demo.sh doctor` dice qué falta para llamar de verdad sin imprimir ningún valor,
  incluido si la red resuelve `trycloudflare.com`.
- `DEMO_TUNNEL=cloudflared|lhr`: túnel alternativo por `localhost.run` para redes que
  bloquean Cloudflare. Y el descubrimiento de la URL ya no confunde `api.trycloudflare.com`
  (la que aparece en la línea de error) con la URL pública.

## Qué falta, por riesgo para la demo

1. Revisar y mergear T40. Roza el trabajo de `fix/zhi-demo-readiness`, que también toca
   `engine.ts` y `workflow-service.ts`: conviene mergear una y rebasar la otra, en ese orden.
2. **Llamada real: falta `HAPPYROBOT_TEST_PHONE` en el `.env`.** El resto está puesto
   (API key, webhook token, hook de Espacios con el host bueno de `workflows.platform.eu`,
   y la configuración de Helmcode). Sin el teléfono el backend **no arranca**: lanza una
   excepción en `config.ts` cuando hay hooks y API key sin número. Compruébalo con
   `./scripts/demo.sh doctor`.
   `cloudflared` ya está instalado (2026.9.1, binario oficial en `/usr/local/bin`), pero
   **en la wifi de la ETSIT el Quick Tunnel es inútil**: el DNS `138.100.x.x` devuelve
   SERVFAIL para todo `trycloudflare.com` y bloquea 8.8.8.8 y 1.1.1.1. Verificado que sí
   funciona `DEMO_TUNNEL=lhr` (localhost.run por SSH): `/health` público OK y el backend
   recibe la URL correcta. HappyRobot y Helmcode sí resuelven en esta red.
3. Sincronizar el prompt desplegado de HappyRobot con el guion actualizado del repo;
   comprobar el extractor `result.data.committedCost` con evidencia real (sin verificar).
4. Ensayar el recorrido con LLM y HappyRobot reales; T17/T18 no se cierran por
   pasar las pruebas simuladas.
5. No existe `docs/specs/T19-demo.md` aunque `TASKS.md` lo enlaza: no hay guion de vídeo.
6. Al integrar el trabajo local de recursos y T20, retirar sus límites presupuestarios
   y recomendaciones `ask_budget`; esas ramas no se han modificado aquí.

## Bloqueos y de quién dependen

| Qué | Depende de | ¿Externo? |
|---|---|---|
| Prompt y extractor de voz desplegados | Responsable de HappyRobot | Sí |
| Ensayo con proveedores reales | Entorno y credenciales del portátil de demo | Sí |
| Integración de recursos y aprendizaje | Sus ramas locales y revisión del equipo | No |

## Ramas vivas sin mergear

- `fix/ventura-cierre-demo`: T40, cierre de la crisis. Sobre `de7919c`, `make check` OK.
- `fix/zhi-demo-readiness`: seed, reset, callbacks obsoletos y `set_gate`. Sobre `de7919c`.
  Toca los mismos ficheros que T40 (`engine.ts`, `workflow-service.ts`, `prompt.ts`).
- `Prueba-de-plataforma-y-llamada-real`: trabajo antiguo de voz y frontend, sin PR.
- `feat/ventura-routing-local`: trabajo local de ciclo de recursos sobre una base anterior.
- `feat/ventura-aprendizaje`: trabajo local T20; incluye memoria `ask_budget`.

## Decisiones pendientes

- Coordinar T38 (ya en main) con las ramas de recursos/aprendizaje y el workflow de voz.
- Qué se graba en el vídeo: `sim` reproducible o una llamada real en el momento clave.
- Si el sistema debe reintentar solo cuando el plan queda incompleto. T40 no lo hace a
  propósito: relanzar el coordinador tras un resultado aceptado es justo lo que T33 quitó.
  Hoy lo dice en pantalla y espera al responsable.

## Avisos para el siguiente agente

- Los campos `contingency`, `autonomousLimit` y `authorized` quedan por compatibilidad,
  pero ya no limitan, autorizan ni aparecen en los prompts o el panel.
- `approve_spend`/`reject_spend` devuelven 409; el giro `reject_spend` devuelve 400.
- JEV conserva su prompt congelado, umbrales, privacidad y efectos desactivados por defecto.
- El script de demo arranca en `rules + sim`. Para probar eventos libres con LLM y llamadas
  simuladas: `DEMO_COORDINATOR_MODE=llm DEMO_CALL_MODE=sim ./scripts/demo.sh up-local`.
- El recorrido tarda entre 75 s y 5 min de reloj real en cerrar, según lo que conteste el
  mundo simulado. Para grabar, sube la velocidad en modo `sim`; con llamadas reales no pases
  de ×2 (el timeout de callback son 180 s de reloj).
- Un plan que acaba en `atascado` no está roto: hay invitados sin sede y nadie tiene nada en
  marcha. Es un desenlace válido y se cuenta como tal.
