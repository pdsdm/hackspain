# T40 — Piloto JEV para routing a playbooks

## Objetivo

Medir si JEV puede reconocer un caso operativo muy acotado y derivarlo a un playbook determinista, evitando el coordinador generativo, sin activar efectos en la demo.

## Caso piloto

`lounge_unavailable`: retirada total y actual del Lounge Sur para la hospitalidad de este evento.

El playbook existente calcula la replanificación y las tareas. JEV solo clasifica el texto. El backend debe comprobar después que el estado es compatible:

- ejecución antes de apertura;
- Pabellón Principal cerrado;
- Pabellón B confirmado con 450 plazas;
- Lounge Sur confirmado con 150 plazas;
- Norte C consultable;
- acceso Sur operativo;
- sin decisiones operativas pendientes;
- sin tareas o llamadas en vuelo;
- sin otros giros o incidencias;
- sin restricciones nuevas;
- distribución de invitados y compromisos esperados.

Si falla una condición, se hace fallback al coordinador. El resultado de JEV nunca muta el estado por sí solo.

## Protocolo ejecutado

- 40 mensajes sintéticos, divididos en 20 de desarrollo y 20 holdout.
- Desarrollo: una consulta por mensaje.
- Holdout: dos consultas por mensaje.
- Total JEV: **60 consultas**, dentro del máximo autorizado.
- 6 mensajes de referencia contra Helmcode/DeepSeek V4 Flash con salida completa del coordinador.
- Modelo JEV: `jev-1.13.0`.
- Preguntas JEV: un `Choice` (`lounge_unavailable` / `other`) y dos `Noul` (`asserted_now`, `additional_change`).
- Gate local: probabilidad del caso ≥ 0.97, confianza ≥ 0.90, afirmación actual ≥ 0.97 y cambios adicionales ≤ 0.05.
- Textos sintéticos revisados previamente por hash. No se enviaron credenciales, teléfonos, nombres ni callbacks reales.
- Sin llamadas HappyRobot, SMS, cambios en la demo ni mutaciones de producción.

## Resultado

Fecha: 19 de septiembre de 2026.

### JEV

| Split | Casos | Consultas | Evaluadas | TP | FN | FP | TN | Casos exactos | Mediana | P95 | Máximo |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| Desarrollo | 20 | 20 | 20 | 0 | 10 | 0 | 10 | 10/20 | 313 ms | 842 ms | 1.037 ms |
| Holdout | 20 | 40 | 40 | 0 | 16 | 0 | 24 | 12/20 | 292 ms | 838 ms | 1.258 ms |

No hubo errores de disponibilidad ni cambios de veredicto entre las dos repeticiones del holdout.

El router fue conservador: **0 falsos positivos**, pero tampoco abrió el playbook en ninguno de los 18 casos positivos. Varias frases positivas quedaron cerca del gate, pero no lo superaron. El gate actual no es útil para ahorrar llamadas todavía.

Observaciones relevantes:

- JEV separa bien demoras, hipótesis, negaciones, rumores, inyecciones y otros recursos.
- También detecta casos compuestos como Lounge perdido + transporte ausente o Lounge perdido + cambio de aforo, marcando `additional_change` alto.
- El caso ambiguo «ese espacio ya no lo podemos utilizar» no debe activar el playbook.
- Los casos positivos de holdout obtienen señales altas de caso y afirmación, pero la confianza o la probabilidad no llega siempre al umbral elegido.
- El caso «Lounge perdido» junto con un cambio adicional no se puede despachar con este playbook.

### Coordinador generativo

Se ejecutaron 6 planes, uno por caso baseline: 3 positivos y 3 negativos.

- Validez estructural: **6/6**.
- Latencia: mediana **28,3 s**, P95/máximo **40,2 s**.
- La métrica exploratoria de cambio destructivo de Lounge coincidió en **5/6**; el error fue un caso compuesto con pérdida del Lounge y cambio de aforo, que no debe pertenecer al playbook simple.
- Esta comparación no mide calidad operativa completa: solo comprueba validez, latencia y presencia de la operación de cierre del Lounge.

### Coste de inferencia

- JEV: 56.987 tokens de entrada y 4.668 de salida según la respuesta agregada del proveedor.
- El benchmark no registra precio monetario porque depende de la cuenta y tarifa activa.

## Conclusión

**No activar todavía el playbook con este gate ni con este corpus.** La separación de negativos es buena, pero la cobertura de positivos es 0% bajo el gate actual.

El aporte demostrado es la latencia: aproximadamente 0,3 s de JEV frente a 28,3 s del coordinador en esta muestra. Para que sea útil hay que mejorar el clasificador o reformular el caso antes de ponerlo delante del motor.

## Siguiente experimento recomendado

1. No tocar el holdout actual.
2. Ampliar solo el desarrollo con ejemplos positivos cortos y naturales, y ejemplos de `additional_change` cercano.
3. Probar una pregunta `Choice` con opciones más separadas y una segunda pregunta de elegibilidad operativa.
4. Evaluar gates candidatos en desarrollo y elegir uno solo por precisión sobre holdout.
5. Repetir el holdout completo. No activar si aparece un falso positivo.
6. Integrar al motor únicamente cuando el router devuelva `playbook` con un `fingerprint` de estado, y aplicar el playbook dentro de una transacción o sin efectos si el estado cambió.

El piloto implementado queda aislado en `backend/src/domain/routing-pilot.ts`. `applyPilotInMemory` rechaza bases SQLite en disco para evitar que una medición cambie la demo.
