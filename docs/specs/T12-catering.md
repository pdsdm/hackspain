# T12: Agente de Catering

## Qué y para qué

El especialista que llama al proveedor de catering para que las dos entregas contratadas lleguen a los nuevos espacios con los requisitos alimentarios ya registrados. Dos piezas: el guion con el que negocia (`backend/src/agents/catering/prompt.ts`) y el extractor con el que su respuesta vuelve al estado como datos (`extract.ts`). El adaptador `sim` devuelve `deliveries[]` para que la demo mueva las entregas sin HappyRobot.

## Criterios de aceptación

- [x] El guion pide, en este orden: cantidades, muelle, hora, requisitos alimentarios, personal y coste.
- [x] Un sí con condición («entrar por el muelle este y que recepción lo abra») produce un `Commitment` `aceptado_condiciones` con sus `conditions[]` y una dependencia con responsable (`recinto`, `recepcion` o `catering`), no un rechazo.
- [x] Una hora de llegada posterior a la apertura es una condición, no un descarte.
- [x] Un requisito alimentario no garantizado añade una condición aunque el proveedor diga que sí. El agente no inventa garantías.
- [x] Un dato que no aparece queda vacío y sale en `missing[]`. Un `sin_respuesta` no cambia la entrega.
- [x] `result.data.deliveries[]` en `/workflow/results` actualiza `status`, `dockId`, `arriveAt`, `services` y `note` de la entrega. Nunca `entregada` ni `invalidada`, nunca un muelle cerrado, nunca una entrega ya entregada.
- [x] El adaptador `sim` confirma la entrega si su muelle está abierto y la marca `bloqueada` si está cerrado.

## Fuera de alcance

- Realizar la llamada (T6/T9).
- Decidir a qué muelle redirigir: eso lo hace el coordinador con `redirect_delivery`.
- Crear tareas para recepción a partir de `dependencies[]`: el coordinador las ve en `unverified`.

## Notas

- Conversación de referencia: §6.3 de [`escenario/escenario.md`](../../escenario/escenario.md).
- Entregas: CAT-01 (360 servicios) y CAT-02 (240) al Muelle Sur; alternativa Muelle Este Sur.
- Tests: `backend/test/catering.test.ts`.
