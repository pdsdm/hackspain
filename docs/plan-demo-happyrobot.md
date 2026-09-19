# Plan de desarrollo — demo con dos inputs reales HappyRobot

## Recorrido congelado

MADRING opera con más de 100.000 asistentes. Una rotura de tubería cierra el Pabellón Principal y deja sin sede a los 600 invitados VIP de hospitalidad. Mientras el coordinador prepara Pabellón B (450) + Lounge Sur (150), llega por SMS que un camión de TV bloquea el Muelle Este que sirve ambos espacios. El segundo input vuelve incompleto el primer plan y fuerza otro ciclo de coordinación.

Los dos inputs son reales y entran por HappyRobot: una llamada o Web Call de voz y un SMS. El backend los valida y serializa; no recibe parches de estado generados por el modelo.

## Qué debe verse

1. Pabellón Principal cerrado y 600 VIP sin sede.
2. Plan intermedio B + Lounge y acciones de los cuatro especialistas.
3. Muelle Este cerrado, CAT-01/CAT-02 bloqueadas y compromisos invalidados.
4. Segundo plan con nuevo muelle, rutas, condiciones, staff y mensajes.
5. Una negociación saliente real por HappyRobot; el resto puede ser `sim` etiquetado.
6. Resultado `Plan cerrado` o `Plan condicionado`, con límites explícitos.

## Carriles

| Carril | Responsable | Tareas |
|---|---|---|
| Relato y grabación | Carlos | T45, T48, T52 |
| Ingesta y robustez | Zhi | T46, revisión T48, T52 |
| HappyRobot y transporte | Álvaro | T47, parte de T51 |
| Coordinación y staff | Ventura | T45, T50 |
| Especialistas y UI | Pep | T49, parte de T51 |

## Dependencias

```text
T45 ─┬─ T46 ── T47 ─┐
     ├─ T48 ─────────┤
     ├─ T49 ─────────┤
     ├─ T50 ── T51 ──┤
     └─────────────── T52
```

T47 puede preparar los workflows mientras se cierra el contrato T46. T48 puede preparar reset, polling y cues antes de que los inputs externos estén disponibles.

## Gates

### G1 · Recorrido determinista

- Dos incidentes aplicados en orden sobre estado versionado.
- Dos ciclos de coordinador sin tareas zombi ni callbacks obsoletos.
- Mapa, KPIs, cronología y cuatro agentes coherentes.

### G2 · Canales reales

- Voz real HappyRobot crea `principal_pipe_burst` una vez.
- SMS real HappyRobot crea `dock_blocked` una vez.
- Evidencia y canal visibles; duplicados no mutan el estado.

### G3 · Ejecución

- Al menos una negociación saliente real por HappyRobot.
- Los canales simulados aparecen como simulados.
- Final reproducible desde `calm`.

### G4 · Grabación

- Toma maestra, toma HappyRobot y respaldo simulado.
- Voz y subtítulos añadidos después.
- Sin secretos, claims falsos ni esperas ocultas.

## Recorte

Se puede recortar el widget de staff, transporte real y una segunda negociación saliente. No se recortan los dos inputs reales, los dos replans, una interacción saliente real, el director reproducible ni el final honesto.

T44 continúa en shadow y no bloquea esta demo. El coordinador principal sigue siendo Helmcode hasta completar el E2E del piloto HappyRobot.
