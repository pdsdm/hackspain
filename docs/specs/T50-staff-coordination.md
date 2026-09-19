# T50: coordinación de staff mediante Asistentes

## Qué y para qué

Mostrar la redistribución de las seis personas de recepción usando el agente de Asistentes y las dependencias existentes, sin crear un quinto agente ni una entidad pública nueva.

## Criterios de aceptación

- [x] El coordinador conoce la restricción `Recepción disponible: 6 personas`.
- [x] El primer plan asigna recepción a espacios, accesos y muelle sin superar seis.
- [x] Al bloquearse Muelle Este, crea una acción para reasignar la persona del muelle.
- [x] Catering puede depender de que Recepción abra el punto alternativo.
- [x] Objetivo, motivo y resultado son visibles en CoordinadorPanel y cronología.
- [x] No se añade `Staff[]` a `CrisisState` ni se crea otro agente.
- [x] Tests focalizados del prompt y la salida pasan.

## Fuera de alcance

Seguimiento individual o rutas físicas de cada miembro de staff.
