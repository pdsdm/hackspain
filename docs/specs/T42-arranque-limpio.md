# T42: Arranque limpio y pausado en cada despliegue

## Qué y para qué

Cada despliegue de Railway debe mostrar el mapa operativo inicial sin arrastrar llamadas, eventos o tareas del ensayo anterior, y sin que avance el reloj hasta definir el guion final.

## Criterios de aceptación

- [x] Un `RAILWAY_DEPLOYMENT_ID` nuevo crea una ejecución `calm` activa, pausada y sin eventos, llamadas ni decisiones.
- [x] Reiniciar el mismo deployment conserva su ejecución; los runs anteriores quedan inactivos como auditoría.
- [x] El mapa conserva lugares, accesos, vehículos, grupos y KPIs iniciales; no se elimina el simulador.
- [x] README documenta las URLs de producción y el comportamiento de despliegue.
- [x] `make check` pasa.

## Fuera de alcance

- Borrar el histórico SQLite, diseñar el guion final o eliminar código de simulación.
