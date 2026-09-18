# Cómo contribuimos este finde

Reglas mínimas para no pisarnos el código con 5 personas y 36 horas.

## Branches

- `main` es sagrado: siempre tiene que arrancar.
- Cada tarea → su rama: `feat/<nombre>-<tarea-corta>` (ej. `feat/pablo-integracion-embat`).
- Rama corta: ábrela, curra, PR, mergea. No dejar ramas más de medio día sin mergear.

## Commits

Mensajes cortos y claros, no hace falta convención estricta, pero sí que se entiendan:

```
feat: añade endpoint de login
fix: arregla parseo de fechas en el agente
docs: actualiza README con instrucciones de deploy
```

## Pull Requests

- Abre el PR en cuanto tengas algo que funcione, aunque sea un MVP feo.
- Descripción de 2 líneas: qué hace y cómo probarlo.
- Un compañero le echa un vistazo rápido (2 min) antes de mergear — no bloquees por perfeccionismo.
- Si rompes `main`, revert inmediato y arreglas en rama aparte.

## Trabajar con agentes

Flujo de una tarea:

1. **Apunta la tarea** en `TASKS.md` (tu fila, estado `doing`). Si tiene más de un paso no trivial, crea su spec copiando `docs/specs/_plantilla.md`.
2. **Crea rama y worktree**, para que tu agente trabaje en su propia copia y no pise a nadie:
   ```bash
   git worktree add ../hackspain-<tarea> -b feat/<nombre>-<tarea>
   cp .env ../hackspain-<tarea>/   # el .env no se copia solo
   cd ../hackspain-<tarea>
   ```
3. **Arranca el agente con la spec**: "implementa `docs/specs/T4-subida-pdf.md`".
4. **Cierra con la skill** `cerrar-tarea` (`make check`, actualizar `TASKS.md`, commit, PR).
5. Tras mergear: `git worktree remove ../hackspain-<tarea>`.

Normas para no pisarnos:

- En `TASKS.md` cada uno edita **solo su fila**; las tareas nuevas van al final.
- `AGENTS.md` y `docs/api-contract.md` solo se cambian por PR y **avisando al grupo**: afectan a todos los agentes.
- ¿El agente repite un error? Añade una línea en "Lecciones aprendidas" de `AGENTS.md` (por PR). ¿Es algo puntual de tu tarea? Díselo en el prompt o ponlo en tu spec, no en `AGENTS.md`.

## Reparto de tareas sugerido (5 personas)

Ajustadlo según el track elegido el viernes, pero como punto de partida:

- 1-2 personas → backend / lógica del agente / integración con la API del track
- 1-2 personas → frontend / demo visual
- 1 persona → pitch, storytelling, README, vídeo de backup, y de comodín donde haga falta

## Antes de cada demo/checkpoint

- `main` debe correr con `./scripts/setup.sh` sin errores.
- README actualizado con cómo levantar el proyecto.
