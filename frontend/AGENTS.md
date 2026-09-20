<!--
  PARA EL EQUIPO: reglas que solo aplican al frontend.
  El agente lee el AGENTS.md más cercano al archivo que edita, así que esto se suma al AGENTS.md raíz
  y tiene prioridad sobre él cuando se trabaja dentro de frontend/.
-->

# Frontend: instrucciones para agentes

## Stack

- Framework: Vite 8 + React 19 + TypeScript, Tailwind CSS 4 (`@tailwindcss/vite`)
- Mapa: `leaflet` + `react-leaflet` (tiles OpenStreetMap con filtro oscuro)
- Iconos: `lucide-react`
- Lint: `oxlint` (config en `.oxlintrc.json`)

## Comandos

- Instalar: `npm install`
- Arrancar en local: `npm run dev` (http://localhost:5173)
- Lint: `npm run lint`
- Build: `npm run build`

## Estructura

- `src/domain/`: tipos (`types.ts`), estado inicial del escenario, KPIs (`selectors.ts`).
- `src/data/`: `useCrisisState.ts` sondea el backend (siempre real, sin simulación local); `apiClient.ts` habla con `VITE_API_URL`.
- `src/components/layout/`: barra superior y pestañas.
- `src/components/left/`: operaciones por área, incidencia seleccionada, compromisos.
- `src/components/map/`: mapa Leaflet, iconos, capas.
- `src/components/center/`: franja de KPIs.
- `src/components/right/`: coordinador y agentes, llamada, decisión, cronología, modal de intervención, control de simulación.
- `src/components/ui/`: primitivas (`Panel`, `Pill`, `StatBar`) y tablas de estados/colores (`status.ts`).

## Reglas

- La URL del backend sale de `VITE_API_URL` (ver `.env.example`), nunca hardcodeada.
- Los tipos y formatos de datos siguen `docs/api-contract.md`; `src/domain/types.ts` es su reflejo en código. Si cambias uno, cambia el otro.
- Toda la lógica de escenario vive en `src/domain/`; los componentes solo leen `CrisisState` y despachan acciones.
- Prioriza el flujo de la demo: la pantalla que se enseña en el pitch primero, todo lo demás después.
- Muestra estados de carga y de error: en la demo en directo las APIs pueden tardar.
