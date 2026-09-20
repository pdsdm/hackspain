# Cambios en los workflows de HappyRobot (T59)

Las tres versiones publicadas están bloqueadas (`is_version_locked: true`), así que cada cambio exige una versión nueva.

| Workflow | Versión revisada | Cambio |
| --- | --- | --- |
| Orquestador | `3vb1dgcwmyqr` | **Obligatorio.** Reapuntar `emitir_llamada` al backend. |
| Voice agent outbound | `w357ezfkhbqe` | Revisar el nombre de la variable del token del transcript. |
| Voice agent inbound | `7axzyarqckaf` | Quitar del prompt la referencia a una tool que no existe. |

## Orden

El orden importa. La regla dura es que `CALLS_ON_DEMAND=true` va **al final**: con la variable puesta y el nodo antiguo, no sale ninguna llamada.

1. Mergear T59 y esperar el despliegue de Railway. Así el endpoint existe antes de que el nodo apunte a él.
2. Validar el endpoint con un `curl` de área inválida (abajo). No marca a nadie.
3. Publicar la versión nueva del Orquestador.
4. Poner `CALLS_ON_DEMAND=true`.

### Validación sin llamar a nadie

```bash
curl -s -X POST https://hackspain-production.up.railway.app/workflow/coordinator/happyrobot/call \
  -H "Authorization: Bearer $HAPPYROBOT_WEBHOOK_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"area":"prueba","objective":"validar el endpoint"}'
```

Respuesta esperada, que confirma ruta y token sin crear ninguna tarea:

```json
{"ok":false,"stale":false,"error":"area \"prueba\" no existe; usa una de: espacios, catering, transporte, asistentes","taskId":null,"callId":null,"status":null}
```

`401` significa token distinto al de Railway. `404` significa que T59 todavía no está desplegada.

---

## 1. Orquestador: `emitir_llamada` apunta al backend

Hoy ese nodo hace POST a `https://workflows.platform.eu.happyrobot.ai/hooks/my5asz8ibzd3`, con el teléfono copiado de un directorio escrito en el prompt. Eso deja fuera al backend: el número del panel no se usa, y el resultado vuelve con un `taskId` que el backend no conoce, así que `POST /workflow/happyrobot/results` responde 404 y la respuesta de la contraparte se pierde.

**URL nueva**

```
POST {{data.backend_base_url}}/workflow/coordinator/happyrobot/call
```

`data.backend_base_url` ya llega en el trigger. No escribas el dominio a mano: en local es un túnel y cambia.

**Cabeceras** — las mismas que `consult_world` y `submit_plan`:

```
Content-Type: application/json
Authorization: Bearer {{HAPPYROBOT_COORDINATOR_TOKEN}}
```

**Parámetros de la tool** — solo estos seis. Quita `contact_phone`, `callId`, `taskId`, `callbackUrl` y `transcriptCallbackUrl`: ahora los pone el backend.

| Parámetro | Requerido | Qué es |
| --- | --- | --- |
| `area` | sí | `espacios`, `catering`, `transporte` o `asistentes` |
| `objective` | sí | el encargo literal que oirá la contraparte |
| `counterpart` | no | con quién se habla |
| `reason` | no | por qué ahora; se muestra al responsable humano |
| `run_id` | no | el del trigger, sin tocar |
| `plan_version` | no | la del trigger, sin tocar |

**Cuerpo**

```json
{
  "run_id": "{{data.run_id}}",
  "plan_version": "{{data.plan_version}}",
  "area": "{{area}}",
  "objective": "{{objective}}",
  "counterpart": "{{counterpart}}",
  "reason": "{{reason}}"
}
```

**Respuesta**

```json
{ "ok": true, "stale": false, "error": null, "taskId": "7a31…", "callId": "call-7a31…", "status": "dispatched" }
```

- `status: "dispatched"` — ya está sonando.
- `status: "queued"` o `"busy"` — en cola porque otra llamada sigue en curso, o porque la mesa está detenida. Sale sola en cuanto se libera la línea. **No reintentar.**
- `stale: true` — el plan cambió. Parar sin reintentar, igual que en `consult_world`.

**Quita del prompt del nodo el directorio de teléfonos.** Si el número sigue escrito ahí, el modelo lo leerá en voz alta o intentará mandarlo, y ya no sirve para nada: el destino lo decide el panel. El `system_prompt` que inyecta el backend ya explica cómo se usa la tool.

La respuesta **no** trae lo que dijo la contraparte. Llega después como un evento nuevo, con su resumen, y abre otra ejecución del Orquestador. Lo que dependa de esa llamada va en `unverified`.

---

## 2. Voice agent outbound: el token del transcript

En `reportar_transcript` el Bearer usa la variable `HAPPYROBOT_WEBHOK_TOKEN`. Falta una `O`. Si la variable real del workspace es `HAPPYROBOT_WEBHOOK_TOKEN`, el Bearer sale vacío y `POST /workflow/happyrobot/transcript` responde 401, así que el panel nunca enseña la conversación en directo. Con `ignore5XX: true` el fallo es silencioso, porque 401 no es 5XX.

Comprueba cuál de los dos nombres existe de verdad y déjalos iguales. El valor tiene que coincidir con `HAPPYROBOT_WEBHOOK_TOKEN` de Railway.

Lo demás de este workflow encaja con el backend y no hay que tocarlo:

- Los parámetros con punto (`contact.phone`, `situation.simSeconds`) son los que manda el backend.
- Los cinco `outcome` y los cuatro valores de `availability` son los que el backend reconoce.
- El doble envío de resultado (`registrar_resultado` y luego `Notify External System`) no hace daño: el segundo llega con la tarea ya cerrada, así que se registra pero no se aplica. Gana el primero, que es el que trae `data.spaces`.

Un detalle de entorno: en staging el destino está fijado a `+34623199787`. Si usas el hook de staging, el teléfono del panel se ignora en la plataforma. Para la demo, producción.

---

## 3. Voice agent inbound: la tool fantasma

El prompt manda «llamar siempre a la herramienta de registro de resultado», pero ese nodo no existe en este workflow: el resultado lo calcula `Calcular outcome final` después de colgar. El validador lo marca como `tool_does_not_exist`.

Quita esa frase del prompt. Si no, el agente pierde turnos buscando una tool que no está.

Aviso aparte, de operación y no de configuración: `enviar_orquestador` hace POST a `/events`, y ese endpoint responde 409 mientras la mesa está detenida. Una llamada entrante antes de pulsar «iniciar» se pierde entera. Inicia la operación antes de abrir el teléfono.

---

## Cómo se comprueba

1. Publica la versión nueva del Orquestador.
2. Pon `CALLS_ON_DEMAND=true` en Railway.
3. Inicia la operación en el panel.
4. Manda un input real. En los logs de Railway busca, por orden: `[coord] happyrobot run`, `[action] dispatch … adapter=happyrobot`, `[action] happyrobot accepted`.
5. Suena **un** teléfono, una sola vez por encargo. El destino es el del panel.
6. Contesta y di no. Comprueba que llega `[workflow] result … applied=true`, que la cronología muestra «Resultado de llamada (rejected): …» y que el espacio queda descartado.
7. El plan siguiente tiene que elegir otra alternativa, no repetir la misma.
