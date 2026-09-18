<!--
  PARA EL EQUIPO: reglas que solo aplican al frontend.
  El agente lee el AGENTS.md más cercano al archivo que edita, así que esto se suma al AGENTS.md raíz
  y tiene prioridad sobre él cuando se trabaja dentro de frontend/.
  Rellenar el viernes en cuanto se elija el stack: sobre todo la sección "Comandos".
-->

# Frontend: instrucciones para agentes

## Stack

- Framework: [por decidir, p. ej. Next.js + Tailwind]
- Componentes UI: [por decidir]

## Comandos

<!-- Deben coincidir con lo que ejecuta `make check` en el Makefile raíz. -->

- Instalar: `npm install`
- Arrancar en local: `[p. ej. npm run dev]`
- Lint: `[p. ej. npm run lint]`
- Build: `[p. ej. npm run build]`

## Estructura

<!-- Rellenar cuando exista código. Una línea por carpeta. -->

## Reglas

- La URL del backend sale de `NEXT_PUBLIC_API_URL` (ver `.env.example`), nunca hardcodeada.
- Los tipos y formatos de datos siguen `docs/api-contract.md`. Si el backend aún no existe, crea un mock con ese mismo formato.
- Prioriza el flujo de la demo: la pantalla que se enseña en el pitch primero, todo lo demás después.
- Muestra estados de carga y de error: en la demo en directo las APIs pueden tardar.
