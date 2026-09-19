# T11: Agente de Espacios

## Qué y para qué

El especialista que llama al responsable de recinto para conseguir un espacio alternativo. Son dos piezas: el guion con el que negocia y el esquema con el que su respuesta vuelve al estado como datos. Es la llamada que probablemente escuche el jurado.

## Criterios de aceptación

- [ ] El guion pide, en este orden de prioridad: capacidad, zona (Norte o Sur), hora de montaje, accesos, señal de carrera y coste.
- [ ] Trata la disponibilidad condicionada como resultado de primera clase: la respuesta produce un `Commitment` en estado `aceptado_condiciones` con sus `conditions[]`, no un rechazo.
- [ ] De «el lounge está disponible, pero el montaje no termina hasta las 13:15» extrae `readyAt: 47700` en el `Space`, no un `descartado`.
- [ ] Rellena `capacity`, `zone` y el coste que alimenta `budget.forecast`, más el `id` de la llamada en `calls[]` como evidencia.
- [ ] Un dato que no aparece en la conversación queda vacío, nunca inventado ni supuesto.
- [ ] No deja un `Space` en `confirmado` solo porque la llamada se haya realizado.

## Fuera de alcance

- Realizar la llamada: la integración con HappyRobot es de otra tarea.
- Decidir si la condición encaja en el plan: eso es del coordinador (T10).
- Los agentes de Catering, Transporte y Asistentes.

## Notas

- Conversación de referencia: §6.2 de [`escenario/escenario.md`](../../escenario/escenario.md).
- Catálogo inicial: Pabellón B (Sur, 450 plazas), Lounge de Fan Zone Sur (150), Pabellón Norte C (600, `readyAt: 49500`).
- Tipos implicados: `Space`, `Commitment` y `Call` en `frontend/src/domain/types.ts`.
