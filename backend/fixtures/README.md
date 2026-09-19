# Datos de demo MADRING · T5

Datos **sintéticos y deterministas**, sin teléfonos, emails ni llamadas reales. Los horarios, aforos y rutas son supuestos del escenario; no describen la operativa real del GP.

## Contenido y uso

- `madring/seed.json`: 600 invitados identificados, pase Sur, necesidades individuales, recursos, cuatro shuttles ocupados (45 personas cada uno), dos entregas (360/240 servicios), seis recepcionistas, contactos de prueba y presupuesto.
- `madring/manifest.json`: asignaciones individuales por estado, invitados sin ubicación confirmada y evidencia simulada de accesibilidad. `unassignedGuestIds` incluye también las propuestas todavía sin confirmar.
- `madring/world.json`: geografía estática (lugares, enlaces, polígonos Norte/Sur) para el motor T24.
- `madring/states/*.json`: siete objetos completos `CrisisState`, listos para cargar como ejemplos de `/state`. No hay que envolverlos en otro objeto.

| Archivo | Hora | Plazas confirmadas | Qué permite probar |
| --- | --- | ---: | --- |
| `calm.json` | 12:00 | 600 | Operación original estable; reloj en marcha para el motor T24 |
| `normal.json` | 12:14:50 | 600 | Reserva original en Principal, antes del cierre |
| `crisis.json` | 12:15 | 0 | Principal y Muelle Sur cerrados; acuerdos invalidados |
| `proposal.json` | 12:18 | 0 | B 450 + Lounge 150 pendientes de aceptación de apertura escalonada y condiciones |
| `recovered.json` | 12:25 | 600 | Reservas confirmadas y 3.200 € comprometidos; quedan 120 avisos pendientes |
| `lounge_unavailable.json` | 12:26 | 450 | Lounge retirado, 150 invitados sin ubicación; Norte solo propuesto |
| `pabellon_b_400.json` | 12:26 | 550 | B baja a 400; 50 invitados sin ubicación |

Los snapshots (salvo `calm`) están pausados y sin próxima acción del guion. Son casos estáticos para desarrollo, no una reproducción de acciones de HappyRobot. `recovered` significa reservas recuperadas: los espacios aún no están abiertos, no se han entregado los menús y no todos los invitados han recibido el aviso (`resolved: false`). Las comunicaciones y aceptaciones se reinician al cambiar a la versión 3 del plan.

Frontend puede usar el cargador que devuelve una copia independiente:

```ts
import { createFixtureState } from './domain/fixtures';
const state = createFixtureState('proposal');
// Con el reducer existente: dispatch({ type: 'REPLACE', state });
```

El cargador no cambia el estado inicial de la demo ni añade un selector visual. Backend puede leer directamente los JSON con `readFile` + `JSON.parse`, usando una ruta al directorio de fixtures. **No debe importar el generador en producción**: su reutilización de tipos/estado del frontend es solo durante la generación. La persistencia en SQLite y los endpoints se implementan en sus tareas correspondientes.

## Reglas de los datos

- Invitados `001–090`: acceso Sur; `091–270`: shuttles; `271–600`: por libre. Los 12 requisitos de accesibilidad y 38 alimentarios están en el último grupo; cuatro personas tienen ambos.
- Cada invitado tiene como máximo una asignación. B recibe `001–450` y Lounge `451–600`. Si B reduce aforo, `401–450` quedan sin asignación; no se trasladan automáticamente al Lounge lleno.
- Todos tienen pase Sur. Norte C exige permiso, traslado exterior, coste y aceptación de apertura a las 13:45. No hay permisos ni viajes confirmados en estos datos. Los buses ocupados no cuentan como capacidad disponible.
- B está disponible desde las 12:50; Lounge desde las 13:15, con espera autorizada para 150 y apertura escalonada aprobada. La espera no cuenta como espacio de hospitalidad.
- La accesibilidad inicial está en `seed.resources[].initialAccessibilityConfirmed`; las verificaciones por snapshot están en `manifest.fixtures[].accessibilityVerifiedSpaceIds`. La propuesta debe confirmar el acceso adaptado de B antes de alojar allí a los 12 invitados.
- `confirmedCount` cuenta reservas; `informedCount` avisos recibidos; `acceptedCount` aceptaciones del destinatario. No son equivalentes. Un grupo repartido entre espacios no tiene un `assignedSpaceId` único: consultar el manifest.
- Dinero en **euros** y tiempo en **segundos desde medianoche**, según el contrato vigente. T37: costes informativos sin límites ni aprobación económica; plan Sur: 1.500 + 900 + 400 + 400 = 3.200 €. Los antiguos campos de límite se mantienen solo por compatibilidad. Los giros conservan lo comprometido, sin inventar reembolsos.
- `contactRef: test-*` identifica dobles de prueba; no es un destino para comunicaciones. Los datos no configuran números de HappyRobot.

## Regenerar y verificar

Requiere Node 22.13+ y las dependencias de backend y frontend instaladas con `npm ci` en cada carpeta.

```bash
cd backend
npm run fixtures:generate
npm run fixtures:check
cd ..
make check
```

Editar `backend/fixtures/madring.ts` y regenerar, no modificar los JSON a mano. El generador reutiliza `frontend/src/domain/initialState.ts` y comprueba los tipos contra `CrisisState`. Los JSON se versionan para que cualquier consumidor pueda leerlos sin ejecutar TypeScript. `fixtures:check` falla si un JSON falta o difiere de la generación, y forma parte de `make check`. Los tests validan conservación de personas, aforos, permisos, horarios, rutas, accesibilidad, presupuesto y compatibilidad del cargador frontend.
