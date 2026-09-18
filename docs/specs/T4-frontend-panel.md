# T4: Panel de supervisión (frontend)

## Qué y para qué

Pantalla única del centro de operaciones MADRING (escenario §10 y §13): mapa, estado de las 4 áreas, agentes, llamada en curso, compromisos, decisión pendiente, cronología e intervención. Incluye un motor de simulación en el navegador que reproduce la crisis 12:15 → 12:25 y los giros del jurado (§9), para que la demo funcione aunque el backend no esté. Con `VITE_DATA_SOURCE=api` consume el backend según `docs/api-contract.md`.

## Criterios de aceptación

- [x] `make check` pasa (`npm run lint` + `npm run build` en `frontend/`).
- [x] `npm run dev` abre el panel; a las 12:15 el mapa muestra el Pabellón Principal cerrado y las 4 áreas muestran el impacto.
- [x] La cuenta atrás hasta las 13:00 avanza a la velocidad elegida (1×, 5×, 20×) y se puede pausar.
- [x] La columna derecha muestra la tarjeta de llamada con transcripción durante 12:16 y 12:17.
- [x] A las 12:18 aparece la decisión (3.200 € frente a 1.500 €); el guion espera; **Aprobar** continúa, **Rechazar** invalida la propuesta y abre la alternativa Norte C.
- [x] Cada giro del "Control de simulación" invalida al menos un compromiso, añade una entrada a la cronología y actualiza los KPIs.
- [x] La franja de KPIs muestra confirmados, informados, catering, llegada coordinada, coste previsto/comprometido/autorizado y condiciones críticas como cifras separadas.
- [x] `VITE_DATA_SOURCE=api` hace polling de `GET /state`; si el backend no responde, se muestra un aviso y la UI no se rompe.
- [x] El layout funciona a 1920×1080 y no desborda a 1366×768.
- [x] `docs/api-contract.md`, `docs/decisions.md`, `TASKS.md`, `frontend/AGENTS.md` y `.env.example` actualizados en el mismo PR.

## Fuera de alcance

- Backend real, agentes de HappyRobot y llamadas reales (van por `POST /interventions` y `GET /state`).
- Pestañas distintas de "Vista general" (solo etiquetas).
- Aprendizaje entre ejecuciones (bonus).

## Notas

- Estado y lógica de simulación: `frontend/src/domain/` (`script.ts` = guion, `twists.ts` = giros e intervenciones).
- Cambiar de fuente de datos: `frontend/src/data/useCrisisState.ts`.
- Mapa: OSM con filtro oscuro (CARTO exige API key). Necesita internet para los tiles.
