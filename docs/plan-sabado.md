# Plan de ejecución — sábado 19, desde las 10:00

> Escrito a las 09:54 del sábado con el estado real de `main` (`2926294`) verificado:
> `make check` pasa y los 86 tests del backend están en verde.
> Entrega: **domingo 20 a las 11:00**. Quedan ~25 horas, menos lo que durmáis.
>
> Este documento manda sobre el reparto hasta la entrega. Si algo aquí choca con
> lo que estabas haciendo, avisa en el grupo antes de seguir.

## 1. Dónde estamos de verdad

**Lo que ya funciona y está mergeado:** contrato cerrado (T3), seed y 10 fixtures (T5),
backend con estado persistente y reglas (T7), motor de eventos (T24), coordinador real
contra LLM probado en los 6 estados (T10), agente de Espacios (T11), panel de 3 columnas
(T4, T8, T23).

**Los tres huecos que deciden el resultado:**

1. **No hay ninguna llamada real terminada de punta a punta.** Hay más avance del que
   dice el tablero (ver abajo), pero todavía no cierra el círculo.
2. **El panel enseña la simulación del navegador, no el backend.** Arranca con
   `VITE_DATA_SOURCE=sim` y lee `frontend/src/domain/script.ts`, un guion de 323 líneas.
   Mientras eso siga así, lo que se ve en pantalla no es el sistema.
3. **El giro no está probado de punta a punta por el motor.** Las reglas invalidan
   compromisos, pero nadie ha demostrado la cadena completa tras un giro real.

**Lo que el tablero no recogía:** Álvaro tiene la rama `Prueba-de-plataforma-y-llamada-real`
sin mergear, con trabajo real: un workflow desplegado en
`platform.eu.happyrobot.ai/deployments/my5asz8ibzd3` que funciona como **Web call** (micro
del navegador), un panel «Avisar a…» y una lista de contactos. Le falta la URL de un
trigger **Webhook** para poder lanzar llamadas por API.

## 2. Cinco decisiones, quince minutos, ahora

Estas bloquean trabajo de otros. No se debaten durante la mañana: se cierran en el café.

| # | Decisión | Bloquea a |
|---|---|---|
| 1 | **Cuántas interacciones reales** enseñamos. Propuesta: una llamada (Espacios ↔ recinto) + un SMS. El resto `sim` etiquetado. | Álvaro y Pep |
| 2 | **Giro principal**: `lounge_unavailable` (luce la restricción Norte/Sur) o `reject_split` (decisión humana que tumba el plan). | Ventura (T16) y el guion del pitch |
| 3 | **Cómo termina la demo**: plan cerrado o limitación abierta y honesta. | Carlos (guion) |
| 4 | **Quién hace de responsable de recinto** al teléfono y con qué respuestas. | El ensayo entero |
| 5 | **Proveedor LLM de la demo** (Cognition o Helmcode) y quién tiene la clave. | Zhi (entorno) |

## 3. Mapa de propiedad — el mecanismo para no pisarnos

Anoche dos personas construyeron el mismo panel. Esto es para que no vuelva a pasar.
**Cada zona tiene un dueño único. Si necesitas tocar una zona ajena, lo pides en el grupo.**

| Zona del repo | Dueño |
|---|---|
| `backend/src/state/`, `backend/src/domain/`, `backend/src/actions/` (salvo adapters de HappyRobot), rutas API | **Zhi** |
| `backend/src/actions/adapters/happyrobot*`, `agent/happyrobot/`, workflows en la plataforma, variables `HAPPYROBOT_*` | **Álvaro** |
| `backend/src/agents/coordinator/`, `backend/src/agents/spaces/`, prompts | **Ventura** |
| `backend/src/agents/catering/`, `backend/src/agents/attendees/` | **Pep** |
| `frontend/` **entero** | **Pep** |
| `docs/`, `TASKS.md`, `escenario/`, pitch y vídeo | **Carlos** |

### El choque que hay que resolver hoy, primero

El trabajo de Álvaro llama a HappyRobot **desde el servidor de Vite** (`frontend/vite.config.ts`,
`frontend/src/components/right/AvisarPanel.tsx`), y el backend ya tiene un adaptador
`happyrobot` para lo mismo. Son dos caminos para la misma cosa, y uno de ellos está en la
zona de Pep.

**Decisión necesaria antes de tocar nada** (Álvaro + Zhi + Pep, 10 minutos):

- **Opción A (recomendada):** la llamada se lanza desde el **backend**, por el adaptador que
  ya existe. El panel solo muestra el resultado. Álvaor mueve su lógica a
  `backend/src/actions/adapters/`. Ventaja: un solo camino, callbacks a `/workflow/results`,
  encaja con el contrato.
- **Opción B:** se queda en el frontend como está. Más rápido hoy, pero el panel en modo
  `api` no verá esas llamadas y tendremos dos verdades.

Elegid una y escribidla en `docs/decisions.md`.

## 4. La mañana: tres carriles en paralelo

No se solapan. Cada uno puede avanzar sin esperar a los otros.

### 🔴 Carril 1 — La llamada real · **Álvaro** · máxima prioridad

Es lo único que no se arregla con horas de código: depende del sponsor, que está
físicamente en el evento. **Que sea lo primero que hagas al llegar.**

1. Merge (o rescate) de `Prueba-de-plataforma-y-llamada-real` para que no divergja más.
2. Pedir al equipo de HappyRobot el **trigger Webhook** del workflow. Es exactamente lo
   que te falta, y lo tienen ellos.
3. Cerrar el círculo: llamada → resultado → `/workflow/results` → compromiso en `/state`.

**Hecho =** una llamada al móvil de un compañero que termina con un compromiso
`aceptado_condiciones` visible en `/state`.

**Escalera de respaldo, en este orden.** Bajar un escalón solo cuando el anterior esté
descartado, y decirlo en el grupo:

1. Llamada telefónica saliente por API ← lo que queremos
2. **Web call por navegador** ← ya funciona hoy, es respaldo válido
3. SMS o email real a un número de prueba
4. Si nada: `sim` **etiquetado como simulado en pantalla**. Nunca presentar una grabación
   como llamada en vivo.

### 🟠 Carril 2 — El panel contra el backend real · **Pep**, con **Zhi** desbloqueando

Esto es lo que mata `script.ts`.

1. `VITE_DATA_SOURCE=api`, `INITIAL_FIXTURE=calm`.
2. Lanzar el cierre del Pabellón por `POST /events`.
3. Ver agentes, decisión, cronología y KPIs con datos del backend.

**Hecho =** los 3 minutos del guion de demo corren sin tocar la simulación local.

**Reparto para no chocar:** Pep toca `frontend/`, Zhi toca backend y arregla lo que falle.
El contrato ya está cerrado, así que el punto de encuentro es `GET /state`.

### 🟡 Carril 3 — El giro que replanifica de verdad · **Ventura**

Depende de la decisión #2 (qué giro). Todo lo demás lo tienes ya en el motor.

Que el giro elegido, lanzado por el motor real, produzca la cadena completa:
liberar reserva → invalidar compromisos → subir `planVersion` → cancelar tareas →
encolar reavisos.

**Hecho =** antes/después visible en el panel, con compromisos en `invalidado` y tareas nuevas.

## 5. Dependencias

```
DECISIONES (10:00, 15 min)
   │
   ├─ #1 ──→ Carril 1 (Álvaro) ─── T6 ──→ T9 ──→ T13 Transporte (si sobra tiempo)
   │                                 │
   ├─ #2 ──→ Carril 3 (Ventura) ── T16 ─┤
   │                                 │
   ├─ #5 ──→ Carril 2 (Pep+Zhi) ── api ─┤
   │                                 │
   │                                 ▼
   ├─ #3 ─────────────────────→ T17 INTEGRACIÓN (Zhi) ──→ T18 entorno (Zhi)
   │                                 │
   └─ #4 ─────────────────────→ T19 ENSAYO + VÍDEO (Carlos)
                                     │
                                     ▼
                              CONGELACIÓN 22:00 ──→ domingo: 3 ensayos ──→ entrega 11:00
```

**Lo único que bloquea a todos los demás es T6.** Si a las 14:00 no hay llamada real,
se baja un escalón de la escalera de respaldo y se sigue: no se espera.

## 6. Bloques horarios

| Cuándo | Qué pasa |
|---|---|
| **10:00** | Café de 15 min: las 5 decisiones + resolver el choque frontend/backend de HappyRobot |
| **10:15–14:00** | Los tres carriles en paralelo |
| **14:00** | **Punto de control.** Cada carril dice: hecho / bloqueado / bajando un escalón. Si T6 no ha cerrado, se decide el respaldo aquí |
| **14:00–18:00** | Integración (Zhi, T17). Pep: T15 control humano + T14 SMS. Álvaro: T13 si T6 cerró. Carlos: guion del pitch escrito |
| **18:00** | El recorrido completo tiene que correr entero una vez |
| **18:00–22:00** | Ensayo x2, T18 entorno y reset fiable, **vídeo de respaldo grabado** |
| **22:00** | 🧊 **CONGELACIÓN.** Nada nuevo. Solo bugs de lo que ya existe |
| **Domingo 09:00** | Instalación desde limpio + 3 ensayos |
| **Domingo 10:00** | Entrega interna revisada |
| **Domingo 11:00** | Entrega oficial |

**Regla de recorte si se va tarde:** cae primero el bonus (T20), luego los agentes de
Catering y Transporte (quedan en `sim` etiquetado), luego el SMS. **Nunca se recortan:**
la llamada real, la intervención humana, un giro, y el ensayo.

## 7. Higiene pendiente (10 minutos, alguien que tenga un hueco)

- Borrar la rama obsoleta `feat/ventura-specs-cerebro` (su contenido ya está en `main`).
- El PR #17 dejó commits `LOGS (to delete)` y `more logs`. Confirmar que el logging de
  depuración está fuera antes de la demo.
- Cada uno: completar su `.env` con las variables nuevas de `.env.example`.
- Añadir `Prueba-de-plataforma-y-llamada-real` al tablero o renombrarla a
  `feat/alvaro-prueba-voz`, que es la que dice `TASKS.md`.
