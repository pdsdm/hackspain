# T5: Datos y fixtures MADRING

Responsable: Carlos. Rama: `feat/carlos-seed`. Formato: `CrisisState` del contrato vigente.

## Qué y para qué
Crear datos sintéticos reproducibles para frontend, backend y pruebas, reutilizando el escenario ya implementado.

## Criterios de aceptación
- [x] 600 invitados únicos: 90 en acceso Sur, 180 en cuatro shuttles y 330 por libre; pases y requisitos explícitos. Evidencia: `backend/fixtures/madring/seed.json` y tests de roster.
- [x] Principal, B 450, Lounge 150 y Norte C 600; entregas 360/240, horarios y presupuesto coherentes. Evidencia: catálogo de recursos, estados y tests de conservación, aforo y presupuesto.
- [x] Ubicación, rutas y traslados exteriores son supuestos de demo; no se concede acceso Norte ni se añaden teléfonos reales. Evidencia: `seed.assumptions`, contactos nulos y tests de permisos/traslados.
- [x] Fixtures de normalidad, cierre, propuesta y giro compatibles con CrisisState y reproducibles, con asignaciones comprobables. Evidencia: seis snapshots, `manifest.json`, cargador frontend y comprobación TypeScript del generador.
- [x] Pruebas de consistencia, regeneración sin diferencias y `make check` pasan. Validado con Node 22.23.2: 18 tests, lint/build de ambas aplicaciones y comparación de los ocho JSON.

## Fuera de alcance
Endpoints, motor de replanificación, UI nueva, ETL y comunicaciones reales.
