# T29: Mundo ampliado — paddock, parkings, más accesos, muelle Norte

## Qué y para qué

Añade 7 lugares al mundo MADRING sin tocar los que existen. Da al coordinador alternativas reales (segundo acceso, muelle Norte) y sitios donde pasan cosas (paddock, parkings). Es la base de T30, T31 y T32. Plan completo: [`../plan-mundo-dinamico.md`](../plan-mundo-dinamico.md).

## Criterios de aceptación

- [ ] `seed.json`, `world.json` y `states/calm.json` incluyen `paddockNorte`, `parkingNorte`, `parkingSur`, `accesoSur2`, `accesoNorte2`, `accesoPaddock` y `muelleNorte` con zona, aforo y `pos` coherentes con el plano Norte/Sur.
- [ ] `SpaceKind` admite `paddock` y `parking` en `frontend/src/domain/types.ts` y en el contrato. Ningún id ni campo existente cambia.
- [ ] `GET /state` con `INITIAL_FIXTURE=calm` devuelve 5 accesos y los 3 lugares nuevos. Los otros 6 fixtures cargan sin cambios.
- [ ] El mapa Leaflet y el plano pintan los tipos nuevos con icono propio; los accesos nuevos muestran `entered` y `waiting`.
- [ ] `consult_world` con zona `norte` devuelve `muelleNorte` y `accesoNorte2`. `scenario.ts` los describe al LLM sin cambiar el prompt.
- [ ] `make check` pasa. Tests de fixtures actualizados.

## Fuera de alcance

- Afluencia, vehículos e incidencias (T30, T31, T32).
- Cambiar rutas de shuttles o entregas existentes.

## Notas

- Archivos: `backend/fixtures/madring/{seed,world}.json`, `states/calm.json`, `backend/fixtures/madring.ts` si genera estados, `frontend/src/components/map/CrisisMap.tsx`, plano, `docs/api-contract.md`.
- Zona: seed y world → Carlos; frontend → Pep; verificación del prompt → Ventura.
