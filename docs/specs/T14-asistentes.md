# T14: Agente de Asistentes y avisos segmentados

## Qué y para qué

El especialista que avisa a los 600 invitados cuando cambia su destino, por segmentos y no en bloque, y devuelve al estado cuántos han recibido y aceptado la instrucción. Es el SMS real de la demo (plan: «una llamada + un SMS») y lo que mueve el KPI «Informados».

## Criterios de aceptación

- [x] Hay una plantilla por segmento (`g-acceso`, `g-shuttles`, `g-propios`) y por canal (`sms`, `email`) en `backend/src/agents/attendees/`, con el texto del §6.5 del escenario: destino, hora, «no entres por Norte». Máximo 300 caracteres el SMS.
- [x] Solo se avisa a un grupo cuya instrucción vigente cambia (`assignedSpaceId` distinto al que recibió). Un grupo ya informado del destino correcto no recibe otro mensaje.
- [ ] Los 12 invitados con accesibilidad y los 38 con dieta de `g-propios` generan una tarea aparte (`kind: call` o `sms`) que pregunta si la alternativa cubre su necesidad; el resultado deja `needs` cubierto o pendiente, nunca lo borra.
- [x] El extractor traduce el resultado (`POST /workflow/results` o `sim`) a `data.guestGroups[]` con `informedCount` y `acceptedCount`, y el backend los aplica a `guestGroups` en `/state`. «Enviado», «entregado» y «aceptado» son cuentas distintas.
- [x] Un mensaje que HappyRobot no confirma como entregado no suma a `informedCount`.
- [ ] Con `HAPPYROBOT_HOOK_ASISTENTES` y clave, un SMS llega a un móvil del equipo y su resultado aparece en `/state` con `simulated: false`. Sin hook, la llamada va por `sim` y el panel la etiqueta «simulada».

## Fuera de alcance

- Decidir a qué espacio va cada grupo: eso es del coordinador (T10).
- El roster individual de invitados: `/state` sigue exponiendo solo `guestGroups`.
- Catering (T12) y Transporte (T13).
- El workflow de HappyRobot en la plataforma: lo crea Álvaro (T9); esta tarea consume su callback.

## Notas

- Referencia de estructura: `backend/src/agents/spaces/` (`prompt.ts`, `extract.ts`, `types.ts`).
- Endpoints: `POST /workflow/results` (`docs/api-contract.md`). `workflow-service.ts` ya aplica `data.guestGroups`; el contrato conserva el ejemplo y sus límites.
- El coordinador crea tareas `area: asistentes, kind: sms` tras un giro y el adaptador `sim` devuelve `data.guestGroups` para mover el KPI sin HappyRobot.
- El payload saliente incluye `kind` y `channel` (`call` | `sms` | `email`) para que el hook
  del área no infiera el canal. La prueba real del criterio anterior sigue pendiente.
- Tipos: `GuestGroup` en `frontend/src/domain/types.ts`. `needs` es texto libre hoy; no cambiar el tipo.
- Zona: `backend/src/agents/attendees/` es de Pep. `workflow-service.ts` es de Zhi: avisar.
