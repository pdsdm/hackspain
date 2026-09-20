# Escenario congelado y storyboard técnico del vídeo

## Relato en una frase

Zhivel convierte dos incidentes encadenados —la pérdida de la sede de 600 VIP y el bloqueo posterior de su acceso de catering— en un plan compartido por Espacios, Catering, Transporte y Asistentes, y explica con honestidad qué queda confirmado y qué sigue condicionado.

## Hechos que no cambian

- MADRING supera los 100.000 asistentes; el bloque directamente afectado es de 600 invitados VIP de hospitalidad.
- El Pabellón Principal está en MADRING Sur, aloja inicialmente a los 600 y queda cerrado por una avería de agua.
- Pabellón B tiene 450 plazas y Lounge Sur 150. Juntos cubren 600 sin cambiar de zona.
- Pabellón Norte C tiene 600 plazas, no abre antes de las 13:45 y exige traslado exterior desde Sur.
- Norte y Sur no tienen conexión interior para invitados, servicios o personal.
- El bloqueo de Muelle Este afecta al catering de B y Lounge; no reduce sus plazas.
- Recepción dispone de seis personas y se coordina mediante Asistentes, no mediante un quinto agente.

## Qué es real y qué es simulado

| Elemento | Etiqueta correcta |
|---|---|
| Backend, estado, validación T46, mapa y aplicación de planes | Ejecución real del sistema |
| Reasoning Agent `Orquestador`, `consult_world` y `submit_plan` | Coordinador principal real en HappyRobot; el backend valida y aplica |
| Runs del workflow `Demo Incident Inputs` | Runs reales de HappyRobot |
| Contenido de la llamada y del SMS | Incidentes simulados para la demo |
| Telefonía de los inputs | No se usa: lote y SMS son sintéticos |
| Tool `emitir_llamada` del coordinador | Una llamada real HappyRobot al contacto autorizado de Transporte; run de voz auditable |
| Acciones persistidas de especialistas | Simuladas y visibles como `sim`; no duplican la llamada |
| Modo `--inputs=api` | Respaldo simulado sin run HappyRobot |

En pantalla y narración, el lote de centralita y el SMS se presentan como incidentes simulados vía HappyRobot. Solo la acción de Transporte se presenta como «llamada real controlada al teléfono de pruebas»; nunca como conversación con un proveedor externo real.

## Inputs literales

### Input 1 · lote de centralita simulado

- `channel`: `call`
- `actor`: `SIMULACIÓN · Centralita MADRING`
- `incidentId`: `inbox_batch`
- Contenido: diez mensajes sintéticos con marcas entre `+0 ms` y `+3600 ms`. Nueve son ruido operativo —guardarropa, marketing, tiempo, facturas, acreditaciones, tienda, café y música— y uno informa de la rotura:

> URGENTE: una rotura de tubería obliga a cerrar el Pabellón Principal de hospitalidad. No tenemos una hora confirmada de reapertura.

El Reasoning Agent debe mostrar `10 recibidos · 1 relevante · 9 descartados`, consultar el mundo y actuar solo por la rotura.

### Input 2 · SMS simulado

- `channel`: `sms`
- `actor`: `SIMULACIÓN · Logística MADRING`
- `incidentId`: `dock_blocked`
- Texto:

> Urgente: un camión de televisión bloquea el Muelle Este. CAT-01 y CAT-02 no pueden descargar.

## Estados y checkpoints

| Momento | Estado esperado | Versión y semántica | Evidencia visual |
|---|---|---|---|
| M0 · inicio | `calm`; Principal confirmado; cero incidentes | `planVersion=1` | Mapa estable, 600/600 y cronología limpia |
| M1 · triaje | Lote visible; 9 mensajes descartados; Principal cerrado por la única señal material; 600 VIP sin sede confirmada | El coordinador parte de `planVersion=1` y aplica el primer plan como v2 | Contador 10/1/9, Principal rojo, actor simulado y 600 afectados |
| M2 · primer ciclo | Propuesta B 450 + Lounge 150; acciones de las cuatro áreas; condiciones aún visibles | Primer ciclo del coordinador sobre v2; propuesta no equivale a confirmación | B/Lounge pendientes, panel de agentes, compromisos y razones |
| M3 · SMS | Muelle Este cerrado; CAT-01 y CAT-02 bloqueadas; el plan de plazas pierde viabilidad de servicio | T46 aplica el giro sobre el estado vigente y lanza otro ciclo; no se promete un número de versión nuevo | Muelle y rutas de entrega rojos, incidencia «SMS · simulado» |
| M4 · segundo ciclo | Espacios conserva o revisa plazas; Catering busca descarga alternativa; Transporte revisa shuttles; Asistentes redistribuye recepción y segmenta mensajes | Segundo ciclo del coordinador con ambos fallos presentes | Objetivos, dependencias, resultados y cronología de las cuatro áreas |
| Final | Plan cerrado si todas las condiciones se confirman; en otro caso, plan condicionado con plazas, servicio y pendientes explícitos | Nunca `resolved=true` con capacidad, acceso, catering o ejecución abiertos | Tarjeta Resultado, compromisos y cero afirmaciones falsas |

## Qué debe verse por widget

### Mapa

- Principal cerrado en rojo tras M1.
- Pabellón B y Lounge Sur como alternativas, no como confirmados por inferencia.
- Muelle Este cerrado y entregas bloqueadas tras M3.
- Rutas Norte/Sur solo con traslado exterior cuando se evalúe Norte C.

### KPIs

- El bloque afectado suma exactamente 600.
- Las plazas confirmadas se separan de las asignadas o propuestas.
- Informados solo aumenta con evidencia de entrega del mensaje.

### Incidencias activas

- Principal: cerrado, 600 VIP afectados, canal llamada y actor simulado.
- Muelle Este: bloqueado, 600 servicios afectados, canal SMS y actor simulado.
- Máximo tres incidencias; no se crea otra fuente de verdad.

### Cronología

- Distingue llamada, SMS, sistema y simulación.
- Muestra primero el cierre del Principal y después el bloqueo del muelle.
- Conserva las acciones y resultados sin ocultar condiciones.

### Panel de agentes

- Espacios: confirmar B/Lounge o evaluar Norte C.
- Catering: confirmar cantidades, dieta, horario, muelle alternativo y recepción.
- Transporte: confirmar destinos de los cuatro shuttles y cualquier traslado exterior.
- Asistentes: coordinar seis personas de recepción y mensajes segmentados.
- Cada área muestra estado, objetivo, motivo y último resultado.

### Compromisos y Resultado

- Un compromiso con condiciones no aparece como confirmado.
- El final enumera plazas, servicio y pendientes.
- No quedan llamadas `en_curso` ni tareas obsoletas del plan anterior.

## Storyboard de la toma

| Bloque | Acción del operador | Narración recomendada |
|---|---|---|
| Apertura | Mostrar mapa estable y panel | «Más de 100.000 personas llegan a MADRING. Zhivel coordina el bloque de hospitalidad de 600 VIP.» |
| Primer input | Mostrar el contador 10/1/9 y mantener Principal visible | «Diez mensajes llegan en menos de cuatro segundos. HappyRobot descarta nueve y actúa solo por la rotura de tubería.» |
| Primer plan | Seleccionar Principal, B/Lounge y la llamada de Transporte | «El Reasoning Agent propone el plan; nuestro backend lo valida y aplica: 450 más 150 en Sur. Transporte negocia ahora mediante una llamada real controlada.» |
| Segundo input | Seleccionar Muelle Este y entregas | «Un SMS simulado avisa de que un camión de televisión bloquea el muelle del nuevo plan.» |
| Replan | Recorrer Catering, Transporte y Asistentes | «Zhivel no repite el plan: vuelve a coordinar accesos, entregas, shuttles, recepción y mensajes.» |
| Cierre | Abrir compromisos y Resultado | «El sistema distingue lo confirmado de lo condicionado y deja un plan que el equipo puede ejecutar.» |

## Ejecución reproducible

Toma principal, con runs HappyRobot:

```bash
npm --prefix backend run demo:video -- --inputs=happyrobot --rehearsals=3
```

Respaldo, con el mismo contrato T46 sin HappyRobot:

```bash
npm --prefix backend run demo:video -- --inputs=api --rehearsals=3
```

El director crea cada ensayo desde `calm`, valida los checkpoints observables y actualiza evidencia en `.demo/`. No escribe SQLite directamente ni aplica snapshots intermedios. Que el comando pase no significa que se haya grabado una toma.

## Final principal

El resultado preferido es un plan ejecutable o condicionado con:

- 450 plazas en Pabellón B y 150 en Lounge Sur cuando ambos tengan evidencia válida.
- Muelle Este marcado como no utilizable.
- Alternativa de catering con horario, cantidades, dieta y recepción explícitos; si falta confirmación, queda condicionada.
- Cuatro shuttles con destino coherente y sin cruce interior Norte/Sur.
- Seis personas de recepción distribuidas sin inventar personal.
- Mensajes segmentados actualizados solo cuando la instrucción vigente cambia.

## Final de respaldo

Si no se confirma una solución completa:

- Se muestran las plazas realmente confirmadas y el déficit exacto.
- Norte C se presenta como alternativa desde las 13:45, condicionada a traslado exterior y aceptación del retraso.
- Catering o accesos pendientes permanecen visibles.
- El resultado es `Plan condicionado` o `atascado`, nunca `Plan cerrado`.

## Recortes permitidos

Se puede omitir una negociación saliente adicional y el detalle individual del staff. No se recortan los dos incidentes, los dos ciclos del coordinador HappyRobot, las cuatro áreas visibles, la etiqueta de simulación ni el final honesto.
