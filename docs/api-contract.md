<!--
  PARA EL EQUIPO: contrato entre backend y frontend. Es la fuente de verdad.
  - Permite trabajar en paralelo: el frontend hace mocks con este formato mientras el backend lo implementa.
  - Cambiarlo = PR que lo diga en la descripción y aviso a quien consuma ese endpoint.
  - Si el backend acaba generando OpenAPI automáticamente (p. ej. FastAPI en /docs), este archivo puede
    quedarse como resumen y enlazarlo.
-->

# Contrato de API

Base URL local: `http://localhost:8000` (variable `NEXT_PUBLIC_API_URL` en el frontend)

Errores: todas las respuestas de error usan el formato `{ "error": "mensaje legible" }` con el código HTTP adecuado.

## `GET /health`

<!-- Ejemplo: copia este bloque para cada endpoint nuevo. -->

Comprueba que el backend está vivo.

**Respuesta 200**

```json
{ "status": "ok" }
```
