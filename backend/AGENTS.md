<!--
  PARA EL EQUIPO: reglas que solo aplican al backend.
  El agente lee el AGENTS.md más cercano al archivo que edita, así que esto se suma al AGENTS.md raíz
  y tiene prioridad sobre él cuando se trabaja dentro de backend/.
  Rellenar el viernes en cuanto se elija el stack: sobre todo la sección "Comandos".
-->

# Backend: instrucciones para agentes

## Stack

- Lenguaje / framework: [por decidir, p. ej. Python + FastAPI]
- LLM / agentes: [por decidir]
- Persistencia: [por decidir, lo más simple posible: SQLite o memoria]

## Comandos

<!-- Deben coincidir con lo que ejecuta `make check` en el Makefile raíz. -->

- Instalar: `[p. ej. pip install -r requirements.txt]`
- Arrancar en local: `[p. ej. uvicorn app.main:app --reload --port 8000]`
- Tests: `[p. ej. pytest -q]`
- Lint: `[p. ej. ruff check .]`

## Estructura

<!-- Rellenar cuando exista código. Una línea por carpeta. -->

## Reglas

- Los endpoints deben coincidir con `docs/api-contract.md`.
- Llamadas a APIs externas (LLM, sponsor) centralizadas en un único módulo cliente, nunca repartidas por el código.
- Leer configuración y claves desde variables de entorno, nunca hardcodeadas.
- Si una API externa falla durante la demo, devuelve un error claro en vez de colgarte (pon timeout en las llamadas).
