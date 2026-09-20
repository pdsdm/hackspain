# T47: workflow HappyRobot de inputs simulados

## Qué y para qué

Un workflow determinista en `development` recibe por API los mensajes congelados de T45 y los reenvía al endpoint T46 como llamada y SMS simulados, sin usar telefonía ni LLM.

## Criterios de aceptación

- [x] El instalador define un trigger API con los campos estrictos requeridos por T46.
- [x] El POST bearer reenvía `inbox_batch`, `principal_pipe_burst` de respaldo y `dock_blocked` sin operaciones ni parches.
- [x] `channel`, `actor`, URL y session ID vienen del trigger; los actores indican `SIMULACIÓN`.
- [x] El bearer vive en una variable oculta de HappyRobot, no en código ni documentación.
- [x] El instalador no modifica workflows existentes y es idempotente por nombre.
- [ ] Un owner crea y publica `Demo Incident Inputs` en `development`.
- [ ] Dos runs reales del workflow crean un único evento cada uno en T46.
- [x] Instalación, variables y procedimiento de ensayo quedan documentados sin secretos.

## Si la key no puede crear el workflow

Con una key sin permiso de owner la API devuelve `403 Cannot create use cases`. El montaje
equivalente paso a paso en la UI está en
[`docs/happyrobot-demo-incident-inputs.md`](../happyrobot-demo-incident-inputs.md).

## Fuera de alcance

Modificar workflows salientes o cambiar el contrato T46. El coordinador principal se decide por D20, fuera de T47.
