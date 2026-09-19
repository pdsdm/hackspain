# HackSpain 2026 ¿Puede la IA gestionar una crisis?

Proyecto para el [HackSpain 2026](https://hackspain.es) (Madrid, UPM–ETSIT, 18–20 de septiembre). Track de HappyRobot: un sistema agéntico que gestiona una crisis que se mueve mientras corre.

**El tipo de crisis lo elegimos nosotros.** El entorno cambia. Los recursos de voz, chat y email van por la plataforma de [HappyRobot](https://happyrobot.ai).

---

## El reto

En una crisis nunca hay toda la información, y lo que vale a las 12:00 ya no sirve a las 12:20. Un agente con una lista de pasos fija se queda atrás en el primer cambio. El sistema tiene que contestar **estas seis preguntas una y otra vez** mientras la situación cambia:

| Pregunta | Qué implica |
| --- | --- |
| **Qué información importa** | Llegan cien mensajes y solo tres cambian algo. Quedarse con esos tres. |
| **Qué va primero** | Se pueden hacer veinte cosas a la vez. Decir por dónde se empieza ahora. |
| **A quién se avisa y cuándo** | Un vecino, un bombero y un responsable no necesitan lo mismo. |
| **Dónde van los recursos** | Tres ambulancias y cinco sitios que las piden. Mandarlas a un lado es dejar el otro esperando. |
| **Qué se hace ahora** | La siguiente acción concreta y quién la hace. No basta con narrar. |
| **Cuándo tirar el plan** | Cambia el viento y el plan de hace veinte minutos ya no vale. ¿Se da cuenta el sistema? |

Escenario: una crisis que elegimos nosotros.  
Entorno: cambia mientras el sistema corre.  
Recursos: plataforma HappyRobot.

---

## Qué tiene que saber hacer el agente

1. **Enterarse de lo que pasa** Recoger llamadas, mensajes, sensores, APIs. Montar una pantalla donde en dos segundos se vea qué está pasando y qué ha cambiado en los últimos minutos.
2. **Priorizar** De lo abierto, qué se atiende primero y por qué. Con los medios que quedan, no con los que harían falta.
3. **Coordinar la respuesta** Avisar, repartir tareas, seguir quién ha cogido qué. El sistema mueve cosas (llamadas, mensajes, tickets, APIs), no solo las propone.
4. **Adaptarse** A mitad de la ejecución algo cambia (carretera cortada, integración caída, cincuenta personas más). El sistema rehace el plan.

---

## Requisitos de la entrega

| Qué | Qué significa | Estado |
| --- | --- | --- |
| Sistema agéntico | Decide y actúa por su cuenta. Un chatbot que contesta preguntas no entra. | Obligatorio |
| Escenario que se mueve | La situación cambia mientras el sistema corre. Si el caso es fijo, no hay nada que adaptar. | Obligatorio |
| Respuesta de varios pasos | Una cadena de acciones con un objetivo, no una acción suelta. | Obligatorio |
| Interacción de verdad | Llama, escribe, crea tickets o mueve datos en un sistema real. Hablar con una persona cuenta. | Obligatorio |
| Interfaz para la persona | Una pantalla para entender la situación, ver qué está haciendo el sistema e intervenir. | Obligatorio |
| Aprende de interacciones pasadas | Revisa llamadas y decisiones anteriores, ve qué funcionó y ajusta la próxima vez. | Bonus |

---

## Evaluación

Tres bloques al mismo peso: **cómo decide**, **cómo actúa** y **cómo se supervisa**.

**Cómo decide**

- Decisión: ¿decide algo sensato sin tener todos los datos?
- Prioridad: ¿sabe qué va primero cuando todo parece urgente?
- Adaptación: ¿hace algo distinto cuando la situación cambia?

**Cómo actúa**

- Coordinación: ¿lleva a la vez a la gente, la información y los medios?
- Ejecución: ¿ejecuta acciones fuera del sistema o solo las propone? (llamadas, mensajes, tickets, APIs)

**Cómo se supervisa**

- Control: ¿se entiende qué está haciendo y se puede intervenir?
- Creatividad: ¿el escenario y la forma de gestionarlo tienen algo propio?
- Aprendizaje: puntos extra si aprende de ejecuciones anteriores.

La demo cuenta tanto como el sistema. Hay que ensayar el pitch.

---

## Escenario

**Elegido:** operaciones de hospitalidad el domingo de Gran Premio en **MADRING** (IFEMA Madrid). Una avería deja fuera el pabellón principal de 600 invitados a 45 minutos de la apertura; hay que reubicar, rehacer catering y shuttles, y comunicar el plan nuevo. Restricción dura: MADRING Norte y Sur no están conectados por el interior.

Contexto completo: [`escenario/escenario.md`](escenario/escenario.md). Por qué esta idea y qué descartamos: [`docs/decisions.md`](docs/decisions.md) (D4).

HappyRobot pone la plataforma de producción (voz, chat, email) y estará en el evento el fin de semana.

---

## Equipo: zhivel

| Nombre | Rol / foco | GitHub |
|---|---|---|
| Zhi Chen Xiang | | |
| Pepe Moyano Font | | [pdsdm](https://github.com/pdsdm) |
| Carlos Mata Carrillo | | |
| Buenaventura Porcel Esquivel | | [ventura14](https://github.com/ventura14) |
| Álvaro Iglesias Reina | | |

## Quickstart

```bash
git clone https://github.com/pdsdm/hackspain.git
cd hackspain
cp .env.example .env   # rellenar API keys
./scripts/setup.sh     # instala dependencias según lo que haya en backend/ y frontend/
make check             # verifica lint + tests + build
```

Simulación, modo API, endpoints y recorrido HappyRobot: [`docs/guia-pruebas.md`](docs/guia-pruebas.md).

## Estructura del repo

```
.
├── AGENTS.md             # reglas estables para agentes de IA (todo el repo, <150 líneas)
├── CLAUDE.md             # solo importa AGENTS.md (Claude Code no lee AGENTS.md directamente)
├── TASKS.md              # tablero: tarea | responsable | rama | spec | estado
├── Makefile              # `make check` = verificación única antes de dar algo por hecho
├── backend/AGENTS.md     # reglas y comandos solo del backend
├── frontend/AGENTS.md    # reglas y comandos solo del frontend
├── docs/
│   ├── specs/            # una spec corta por feature (copiar _plantilla.md)
│   ├── decisions.md      # decisiones tomadas y su porqué
│   ├── api-contract.md   # contrato backend ↔ frontend (fuente de verdad)
│   └── guia_hackathon.md # horarios, sitios, tracks
├── escenario/
│   └── escenario.md      # escenario MADRING: crisis, agentes, demo
├── .agents/skills/       # procedimientos repetibles para agentes (p. ej. cerrar-tarea)
├── .claude/skills        # enlace simbólico a .agents/skills
├── scripts/              # setup, seed data, utilidades
└── .github/              # templates de issues y PRs
```

## Cómo trabajamos con agentes

Cada uno puede usar el agente que quiera (Claude Code, Codex, Cursor…): todos leen las mismas reglas.
La idea clave es **separar lo que no cambia de lo que cambia cada hora**:

| Si quieres decirle al agente… | Va en… |
|---|---|
| Una regla que vale para todo el proyecto ("nunca hardcodees la URL del backend") | `AGENTS.md` (o el de `backend/` / `frontend/` si solo aplica ahí) |
| Qué tiene que construir ahora y cuándo está terminado | `docs/specs/T<id>-<nombre>.md` |
| Quién hace qué y en qué estado está | `TASKS.md` |
| Algo que hemos decidido y por qué ("usamos FastAPI porque…") | `docs/decisions.md` |
| Cómo se hablan backend y frontend | `docs/api-contract.md` |
| Un procedimiento que se repite (cerrar tarea, preparar demo…) | `.agents/skills/<nombre>/SKILL.md` |

- **`AGENTS.md` no es un diario.** Solo se añade una regla cuando el agente comete el mismo error dos veces, y va a "Lecciones aprendidas".
- **Arranca cada tarea con su spec:** "implementa `docs/specs/T4-subida-pdf.md`".
- **Termina con `make check`** o con la skill `cerrar-tarea`.

Ramas, worktrees y PRs: [`CONTRIBUTING.md`](CONTRIBUTING.md).

## Checklist de entrega (domingo 11:00)

- [ ] Código final en `main`
- [ ] README con problema, solución y cómo correr la demo
- [ ] Demo grabada en vídeo como backup
- [ ] Pitch ensayado (la demo cuenta tanto como el sistema)
- [ ] `.env.example` actualizado (nunca subir `.env` ni API keys)

⚠️ **Lo que no esté subido a las 11:00 del domingo no se evalúa.**

---

## Evento

HackSpain 2026 · Madrid · UPM–ETSIT · 18–20 de septiembre · [@hackspain26](https://x.com/hackspain26)

Reto de HappyRobot para HackSpain 2026.
