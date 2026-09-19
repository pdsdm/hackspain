# T50: coordinación de staff mediante Asistentes

## Qué y para qué

Mostrar la redistribución de las seis personas de recepción usando el agente de Asistentes y las dependencias existentes, sin crear un quinto agente ni una entidad pública nueva.

## Criterios de aceptación

- [ ] El coordinador conoce la restricción `Recepción disponible: 6 personas`.
- [ ] El primer plan asigna recepción a espacios, accesos y muelle sin superar seis.
- [ ] Al bloquearse Muelle Este, crea una acción para reasignar la persona del muelle.
- [ ] Catering puede depender de que Recepción abra el punto alternativo.
- [ ] Objetivo, motivo y resultado son visibles en CoordinadorPanel y cronología.
- [ ] No se añade `Staff[]` a `CrisisState` ni se crea otro agente.
- [ ] Tests focalizados del prompt y la salida pasan.

## Fuera de alcance

Seguimiento individual o rutas físicas de cada miembro de staff.
