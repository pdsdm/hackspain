<!--
  PARA EL EQUIPO: reglas que solo aplican al backend.
  El agente lee el AGENTS.md más cercano al archivo que edita, así que esto se suma al AGENTS.md raíz
  y tiene prioridad sobre él cuando se trabaja dentro de backend/.
  Rellenar el viernes en cuanto se elija el stack: sobre todo la sección "Comandos".
-->

# Backend: instrucciones para agentes

## Stack

- Lenguaje / framework: Node.js 22 + TypeScript + Express 5
- LLM / agentes: workflows de HappyRobot detrás de un único adaptador
- Persistencia: SQLite (`node:sqlite`) como motor, con disco persistente. El despliegue va en Railway.

## Comandos

<!-- Deben coincidir con lo que ejecuta `make check` en el Makefile raíz. -->

- Instalar: `npm install`
- Arrancar en local: `npm run dev` (http://localhost:8000)
- Tests: `npm test`
- Lint: `npm run lint`
- Build: `npm run build`

## Estructura

- `src/app.ts`: middleware y composición de rutas HTTP.
- `src/config.ts`: configuración validada desde variables de entorno.
- `src/domain/`: reglas deterministas y aplicación de propuestas.
- `src/state/`: conexión SQLite, esquema, estado y cola transaccional.
- `src/server.ts`: arranque y apagado ordenado del proceso.
- `test/`: pruebas con el runner integrado de Node.js.

## Reglas

- Los endpoints deben coincidir con `docs/api-contract.md`.
- Llamadas a APIs externas (LLM, sponsor) centralizadas en un único módulo cliente, nunca repartidas por el código.
- Leer configuración y claves desde variables de entorno, nunca hardcodeadas.
- Si una API externa falla durante la demo, devuelve un error claro en vez de colgarte (pon timeout en las llamadas).
- Mantener el backend compatible con Node.js 22; no usar APIs posteriores.
