<!--
  PARA EL EQUIPO: cómo está montado el entorno agéntico y con qué tiempos corre.
  Todos los números salen del código (clock.ts, executor.ts, engine.ts), no de recuerdos.
  Si cambias un timeout o un intervalo, cámbialo también aquí.
-->

# El entorno agéntico: entidades, tiempos y montaje

## 1. Ejemplo completo del flujo

Escenario: son las 12:15 (`simSeconds: 44100`) y se cae el Pabellón Principal.

```
  t+0s    POST /events  {source: jury, kind: lounge_unavailable}
            │
            ├─ El motor encola el evento (cola en serie, uno cada vez)
            ├─ Lo escribe en `events` y en la cronología
            └─ Aplica el efecto determinista: el Lounge deja de estar disponible
            │
  t+0s    Corre el COORDINADOR  ── 20-40 s reales si es LLM, instantáneo si es `rules`
            │
            └─ Devuelve lectura + plan nuevo + compromisos + acciones
                 · planVersion 1 → 2
                 · compromisos que dependían del Lounge → `invalidado`
                 · tareas del plan viejo → `cancelled`
                 · acciones nuevas encoladas
            │
  t+40s   pump()  ── coge hasta 3 tareas a la vez
            │
            ├─ Escribe la llamada en `calls[]`: `en_curso`, `simulated: false`
            ├─ El agente del área pasa a `llamada`
            └─ POST al hook de HappyRobot (timeout 10 s reales)
                 └─ 200 → tarea `dispatched` y se arma un `no_answer` a +180 s de reloj
            │
          [ la persona habla con el agente de voz ]
            │
  t+95s   POST /workflow/happyrobot/results
            │
            ├─ El traductor normaliza el cuerpo nativo del workflow
            ├─ `recordResult` en transacción: ¿duplicado? ¿misma planVersion?
            ├─ Tarea → `completed`, llamada → `terminada` con transcripción
            ├─ El compromiso pasa a `aceptado_condiciones`
            └─ Se desarma el `no_answer`: la tarea ya no está `dispatched`
            │
  t+95s   Evento interno {source: happyrobot, kind: call_result}
            │
            └─ El coordinador vuelve a correr con el dato nuevo → vuelta al principio
```

El panel ve todo esto haciendo polling de `GET /state` **cada 2 segundos**.

## 2. Entidades que puedes montar

### Agénticas

| Entidad | Cuántas | Dónde vive |
|---|---|---|
| **Coordinador** | 1 | En proceso, `backend/src/agents/coordinator/`. Decide el plan, no habla con nadie |
| **Especialistas** | 4: `espacios`, `catering`, `transporte`, `asistentes` | Un workflow de HappyRobot por área, detrás de su hook |
| **Adaptadores de salida** | 2: `happyrobot`, `sim` | Se elige solo según haya hook + API key |
| **Puertas de entrada** | 2: `/workflow/results` (estricta) y `/workflow/happyrobot/results` (traducida) | `backend/src/app.ts` |

La lista de áreas es **cerrada**, está en `contracts/api.ts`. Un área inventada devuelve `400`.

### Del mundo

Viven dentro del documento de estado de la ejecución activa:

| Entidad | Qué representa | Quién la mueve |
|---|---|---|
| `spaces` | Pabellones, lounges, zonas de espera | Coordinador y resultados de Espacios |
| `commitments` | Acuerdos con contrapartes y sus condiciones | Coordinador. **Una llamada nunca confirma** |
| `agents` | Los cuatro especialistas y su estado | Motor y resultados |
| `calls` | Cada llamada, SMS o email, con su transcripción | Ejecutor y callbacks |
| `decisions` | Elecciones operativas explícitas; nunca aprobaciones económicas (T38) | Coordinador e intervenciones |
| `guestGroups` | Los tres grupos de invitados, con informados y aceptados | Agente de Asistentes |
| `shuttles`, `deliveries`, `gates` | Transporte, catering y accesos | Reloj y resultados |
| `budget` | Previsión (o sin estimar) y costes comprometidos; límites legacy sin efecto | Propuestas y resultados con coste explícito |
| `events` | Cronología. **Solo se guardan las últimas 80** | Todo |
| `twistsApplied` | Giros ya aplicados, para que repetirlos sea idempotente | Jurado |

### De infraestructura

`demo_runs` (una ejecución con su `planVersion`) · `dispatch_tasks` (la cola) ·
`task_results` (idempotencia por `eventId`) · `workflow_events` (idempotencia del coordinador).

## 3. Cada cuánto se suelta cada cosa

**La distinción que importa: hay segundos reales y segundos de reloj.** El reloj de
simulación hace `tick()` **cada 1000 ms reales** y avanza `CLOCK_SPEED` segundos de
escenario. Con `CLOCK_SPEED=1` coinciden; con 6, un segundo real son seis de escenario.

| Qué | Cada cuánto | Unidad |
|---|---|---|
| Tick del reloj | 1000 ms | **real** |
| `pump()` de la cola | En cada tick, más al encolar y tras cada pasada del coordinador | **real** |
| Tareas por `pump()` | Máximo 3, despachadas en paralelo | — |
| Polling del panel | 2 s | **real** |
| Timeout del POST al hook | 10 s | **real** |
| Coordinador LLM | 20-40 s por plan | **real** |
| Duración pintada de una llamada | 90 s (`endsAfter`) | **reloj** |
| Resultado del adaptador `sim` | 20-40 s tras despachar | **reloj** |
| **Timeout del callback → `no_answer`** | **180 s tras despachar** | **reloj** |

> **La trampa.** Si subes `CLOCK_SPEED` para que la demo vaya rápida, **aceleras el timeout
> pero no la conversación real**. Con `CLOCK_SPEED=6` esos 180 segundos de reloj son 30
> reales: el agente aún está hablando y el backend ya ha dado la llamada por perdida. Con
> llamadas reales no pases de `CLOCK_SPEED=2`. Acelera solo en modo `sim`.

## 4. Cómo montar el entorno

### Lo mínimo, sin nada externo

```bash
./scripts/setup.sh
./scripts/demo.sh up-local
```

Arranca en `rules` + `sim`: coordinador determinista, llamadas fingidas, cero credenciales.
El recorrido completo funciona y las llamadas salen **etiquetadas como simuladas** en el
panel.

### Las cuatro combinaciones

|  | `CALL_MODE=sim` | `CALL_MODE=real` |
|---|---|---|
| **`rules`** | Nada externo. El de arranque | Llamadas reales con plan determinista |
| **`llm`** | Plan real con llamadas fingidas. Bueno para ensayar el guion | La demo de verdad |

```bash
DEMO_COORDINATOR_MODE=llm DEMO_CALL_MODE=real ./scripts/demo.sh up
```

`up` levanta además un túnel y le pasa la URL al backend como `PUBLIC_BASE_URL`. El
preflight comprueba que existan las variables antes de arrancar nada, sin mostrar sus
valores; `./scripts/demo.sh doctor` lo dice sin arrancar.

Por defecto usa un Quick Tunnel de Cloudflare. **En la wifi de la ETSIT no sirve**: su DNS
no resuelve `trycloudflare.com` y bloquea los resolvers externos. Ahí va
`DEMO_TUNNEL=lhr`, que abre el túnel por SSH contra `localhost.run` sin cuenta.

### Qué exige cada modo

**Coordinador `llm`**: una clave cualquiera de `COGNITION_API_KEY`, `DEVIN_API_KEY`,
`OPENAI_API_KEY`, `HELMCODE_API_KEY` o `ANTHROPIC_API_KEY`. Sin ninguna, cae a `rules`.

**Llamadas `real`**: las cuatro a la vez — `HAPPYROBOT_API_KEY`, `HAPPYROBOT_TEST_PHONE`
(E.164, se valida al arrancar), `HAPPYROBOT_WEBHOOK_TOKEN` y al menos un
`HAPPYROBOT_HOOK_*`. El hook, con el host bueno:

```
https://workflows.platform.eu.happyrobot.ai/hooks/<id>
```

### Otros comandos

```bash
./scripts/demo.sh status            # procesos y endpoints
./scripts/demo.sh reset calm        # ejecución limpia
./scripts/demo.sh restart-backend   # conserva SQLite y la URL pública
./scripts/demo.sh down
```

### Cómo empujar el mundo

| Quieres | Haz |
|---|---|
| Meter un giro | `POST /simulation/twists` con uno de los 8 (lista cerrada) |
| Contar algo en lenguaje natural | `POST /events` con `source: chat`, `kind: free_text`. **Necesita LLM** |
| Forzar una llamada | `POST /events` con `kind: call_request`. Funciona también en `rules` |
| Intervenir como humano | `POST /interventions`: aprobar, pausar, restringir, coger la llamada |
| Volver a empezar | `POST /simulation/reset` con uno de los 7 fixtures |

## 5. Tres cosas que se rompen siempre

1. **Reiniciar durante una llamada simulada.** Los resultados `sim` están programados solo
   en memoria: al reiniciar se pierden y la llamada se queda `en_curso` para siempre. Haz
   `reset` antes de ensayar.
2. **El túnel caduca.** Tanto los Quick Tunnel como `localhost.run` cambian de URL al
   arrancar. Por eso el workflow debe usar el `callbackUrl` que viene en el payload y nunca
   una URL copiada a mano.
3. **`agentsPaused` no cancela.** Pausar impide despachos nuevos, pero lo que ya salió
   sigue su curso.

## 6. Dónde seguir

- Contrato de los endpoints: [`api-contract.md`](api-contract.md)
- Prompt, variables y tools del agente de voz: [`../agent/happyrobot/AGENTE-VOZ.md`](../agent/happyrobot/AGENTE-VOZ.md)
- Qué hace cada giro: [`giros-y-contingencias.md`](giros-y-contingencias.md)
- Estado real del proyecto: [`ESTADO.md`](ESTADO.md)
