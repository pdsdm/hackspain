# Resumen: de la idea al alcance de la demo

> Documento de trabajo para la sesión de equipo del sábado. Objetivo: acordar el alcance de la solución y de la demo (actores, acciones, decisiones), comprobar el encaje con el track y salir con las siguientes tareas repartidas en `TASKS.md`.
>
> Estado del repo a fecha de este resumen: `main` en PR #17. `make check` pasa. Sin PRs abiertas.

## 1. Idea inicial (lo que ya decidimos)

- **Track:** HappyRobot, "¿Puede la IA gestionar una crisis?" (`README.md`).
- **Escenario (D4):** Nexo Events opera un bloque de hospitalidad de 600 invitados el domingo de GP en MADRING. A las 12:15 una avería cierra el Pabellón Principal (Sur) a 45 min de la apertura. Restricción dura: Norte y Sur no se conectan por el interior (`escenario/escenario.md`).
- **Arquitectura de agentes:** un **coordinador** que mantiene el estado y decide, y cuatro **especialistas** (Espacios, Catering, Transporte, Asistentes) que hablan con personas y ejecutan.
- **Reparto de responsabilidades:** el coordinador propone; el backend valida reglas duras (aforo, zona, gasto, versión de plan); HappyRobot solo conversa (voz/SMS/email); el humano aprueba, rechaza, restringe o pausa.
- **Promesa del producto:** convertir la crisis en un plan compartido que espacios, catering, transporte e invitados puedan ejecutar, y mantenerlo actualizado cuando la realidad cambie.
- **Demo de 3 minutos** (escenario §13): entender → ver actuar → coordinar → giro del jurado → resultado.

## 2. Estado actual (qué hay en `main`)

### Hecho y mergeado

| Bloque | Qué hay | Tareas |
| --- | --- | --- |
| Contrato | `docs/api-contract.md` cerrado: `/state`, `/interventions`, `/simulation/twists`, `/simulation/reset`, `/events`, `/actions`, `/workflow/coordinator/proposals`, `/workflow/results`. `CrisisState` (`frontend/src/domain/types.ts`) es el contrato público (D10). | T3 |
| Datos | Seed MADRING, mundo geográfico (`world.json`) y 8 fixtures de estado reproducibles (`calm`, `normal`, `crisis`, `proposal`, `recovered`, giros). | T5 |
| Backend | Express + SQLite. Estado persistente por ejecución, reglas deterministas (aforo, Norte exige traslado, gasto > 1.500 € crea decisión), cola idempotente por `planVersion`. | T2, T7 |
| Coordinador | En proceso, sin SDK. Bucle `evento → LLM → operaciones + consultas al mundo → validación → persistir`. Harness `tools` (function calling) / `json` / `devin`. Proveedores: Cognition SWE (defecto), Helmcode/Deepseek, OpenAI, Anthropic. Probado contra los 6 estados del escenario. | T10, T24 (D11, D12) |
| Motor de eventos | `POST /events` con texto libre produce cambios de mapa y cola en < 60 s. Reloj simulado que avanza. Fixture `calm` a las 12:00 para arrancar "antes" de la crisis. | T24 |
| Agente Espacios | Guion de conversación y extractor de resultados (`backend/src/agents/spaces/`). Sirve para nodo de voz HappyRobot o LLM directo. | T11 |
| Adaptadores | `sim` (devuelve "aceptado con condiciones" con transcript sintético) y `happyrobot` (POST a un hook por área con `taskId/runId/planVersion` y callback a `/workflow/results`). | T7, T24 |
| Frontend | Panel de 3 columnas, tema Zhivel claro: operaciones por área, plano operativo Norte/Sur + mapa Leaflet, KPIs, coordinador y agentes, llamada, decisión, cronología, chat de eventos, panel de simulación con los 9 giros, modal de intervención. Fuente de datos `sim` o `api`. | T4, T8, T23 |

### Todavía no existe

- **Ninguna llamada real.** T6 (validar cuenta HappyRobot) y T9 (adaptador + callbacks probados de verdad) siguen en `todo` sin rama. Los `HAPPYROBOT_HOOK_*` están vacíos. Hoy todo lo que "habla" lo hace el adaptador `sim`.
- **Agentes de Catering, Transporte y Asistentes** (T12, T13, T14): sin guion ni extractor. Solo Espacios tiene entregable.
- **Replanificación explícita** (T16): las reglas invalidan compromisos de versiones anteriores, pero no hay prueba de que un giro produzca la cadena "liberar reserva → cancelar tareas → reavisar afectados → comprobar aceptación".
- **Control humano completo** (T15): `/interventions` existe y se registra; falta comprobar que `pause`, `set_constraint`, `take_call` cambian de verdad lo que hace el coordinador después.
- **Aprendizaje entre ejecuciones** (T20, bonus): nada.
- **Entorno de demo, vídeo de respaldo, pitch** (T17, T18, T19, T21): nada.
- Frontend arranca por defecto con `VITE_DATA_SOURCE=sim`: la pantalla que enseñamos aún no está validada de punta a punta contra el backend real.

### Deuda de coordinación

- Rama `origin/feat/ventura-specs-cerebro` obsoleta (su contenido ya está en `main`).
- PR #17 dejó commits `LOGS (to delete)` / `more logs` en `main`: confirmar que el logging de depuración se ha retirado antes de la demo.
- Cada uno debe completar su `.env` local con las variables nuevas de `.env.example` (proveedor LLM, `HAPPYROBOT_*`).

## 3. Alcance de la solución: actores, acciones, decisiones

Lo que sigue es una propuesta para discutir. La regla: cada actor debe poder responder "¿qué hace en la demo y qué evidencia deja?". Si no lo sabemos, o lo recortamos o lo simulamos etiquetado.

### 3.1. Actores

| Actor | Rol | Quién lo encarna en la demo | Canal |
| --- | --- | --- | --- |
| Coordinador (IA) | Lee el estado, decide prioridad, asigna tareas, escala decisiones | Backend (`agents/coordinator`) | interno |
| Espacios (IA) | Confirma alternativas con el recinto | HappyRobot voz (guion T11) | **llamada real** |
| Catering (IA) | Redistribuye entregas, descubre la condición del muelle | HappyRobot voz o `sim` | llamada / sim |
| Transporte (IA) | Reencamina shuttles, valida puntos de parada | HappyRobot voz o `sim` | llamada / sim |
| Asistentes (IA) | Avisos segmentados (en acceso / en shuttle / por su cuenta) | HappyRobot SMS/email | **mensaje real** |
| Responsable de operaciones (humano) | Aprueba gasto, rechaza dividir, fija restricción, pausa, toma una llamada | Quien presenta, desde el panel | UI |
| Responsable de recinto (humano) | Da capacidades, horarios, condiciones | Miembro del equipo al teléfono | voz |
| Jurado | Introduce giros o interpreta un proveedor | Panel de simulación o teléfono | UI / voz |
| Mundo simulado | Reloj, posiciones, aforos, puertas | `world.ts` + fixtures | interno |

**Preguntas para el equipo**

1. ¿Cuántas llamadas reales caben en 3 minutos con latencia real? Propuesta: **una** (Espacios ↔ recinto) que descubre una condición ("el lounge no está hasta las 13:15") y **un** SMS real a un invitado. El resto por `sim`, etiquetado en el panel.
2. ¿Quién hace de recinto al teléfono y con qué guion de respuestas para que la condición aparezca siempre?
3. ¿El jurado toca el panel de simulación o preferimos que el giro lo lance el presentador para controlar el tiempo?

### 3.2. Acciones (lo que el sistema ejecuta, no solo propone)

| Acción | Quién la ejecuta | Evidencia en el panel | Estado hoy |
| --- | --- | --- | --- |
| Abrir crisis, identificar dependencias afectadas | Coordinador | `events[]`, `coordinatorStatus`, compromisos invalidados | hecho |
| Asignar consultas con objetivo, contraparte y plazo | Coordinador → cola | `agents[].objective/reason`, `GET /actions` | hecho |
| Llamar al recinto y registrar condiciones | Espacios vía HappyRobot | `calls[]` con transcript, compromiso `aceptado_condiciones` | **pendiente T6/T9** |
| Reasignar grupos a espacios sin exceder aforo | Coordinador + reglas | `guestGroups[].assignedSpaceId`, KPI cobertura | hecho |
| Reencaminar shuttle / redirigir entrega | Coordinador (`reroute_shuttle`, `redirect_delivery`) | mapa y plano | hecho |
| Pedir autorización de gasto > 1.500 € | Reglas T7 | `decisions[]` pendiente, `waitingForDecision` | hecho |
| Enviar aviso segmentado a invitados | Asistentes vía HappyRobot SMS | KPI "informados" con evidencia de entrega | **pendiente T14** |
| Invalidar y reavisar tras un giro | Coordinador (T16) | `planVersion` sube, compromisos `invalidado`, nuevas tareas | parcial |
| Escritura persistente comprobable | SQLite (`runs`, `tasks`, `events`) | reset crea otra ejecución; la anterior queda | hecho |

**Preguntas para el equipo**

4. ¿Qué acción "fuera del sistema" enseñamos como prueba de ejecución real? Opciones: la llamada, el SMS, o ambas. El jurado puntúa "ejecuta o solo propone".
5. ¿Enseñamos `GET /actions` o la base de datos como evidencia persistente, o basta con la cronología del panel?

### 3.3. Decisiones (dónde el sistema decide y dónde decide el humano)

| Decisión | La toma | Cuándo aparece en la demo |
| --- | --- | --- |
| Qué información cambia el plan (cierre confirmado vs. rumor) | Coordinador | 0:00–0:25, al abrir la crisis |
| Qué va primero (espacios antes que catering; muelle antes que confirmar servicio) | Coordinador | 0:25–1:15 |
| B + Lounge Sur (dividir, 3.200 €) vs. Norte C (600 juntos, retraso 13:45, traslado) | Coordinador propone, humano autoriza | 1:15–1:50 |
| Autorizar gasto sobre el límite autónomo | Humano | 1:15–1:50 |
| Aceptar apertura escalonada / retraso | Humano | 1:15–1:50 |
| Invalidar compromisos tras giro y elegir alternativa | Coordinador | 1:50–2:35 |
| Rechazar dividir la hospitalidad → forzar Norte C | Humano (giro `reject_split`) | 1:50–2:35 (opción) |
| Mostrar limitación honesta (p. ej. 50 sin plaza) en vez de declarar resuelto | Coordinador + reglas | 2:35–3:00 |

**Preguntas para el equipo**

6. ¿Qué giro elegimos como principal para la demo? Candidatos: `lounge_unavailable` (fuerza explorar Norte y visibiliza la restricción Norte/Sur) o `reject_split` (decisión humana que invalida todo el plan). Los otros 7 quedan como respaldo si el jurado pregunta.
7. ¿La demo termina con el plan cerrado o con una limitación abierta? El escenario dice que una recuperación honesta puede dejar cosas pendientes; el jurado lo puntúa en "cómo se supervisa".

## 4. Encaje con el track

| Criterio del jurado | Cómo lo cubrimos | Hueco |
| --- | --- | --- |
| **Decide** sin todos los datos | Coordinador separa confirmado / condicionado / pendiente; `unverified[]` | Enseñar explícitamente qué dato sigue sin verificar |
| **Prioriza** | `agents[].reason` en una frase por acción | Que la frase salga del LLM, no de un fixture |
| **Adapta** | Giros + `planVersion` + invalidación | T16 sin prueba de punta a punta |
| **Coordina** personas, info y medios | Dependencias entre áreas (muelle → recinto + recepción) | Solo Espacios tiene guion; las otras 3 áreas hablan en `sim` |
| **Ejecuta** fuera del sistema | Adaptador HappyRobot + callbacks | **0 llamadas reales hasta hoy** (T6/T9) |
| **Control** humano | `/interventions` + modal | Verificar que pausar/restringir cambia lo que hace el coordinador |
| **Creatividad** | MADRING real, Norte/Sur, cuenta atrás de carrera | Contarlo bien en el pitch |
| **Aprendizaje** (bonus) | Nada | T20: solo si lo principal ya funciona el sábado tarde |

Los obligatorios están cubiertos en diseño y en código salvo **"Interacción de verdad"**, que hoy depende de tareas sin empezar. Es el riesgo número uno.

## 5. Propuesta de siguientes tareas (para repartir en la sesión)

Orden por riesgo para la demo, no por elegancia:

1. **Llamada real de Espacios (T6 + T9, Álvaro).** Cuenta HappyRobot, un workflow de voz con el guion T11, hook → `/workflow/results`. Criterio: una llamada al móvil de un compañero que termina con un compromiso `aceptado_condiciones` en `/state`. Bloquea todo lo demás; poner dos personas si hace falta.
2. **Panel en modo `api` de punta a punta (Pepe + Zhi).** `VITE_DATA_SOURCE=api`, `INITIAL_FIXTURE=calm`, lanzar el cierre por `/events`, ver agentes, decisión y cronología con datos del backend. Criterio: los 3 minutos del guion sin tocar la simulación local.
3. **Giro principal + replanificación demostrable (T16, Ventura).** Elegir el giro (pregunta 6), comprobar que invalida compromisos, cancela tareas y encola reavisos. Criterio: antes/después visible en el panel de cambios.
4. **SMS real de Asistentes (T14, Pep).** Un aviso segmentado real a un número de prueba con evidencia de entrega. Segunda prueba de "ejecuta de verdad".
5. **Control humano verificado (T15, Pep).** Aprobar gasto y `reject_split` cambian el plan; `pause` detiene despachos. Criterio: test HTTP + demo manual.
6. **Guiones de Catering y Transporte (T12, T13).** Solo si sobra tiempo tras 1–5; si no, quedan en `sim` etiquetado.
7. **Entorno de demo, vídeo de respaldo y pitch (T18, T19, T21).** Empezar el vídeo en cuanto 1–3 funcionen; no dejarlo para el domingo por la mañana.
8. **Higiene:** borrar `feat/ventura-specs-cerebro`, retirar logs de depuración de PR #17, completar `.env` de cada uno.

Bonus T20 (aprendizaje) solo si al cierre del sábado la demo principal corre entera al menos dos veces seguidas.

## 6. Decisiones que hay que tomar hoy

- [ ] Número y tipo de interacciones reales en la demo (pregunta 1, 4).
- [ ] Giro principal y desenlace de la demo (preguntas 6, 7).
- [ ] Quién hace de recinto al teléfono y su guion de respuestas (pregunta 2).
- [ ] Proveedor LLM por defecto para la demo (Cognition SWE vs. Helmcode) y quién tiene las claves.
- [ ] Hora límite para congelar features y pasar a ensayo + vídeo.
