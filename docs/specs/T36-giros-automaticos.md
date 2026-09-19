# T36: Giros del jurado en automático (Modo vivo)

El jurado puede seguir pulsando los 8 giros operativos (T37 retira `reject_spend`). Con «Modo vivo» encendido, el reloj también los lanza solo, intercalados con las incidencias, para que la demo no dependa de que alguien pulse.

## Hecho cuando

- [x] Con Modo vivo, el hueco impar (cada 180 s simulados, coordinador libre) aplica el siguiente giro de `TWIST_IDS` que no esté en `twistsApplied` y sea aplicable (no relanza un lounge ya descartado y excluye el giro económico retirado por T37).
- [x] El efecto es el mismo que `POST /simulation/twists`. Los botones siguen siendo idempotentes.
- [x] No se ahoga al coordinador: un evento por intervalo; nada mientras `replanificando`, `esperando_decision` o pausa.
- [x] Misma semilla, misma secuencia de giros. Tests en `backend/test/incidents.test.ts`.
- [x] Contrato y copy del panel actualizados.

## Fuera

- No cambia el incidente inicial del fixture.
- No cambia el adaptador `sim` de llamadas.
- Los botones del jurado no desaparecen.
