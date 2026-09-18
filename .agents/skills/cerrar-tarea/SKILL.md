---
name: cerrar-tarea
description: Úsala cuando una tarea del hackathon está implementada y hay que dejarla lista para mergear (verificar, actualizar TASKS.md, commit y PR).
---

<!--
  PARA EL EQUIPO: una "skill" es un procedimiento que el agente carga solo cuando lo necesita,
  así no ocupa espacio en AGENTS.md. Invocadla con "cierra la tarea" o, en Claude Code, con /cerrar-tarea.
  Está en .agents/skills/ y .claude/skills es un enlace simbólico a esta carpeta.
-->

# Cerrar tarea

1. Ejecuta `make check`. Si falla, arréglalo antes de seguir; no desactives tests ni lint para que pase.
2. Si la tarea tiene spec en `docs/specs/`, repasa cada criterio de aceptación e indica cómo se cumple.
3. Si has cambiado endpoints o formatos, confirma que `docs/api-contract.md` está actualizado.
4. Si has añadido variables de entorno, confirma que están (vacías) en `.env.example`.
5. Actualiza la fila de la tarea en `TASKS.md` a `review`.
6. Commit con mensaje corto (`feat: …` / `fix: …`) en la rama de la tarea y push.
7. Abre el PR a `main` con 2 líneas: qué hace y cómo probarlo.
8. Resume al humano: qué cambió, cómo probarlo y qué queda pendiente.
