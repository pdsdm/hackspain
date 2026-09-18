# HackSpain 2026 ¿Puede la IA gestionar una crisis?

Proyecto para el [HackSpain 2026](https://hackspain.es) (Madrid, UPM–ETSIT, 18–20 de septiembre). Track de HappyRobot: un sistema agéntico que gestiona una crisis que se mueve mientras corre.

**El tipo de crisis lo elegimos nosotros.** El entorno cambia. Los recursos de voz, chat y email van por la plataforma de [HappyRobot](https://happyrobot.ai).

---

## El reto

En una crisis nunca hay toda la información, y lo que vale a las 12:00 ya no sirve a las 12:20. Un agente con una lista de pasos fija se queda atrás en el primer cambio. El sistema tiene que contestar **estas seis preguntas una y otra vez** mientras la situación cambia:

| Pregunta | Qué implica |
| --- | --- |
| **Qué información importa** | Llegan cien mensajes y solo tres cambian algo. Quedarse con esos tres. |
| **Qué va primero** | Se pueden hacer veinte cosas a la vez. Decir por dónde se empieza ahora. |
| **A quién se avisa y cuándo** | Un vecino, un bombero y un responsable no necesitan lo mismo. |
| **Dónde van los recursos** | Tres ambulancias y cinco sitios que las piden. Mandarlas a un lado es dejar el otro esperando. |
| **Qué se hace ahora** | La siguiente acción concreta y quién la hace. No basta con narrar. |
| **Cuándo tirar el plan** | Cambia el viento y el plan de hace veinte minutos ya no vale. ¿Se da cuenta el sistema? |

Escenario: una crisis que elegimos nosotros.  
Entorno: cambia mientras el sistema corre.  
Recursos: plataforma HappyRobot.

---

## Qué tiene que saber hacer el agente

1. **Enterarse de lo que pasa** Recoger llamadas, mensajes, sensores, APIs. Montar una pantalla donde en dos segundos se vea qué está pasando y qué ha cambiado en los últimos minutos.
2. **Priorizar** De lo abierto, qué se atiende primero y por qué. Con los medios que quedan, no con los que harían falta.
3. **Coordinar la respuesta** Avisar, repartir tareas, seguir quién ha cogido qué. El sistema mueve cosas (llamadas, mensajes, tickets, APIs), no solo las propone.
4. **Adaptarse** A mitad de la ejecución algo cambia (carretera cortada, integración caída, cincuenta personas más). El sistema rehace el plan.

---

## Requisitos de la entrega

| Qué | Qué significa | Estado |
| --- | --- | --- |
| Sistema agéntico | Decide y actúa por su cuenta. Un chatbot que contesta preguntas no entra. | Obligatorio |
| Escenario que se mueve | La situación cambia mientras el sistema corre. Si el caso es fijo, no hay nada que adaptar. | Obligatorio |
| Respuesta de varios pasos | Una cadena de acciones con un objetivo, no una acción suelta. | Obligatorio |
| Interacción de verdad | Llama, escribe, crea tickets o mueve datos en un sistema real. Hablar con una persona cuenta. | Obligatorio |
| Interfaz para la persona | Una pantalla para entender la situación, ver qué está haciendo el sistema e intervenir. | Obligatorio |
| Aprende de interacciones pasadas | Revisa llamadas y decisiones anteriores, ve qué funcionó y ajusta la próxima vez. | Bonus |

---

## Evaluación

Tres bloques al mismo peso: **cómo decide**, **cómo actúa** y **cómo se supervisa**.

**Cómo decide**

- Decisión: ¿decide algo sensato sin tener todos los datos?
- Prioridad: ¿sabe qué va primero cuando todo parece urgente?
- Adaptación: ¿hace algo distinto cuando la situación cambia?

**Cómo actúa**

- Coordinación: ¿lleva a la vez a la gente, la información y los medios?
- Ejecución: ¿ejecuta acciones fuera del sistema o solo las propone? (llamadas, mensajes, tickets, APIs)

**Cómo se supervisa**

- Control: ¿se entiende qué está haciendo y se puede intervenir?
- Creatividad: ¿el escenario y la forma de gestionarlo tienen algo propio?
- Aprendizaje: puntos extra si aprende de ejecuciones anteriores.

La demo cuenta tanto como el sistema. Hay que ensayar el pitch.

---

## Escenario

Pendiente de elegir. Ideas del enunciado (lista abierta): incendio forestal, apagón general, conflicto armado, inundación u otro desastre natural, fallo de infraestructura crítica, accidente con muchos heridos, emergencia humanitaria, brote.

HappyRobot pone la plataforma de producción (voz, chat, email) y estará en el evento el fin de semana.

---

## Evento

HackSpain 2026 · Madrid · UPM–ETSIT · 18–20 de septiembre · [@hackspain26](https://x.com/hackspain26)

Reto de HappyRobot para HackSpain 2026.
