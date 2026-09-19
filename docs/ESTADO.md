# Estado del proyecto

> Memoria del proyecto: contrastar esta foto con `origin/main` antes de trabajar.
> T40 es un piloto aislado: no activa JEV routing ni playbooks en la demo.

| | |
|---|---|
| **Foto tomada** | 19 de septiembre de 2026, 17:35 CEST |
| **Base de `main`** | `de7919c` (incluye T39 mergeada y PR #52 Helmcode) |
| **Trabajo verificado** | `feat/ventura-jev-routing-pilot`, T40 |
| **Entrega** | domingo 20 a las 11:00, hora de Madrid |
| **Generado por** | Devin |

## Salud

| Comprobación | Resultado |
|---|---|
| Tests backend | **287: 280 pasan, 0 fallan, 7 live omitidos** |
| Lint y build backend | OK |
| Fixtures | OK |
| Piloto JEV | 60 consultas, 0 errores, 0 falsos positivos, 0 verdaderos positivos con el gate inicial |
| Coordinador de referencia | 6/6 respuestas válidas |

El build frontend conserva el aviso de chunk mayor de 500 kB. El piloto usa solo textos
sintéticos y un playbook en memoria; no llama a HappyRobot ni modifica la demo persistente.

## Qué funciona

- `main` incluye el panel API, motor persistente, HappyRobot, JEV de verificación,
  afluencia, actores, incidencias, giros, rutas dinámicas, T38 y T39.
- T40 añade `Choice + Noul + gates deterministas` para reconocer pérdida completa del
  Lounge Sur. El playbook reutiliza `buildReplan("lounge_unavailable")`.
- El playbook comprueba estado, versión, tareas, llamadas, decisiones, restricciones,
  accesos, distribución, compromisos y cambios concurrentes.
- `applyPilotInMemory` aplica solo con fingerprint vigente y rechaza bases SQLite en disco.
- Casos de fallback: ambigüedad, timeout, error JEV, texto no revisado, otro incidente,
  estado modificado, tareas en vuelo y decisión operativa pendiente.
- El piloto está aislado del `Engine`: no cambia aún la ruta de eventos reales.

## Resultados del piloto T40

Corpus congelado: 40 textos; 20 desarrollo y 20 holdout. Desarrollo se consultó una vez;
holdout dos veces. Total: **60 consultas JEV**.

| Split | TP | FN | FP | TN | Exactos | Mediana | P95 | Máximo |
|---|---:|---:|---:|---:|---:|---:|---:|---:|
| Desarrollo | 0 | 10 | 0 | 10 | 10/20 | 313 ms | 842 ms | 1.037 ms |
| Holdout | 0 | 16 | 0 | 24 | 12/20 | 292 ms | 838 ms | 1.258 ms |

JEV separa bien los negativos y los casos compuestos, pero los umbrales iniciales son
demasiado conservadores para activar el playbook: cobertura positiva cero.

Comparativa del coordinador: 6 ejecuciones Helmcode/DeepSeek, 6/6 válidas, mediana
28,3 s, P95 y máximo 40,2 s. La métrica exploratoria de cambio de Lounge coincidió
5/6; un caso compuesto fue correctamente tratado como no acotado por esa métrica.

Conclusión: **no activar todavía JEV routing**. La latencia es prometedora, pero no hay
cobertura suficiente. No se deben bajar umbrales usando el mismo holdout.

## Qué falta, por riesgo para la demo

1. El piloto necesita una segunda iteración del corpus de desarrollo y una nueva evaluación
   sobre el holdout congelado. La prioridad es aumentar cobertura sin introducir falsos positivos.
2. Si el gate mejora, integrar el routing en `Engine` mediante `beforeCoordinate`, con
   aplicación transaccional y fallback al LLM. Hoy esa extensión solo existe en la rama
   histórica de routing local, no en `main`.
3. Sincronizar el prompt/extractor desplegado de HappyRobot y ensayar proveedores reales.
4. Revisar las ramas locales de recursos y aprendizaje para que no reintroduzcan límites
   presupuestarios ni `ask_budget`.

## Bloqueos

| Qué | Depende de | ¿Externo? |
|---|---|---|
| Activación del playbook | Mejorar cobertura del clasificador y repetir holdout | No |
| Latencia/calidad en producción | Corpus real anonimizado y etiquetado de HappyRobot | Sí |
| Ensayo de demo completo | Credenciales, túnel y proveedor | Sí |

## Ramas vivas sin mergear

- `feat/ventura-jev-routing-pilot`: T40 aislada, pendiente de análisis y revisión.
- `feat/ventura-aprendizaje`: T20 local, incluye memoria `ask_budget`.
- GitHub no tenía PR abierto al iniciar este piloto.

## Decisiones pendientes

- No activar JEV routing en el motor con los resultados actuales.
- Decidir si se hace una segunda iteración del corpus para mejorar la cobertura o se
  conserva el coordinador generativo como única ruta para texto libre.

## Avisos para el siguiente agente

- El router solo permite textos cuyo SHA-256 esté en el corpus revisado. Esto es intencional
  para el piloto y no es la política final de producción.
- El playbook solo reconoce pérdida total del Lounge Sur. Demoras, pérdida parcial, otros
  recursos, casos compuestos y restricciones nuevas van al LLM.
- JEV routing y JEV de verificación de callbacks son evaluadores distintos. No mezclar sus
  prompts, umbrales ni métricas.
- Para repetir el lote real: `JEV_ROUTING_LIVE=true node --env-file=/ruta/.env --import tsx
  backend/test/jev-routing-live.mts` desde `backend/`. El lote consume 60 consultas JEV y
  hasta 6 del coordinador.
