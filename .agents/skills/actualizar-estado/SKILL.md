---
name: actualizar-estado
description: Úsala para refrescar docs/ESTADO.md con la situación real del proyecto (qué funciona, qué falta, qué bloquea). Invócala al empezar una sesión, tras mergear algo importante, o cuando el humano pida "en qué punto estamos".
---

<!--
  PARA EL EQUIPO: este procedimiento existe porque el contexto de una sesión de agente se
  pierde. docs/ESTADO.md es la memoria escrita del proyecto: cualquier agente nuevo, de
  cualquier herramienta, empieza leyéndolo y lo deja actualizado al terminar.
  Dueño del documento: Carlos (coordinación). Cualquiera puede regenerarlo.
-->

# Actualizar el estado del proyecto

Regenera `docs/ESTADO.md` desde la realidad del repo, no desde lo que recuerdes ni desde
lo que diga una conversación previa.

## Regla de oro

**Verifica, no supongas.** Cada afirmación de `ESTADO.md` sale de un comando que has
ejecutado. Lo que no hayas podido comprobar se escribe marcado como `(sin verificar)`.
Es preferible un estado corto y cierto que uno completo e inventado.

## 0. Antes de nada: la versión de Node

```bash
nvm use 22
```

El repo exige Node ≥ 22.13 (`backend/package.json`, campo `engines`). Con Node 20
`make check` falla con dos errores que **parecen del repo y no lo son**: el glob de
`node --test` no expande y `node:sqlite` no existe. Si ves alguno de los dos, es tu Node.

## 1. Partir siempre de `main`, nunca de una rama local

```bash
git fetch origin
git log --oneline -15 origin/main
```

`main` se mueve rápido. Si lo que tienes delante no es `origin/main`, tu foto ya nace vieja.
Para comprobar cosas sin ensuciar el repo, usa un worktree desechable:

```bash
git worktree add /tmp/estado-check origin/main --detach
```

## 2. Salud del proyecto

```bash
make check                 # tiene que acabar en "✅ make check OK"
cd backend && npm test     # apunta cuántos pasan y cuántos fallan
```

Si algo falla, **comprueba si ya fallaba en `main` antes de tu rama** antes de
atribuírtelo. Un worktree limpio de `origin/main` lo resuelve en un minuto.

## 3. El tablero, y lo que el tablero no cuenta

```bash
git show origin/main:TASKS.md
git branch -r --sort=-committerdate --format='%(committerdate:relative)%09%(refname:short)'
```

**No te fíes solo de `TASKS.md`.** Hay trabajo real en ramas que no figuran en el tablero,
o figuran con otro nombre. Para cada rama que no esté mergeada:

```bash
git log --oneline origin/main..origin/<rama>
git diff --stat origin/main...origin/<rama>
```

Y antes de dar por perdido el trabajo de alguien, comprueba si su rama **ya se mergeó**
por PR: busca su commit en `git log origin/main`. Una rama borrada del remoto suele
significar "PR mergeada", no "trabajo perdido".

## 4. Escribir `docs/ESTADO.md`

Reescríbelo entero con la plantilla que ya tiene. Secciones fijas, en este orden:

1. **Cabecera**: fecha y hora, commit de `main` sobre el que se hizo la foto, y quién/qué
   la generó.
2. **Salud**: resultado de `make check` y de los tests, con números.
3. **Qué funciona** (verificado, con la tarea entre paréntesis).
4. **Qué falta**, ordenado por riesgo para la demo, no por número de tarea.
5. **Bloqueos**: qué está parado y de quién o de qué depende. Marca si la dependencia es
   externa (sponsor, cuenta, clave).
6. **Ramas vivas sin mergear**, con qué hay en cada una.
7. **Decisiones pendientes** que bloquean trabajo de otros.
8. **Avisos para el siguiente agente**: trampas conocidas, cosas que parecen rotas y no lo
   están.

Reglas de redacción: frases cortas, sin adjetivos, y **fechas y commits concretos**.
Nada de "se ha avanzado bastante".

## 5. Si de paso hay que tocar `TASKS.md`

Solo cuando la realidad y el tablero no coincidan: una tarea que ya está hecha y figura
como `todo`, una rama con otro nombre, o una tarea nueva que nadie ha apuntado.

- Cambia **solo** las filas afectadas; las tareas nuevas van al final.
- No toques el estado de la fila de otra persona sin avisar en el grupo: pon lo que
  observas en `ESTADO.md` y díselo al humano.

## 6. Cerrar

```bash
git checkout -b docs/estado-<fecha>
git add docs/ESTADO.md TASKS.md
git commit -m "docs: actualiza ESTADO.md (<commit de main>)"
git push -u origin docs/estado-<fecha>
```

PR a `main` con dos líneas. Nunca commit directo a `main`.

Termina resumiendo al humano, en lenguaje llano: qué ha cambiado desde la foto anterior,
qué bloquea ahora mismo y qué decisión necesita de él.
