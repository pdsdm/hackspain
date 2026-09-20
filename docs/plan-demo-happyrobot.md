# Plan de desarrollo — demo con dos inputs simulados vía HappyRobot

El escenario, los textos y el storyboard ejecutable están congelados en [`docs/video-scenario.md`](video-scenario.md).

## Recorrido congelado

MADRING opera con más de 100.000 asistentes. Una rotura de tubería cierra el Pabellón Principal y deja sin sede a los 600 invitados VIP de hospitalidad. Mientras el coordinador prepara Pabellón B (450) + Lounge Sur (150), llega por SMS que un camión de TV bloquea el Muelle Este que sirve ambos espacios. El segundo input vuelve incompleto el primer plan y fuerza otro ciclo de coordinación.

Los dos inputs son incidentes simulados lanzados mediante runs reales del workflow HappyRobot `Demo Incident Inputs`: una llamada y un SMS. El backend los valida y serializa; no recibe parches de estado generados por el modelo. Actores y cronología indican `SIMULACIÓN`.

## Qué debe verse

1. Pabellón Principal cerrado y 600 VIP sin sede.
2. Plan intermedio B + Lounge y acciones de los cuatro especialistas.
3. Muelle Este cerrado, CAT-01/CAT-02 bloqueadas y compromisos invalidados.
4. Segundo plan con nuevo muelle, rutas, condiciones, staff y mensajes.
5. Runs HappyRobot visibles para ambos inputs; las acciones de especialistas pueden usar `sim` etiquetado.
6. Si se usa una negociación saliente real, su transcript crece durante la llamada y queda accesible al terminar.
7. Resultado `Plan cerrado` o `Plan condicionado`, con límites explícitos.

## Carriles

| Carril | Responsable | Tareas |
|---|---|---|
| Relato y grabación | Ventura, revisión Carlos | T45, T48, T52 |
| Ingesta y robustez | Zhi | T46, revisión T48, T52 |
| HappyRobot y coordinación | Ventura | T44, T47, T48, T50 |
| Transcripción en directo | Devin | T22 |
| Transporte | Álvaro | T13, parte de T51 |
| Especialistas y UI | Ventura, revisión Carlos | T49, parte de T51 |

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

### G2 · Runs HappyRobot

- Un run con canal `call` crea `principal_pipe_burst` una vez.
- Un run con canal `sms` crea `dock_blocked` una vez.
- Los actores indican `SIMULACIÓN`; evidencia y canal son visibles y los duplicados no mutan el estado.
- Si se usa la negociación saliente, muestra turnos nuevos en pocos segundos y conserva el transcript completo al terminar (T22).

### G3 · Ejecución

- Los dos inputs conservan un run HappyRobot revisable.
- Los canales y acciones simulados aparecen como simulados.
- Final reproducible desde `calm`.

### G4 · Grabación

- Toma maestra, toma HappyRobot y respaldo simulado.
- Voz y subtítulos añadidos después.
- Sin secretos, claims falsos ni esperas ocultas.

## Recorte

Se puede recortar el detalle individual del staff y una negociación saliente. No se recortan los dos incidentes simulados, sus runs HappyRobot, los dos ciclos del Reasoning Agent, las cuatro áreas visibles, el director reproducible ni el final honesto.

Por D20, T44 es el coordinador principal de la toma: HappyRobot propone mediante herramientas y el backend valida y aplica.
