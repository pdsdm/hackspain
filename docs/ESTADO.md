# Estado del proyecto

> Memoria del proyecto: contrastar esta foto con `origin/main` antes de trabajar.
> Esta actualización distingue la base integrada del trabajo local T38; no afirma que
> los cambios de esta rama estén ya mergeados.

| | |
|---|---|
| **Foto tomada** | 19 de septiembre de 2026, 16:43 CEST |
| **Base de `main` integrada** | `9969945` (incluye PR #50 y #48) |
| **Trabajo verificado** | `feat/ventura-costes-informativos`, T38, después de integrar esa base |
| **Entrega** | domingo 20 a las 11:00, hora de Madrid |
| **Generado por** | Devin |

## Salud

| Comprobación | Resultado |
|---|---|
| `make check` en la rama T38 | OK |
| Tests | 265: **258 pasan, 0 fallan, 7 live omitidos** |
| Lint y build | Backend y frontend OK |
| Fixtures | 10 JSON reproducibles OK |
| Node de esta verificación | 22.14.0: suite, lint, build y fixtures completos |
| Navegador Orca | Frontend API → evento → llamada simulada → coste visible; pausa humana verificada |

El build del frontend conserva el aviso de chunk mayor de 500 kB.
Se integraron PR #50 (rutas) y #48 (JEV) antes de repetir la verificación.
Se conserva íntegro su comportamiento; `originStopId` ya no existe tras esos cambios.
La rama adapta tres tests de simulación al adaptador asíncrono con semilla.
T37/D16 pasaron a T38/D17 porque main ya asignó esos identificadores a rutas.

## Qué funciona

- La base `9969945` incluye panel API, motor persistente, callbacks HappyRobot,
  verificación opcional JEV, afluencia, actores, incidencias, giros automáticos y rutas dinámicas.
- **T39, rama `feat/pep-mapa-fullscreen`:** el mapa ocupa toda la vista; KPIs, aforo,
  coordinador y cronología (chat, lo nuevo abajo) flotan sobre él con estilo cristal.
  La llamada solo aparece mientras está `en_curso`. Sin tarjeta de coste ni panel de
  operaciones. Velocidad ×1→×2→×5→×10→×20 en modo `sim`. Lo secundario va en un cajón lateral.
- T6 tiene código integrado en `main`; la antigua indicación «sin mergear» no describe
  todo el trabajo entregado. No se han repetido llamadas reales en esta sesión.
- **T38, solo en esta rama:** costes informativos sin límites ni aprobaciones económicas.
  `estimatedCost` es independiente de las decisiones; un coste desconocido es `null`.
- `committedCost` registra el coste adicional de una tarea aceptada con evidencia,
  sin duplicarlo al repetir callbacks ni inventarlo desde una previsión.
- Las decisiones operativas usan `kind: operational`, `approve_plan` y `reject_plan`.
  Conservan la pausa, las restricciones, la toma de llamadas y el rechazo de división.
- El recorrido integrado pasa con previsión de 6.000 €, callbacks, giro y replan de
  7.000 €, conservando 7.200 € comprometidos sin aprobación económica ni doble cargo.
- En navegador: estado inicial «Sin estimar»; evento enviado desde el panel; llamada
  simulada terminada; panel muestra 6.000 € previstos y comprometidos, cero decisiones
  económicas. Se comprobó que la pausa del modal llega al backend. Coordinador y
  contraparte inyectados, SQLite en memoria, sin credenciales ni llamadas externas.

## Qué falta, por riesgo para la demo

1. Revisar y mergear T38; su rama ya incorpora los PR #50 y #48. Publicación solicitada por Ventura.
2. Sincronizar el prompt desplegado de HappyRobot con el guion actualizado del repo;
   comprobar el extractor `result.data.committedCost` con evidencia real (sin verificar).
3. Ensayar el mismo recorrido con LLM y HappyRobot reales; T17/T18 no se cierran por
   pasar las pruebas simuladas.
4. Al integrar el trabajo local de recursos y T20, retirar sus límites presupuestarios
   y recomendaciones `ask_budget`; esas ramas no se han modificado aquí.

## Bloqueos y de quién dependen

| Qué | Depende de | ¿Externo? |
|---|---|---|
| Prompt y extractor de voz desplegados | Responsable de HappyRobot | Sí |
| Ensayo con proveedores reales | Entorno y credenciales del portátil de demo | Sí |
| Integración de recursos y aprendizaje | Sus ramas locales y revisión del equipo | No |

## Ramas vivas sin mergear

- `feat/ventura-costes-informativos`: T38 implementada y verificada, pendiente de revisión.
- `feat/ventura-routing-local`: trabajo local de ciclo de recursos y coordinador sobre
  una base anterior; contiene límites por recurso, saldo autorizado y reservas de saldo.
- `feat/ventura-aprendizaje`: trabajo local T20; incluye memoria `ask_budget`.
- Git conserva otras referencias remotas no ancestro de `main`; eso no prueba que su
  funcionalidad falte en main. GitHub consultado el 19/09 a las 16:43: ningún PR abierto;
  #50 y #48 ya mergeados e incorporados aquí. Orden de integración: #50/#48 → T38.

## Decisiones pendientes

- La política de T38 ya está aprobada por Ventura: recuperar servicio, registrar costes,
  no bloquear por importe. Véanse D17 y el contrato.
- Coordinar su aplicación con las ramas de recursos/aprendizaje y el workflow de voz.

## Avisos para el siguiente agente

- Empezar una ejecución nueva al ensayar T38. No se migran ni aprueban silenciosamente
  decisiones económicas guardadas en ejecuciones antiguas; se conserva su histórico.
- Los campos `contingency`, `autonomousLimit` y `authorized` quedan por compatibilidad,
  pero ya no limitan, autorizan ni aparecen en los prompts o el panel.
- `approve_spend`/`reject_spend` devuelven 409; el giro `reject_spend` devuelve 400.
- No confundir una estimación o un coste registrado con disponibilidad física confirmada.
- JEV conserva su prompt congelado, umbrales, privacidad y efectos desactivados por defecto.
- El script de demo arranca en `rules + sim`. Para probar eventos libres con LLM y llamadas
  simuladas: `DEMO_COORDINATOR_MODE=llm DEMO_CALL_MODE=sim ./scripts/demo.sh up-local`.
