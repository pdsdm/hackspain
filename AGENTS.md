<!--
  PARA EL EQUIPO (los agentes también leen esto, así que es breve):
  - Este archivo lo leen Codex, Cursor, Copilot, Gemini, etc. Claude Code lo lee a través de CLAUDE.md.
  - Aquí van SOLO reglas estables que valen para todo el repo.
  - NO va aquí: tareas en curso (TASKS.md), decisiones y su porqué (docs/decisions.md),
    detalle de una feature (docs/specs/), reglas solo de backend o frontend (su propio AGENTS.md).
  - Límite: menos de 150 líneas. Más texto = más coste y el agente no rinde mejor.
  - Añade una regla a "Lecciones aprendidas" solo cuando el agente repita el mismo error 2 veces.
  - Cambios a este archivo: por PR y avisando al equipo.
-->

# AGENTS.md

## Proyecto

Hackathon ETSIT-UPM 2026: 36 horas, 5 personas. Track: **HappyRobot, "¿Puede la IA gestionar una crisis?"** (enunciado y criterios en `README.md`).
Idea: gestión de eventos con un caso de crisis en directo. Llamadas, SMS y email van por la plataforma HappyRobot.
Objetivo: demo funcional en `main` antes del domingo a las 11:00.
Prioridad: que funcione > que se entienda en la demo > que el código sea elegante.

## Comandos

- Setup inicial: `./scripts/setup.sh`
- Verificar todo antes de dar algo por terminado: `make check`
- Comandos del backend: ver `backend/AGENTS.md`
- Comandos del frontend: ver `frontend/AGENTS.md`

## Mapa del repo

- `backend/`: API, agentes de IA, integración con la API del sponsor
- `frontend/`: UI de la demo
- `docs/specs/`: una spec corta por feature (define qué significa "hecho")
- `docs/decisions.md`: decisiones tomadas y su porqué
- `docs/api-contract.md`: contrato backend ↔ frontend (fuente de verdad)
- `TASKS.md`: quién hace qué, en qué rama y en qué estado
- `.agents/skills/`: procedimientos repetibles (p. ej. `cerrar-tarea`)

## Antes de empezar una tarea

1. Busca la tarea en `TASKS.md`. Si no está, pide al humano que la añada antes de programar.
2. Si la tarea tiene spec en `docs/specs/`, léela: sus criterios de aceptación son la definición de "hecho".
3. Si tocas la comunicación entre backend y frontend, lee `docs/api-contract.md`.
4. Antes de proponer una librería o cambiar el stack, revisa `docs/decisions.md`.

## Reglas

- Trabaja en la rama de tu tarea (`feat/<nombre>-<tarea>`). Nunca hagas commit directo a `main`.
- Cambios mínimos: no refactorices ni "mejores" código ajeno a la tarea.
- No añadas dependencias sin proponer antes una línea en `docs/decisions.md`.
- No cambies endpoints ni formatos de datos sin actualizar `docs/api-contract.md` en el mismo PR, y avísalo en la descripción.
- Secretos solo en `.env`. Si necesitas una variable nueva, añádela vacía a `.env.example`.
- No modifiques `AGENTS.md` salvo que el humano te lo pida explícitamente.
- Si algo es ambiguo y bloquea, pregunta. Si no bloquea, elige lo más simple y dilo en el resumen.

## Definición de hecho

- `make check` pasa.
- Los criterios de aceptación de la spec (si existe) se cumplen.
- La fila de la tarea en `TASKS.md` está actualizada.
- Resumen final al humano: qué cambió, cómo probarlo y qué queda pendiente.

## Commits y PRs

- Mensajes cortos: `feat: …`, `fix: …`, `docs: …`
- PR pequeño con 2 líneas: qué hace y cómo probarlo.

## Lecciones aprendidas

<!--
  PARA EL EQUIPO: reglas nacidas de errores repetidos del agente.
  Formato: "- No hagas X; haz Y (motivo)". Máximo ~10; si crece, poda las que ya no aplican.
-->
