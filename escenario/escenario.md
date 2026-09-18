# Crisis en MADRING: centro de operaciones agéntico

> En 45 minutos abre la hospitalidad. Acabamos de perder el pabellón principal. Nuestro sistema debe conseguir que todos los implicados abandonen el plan anterior y confirmen uno que todavía pueda funcionar.

Documento de referencia del escenario para el track de HappyRobot de HackSpain 2026. Describe el problema, los participantes, el comportamiento esperado y la demostración. El recinto es **MADRING** (circuito de Fórmula 1 en IFEMA Madrid). Los nombres de la empresa operadora, las cifras operativas, los proveedores y el incidente son ficticios y están diseñados para el prototipo.

## 1. La idea

Somos la empresa que opera un bloque de hospitalidad y experiencia de invitados durante un Gran Premio. Utilizamos un centro de operaciones con agentes de IA para gestionar una crisis mientras el evento sigue avanzando: los invitados llegan, los shuttles se desplazan, el catering descarga y los recursos disponibles cambian.

Un agente coordinador mantiene una visión común de la situación y organiza el trabajo de cuatro agentes especializados: **Espacios, Catering, Transporte y Asistentes**. Cada uno recoge información, conversa con las personas de su área y ejecuta acciones. Sus decisiones están conectadas: cambiar un pabellón puede obligar a cambiar la descarga de comida, el destino de un autobús y las instrucciones que reciben cientos de invitados.

El organizador supervisa el conjunto desde un panel. Ve qué está pasando, qué está haciendo cada agente, qué acuerdos están confirmados y qué decisiones requieren su intervención.

El objetivo es recuperar un plan viable, comunicarlo y comprobar su ejecución antes de que la crisis se convierta en una cadena de incumplimientos el día de carrera.

## 2. A quién pertenece el sistema

El cliente del sistema es **Nexo Events**, una empresa ficticia de operaciones de hospitalidad en grandes eventos. Es responsable ante su cliente de coordinar espacios, catering, transportistas, personal y atención a los invitados de un programa corporativo en MADRING.

Nexo Events dispone de:

- El programa del día de carrera y la lista de invitados del bloque de hospitalidad.
- Los contratos, reservas y contactos de proveedores.
- Los requisitos de aforo, accesibilidad, alimentación y equipamiento.
- Un presupuesto de contingencia y límites de actuación.
- Un responsable humano con autoridad para aprobar cambios importantes.

El sistema trabaja por cuenta de Nexo Events. Contacta con proveedores y responsables dentro de ese ámbito; la disponibilidad de un recurso externo debe comprobarse y acordarse con quien lo controla. No dirige la carrera ni sustituye a dirección de circuito, seguridad o FIA.

## 3. Escenario principal: domingo de Gran Premio en MADRING

MADRING está en IFEMA Madrid (Avenida del Partenón, 5). El circuito se divide en dos zonas de público que **no están conectadas por el interior**: **MADRING Norte** (acceso principal por Valdebebas) y **MADRING Sur** (acceso principal por Feria de Madrid). Cada entrada, Fan Zone y hospitalidad pertenece a una zona. Un invitado con acceso Sur no puede cruzar andando al Norte desde dentro del recinto.

Esa separación es una restricción dura del escenario: reubicar a alguien implica un traslado por el exterior, un shuttle o un espacio en la misma zona.

### 3.1. Situación inicial

Nexo Events opera un programa de hospitalidad para **600 invitados** el domingo de carrera. El plan original concentra recepción, servicio y visionado en el **Pabellón Principal**, en MADRING Sur. El servicio incluye recepción, almuerzo y acceso a una zona de visionado común.

| Dato | Valor del escenario |
| --- | --- |
| Hora de detección del incidente | 12:15 |
| Apertura prevista de hospitalidad | 13:00 |
| Inicio del almuerzo | 13:30 |
| Salida de carrera (referencia) | 15:00 |
| Invitados del bloque | 600 |
| Ubicación inicial | Pabellón Principal (MADRING Sur), capacidad de 600 personas |
| Presupuesto de contingencia | 5.000 € |
| Límite autónomo inicial de gasto adicional | 1.500 € acumulados para esta crisis |
| Supervisión | Responsable de operaciones de Nexo Events |

En el momento del incidente:

- 90 invitados están en el control de acceso Sur, fuera del Pabellón Principal.
- 180 viajan en cuatro shuttles contratados, de 45 plazas cada uno, con destino al acceso Sur.
- 330 llegan por sus propios medios (Cercanías, metro L8, taxi o vehículo privado).
- El catering prepara 600 servicios y tiene dos entregas previstas al muelle Sur del pabellón.
- Los proveedores y los equipos de recepción siguen utilizando las instrucciones originales.

Estos grupos son excluyentes y suman 600 personas. Los requisitos individuales, como accesibilidad o alimentación, pueden coincidir en una misma persona.

### 3.2. El incidente que inicia la crisis

El responsable de recinto comunica que una avería en la instalación de agua ha dejado inutilizable el Pabellón Principal. El pabellón queda cerrado hasta que el personal competente autorice su uso; no hay una hora de reapertura confirmada.

La recepción de accesos Sur y los espacios alternativos continúan disponibles según la información inicial. El sistema debe verificar que sus accesos, zona (Norte o Sur) y condiciones permiten utilizarlos.

La pérdida del pabellón invalida varias partes del plan:

1. Ya no existe una ubicación confirmada para recibir a las 600 personas en Sur.
2. Las entregas de catering apuntan al muelle asociado al pabellón cerrado.
3. Los shuttles tienen instrucciones de llegada al acceso Sur que pueden necesitar cambios de zona.
4. Los invitados conservan pases y mensajes con la ubicación original.
5. El personal necesita nuevas asignaciones antes de empezar a recibir al público.

La crisis se agrava con el paso del tiempo aunque no se produzca ningún otro incidente. Si una alternativa está en Norte, hay que mover gente o comida por el exterior; no se da por hecho un traslado a pie entre zonas.

### 3.3. Recursos conocidos y datos pendientes

Los datos siguientes forman el catálogo inicial de la simulación. Una disponibilidad anunciada es una pista que hay que validar; no equivale a una reserva.

| Recurso | Información inicial | Qué falta confirmar |
| --- | --- | --- |
| Pabellón B | MADRING Sur; capacidad máxima de 450 personas en el montaje previsto | Disponibilidad efectiva, montaje, equipamiento y hora de entrega |
| Lounge de Fan Zone Sur | Mismo recinto Sur; capacidad máxima de 150 personas; visionado en pantalla | Disponibilidad, condiciones de uso, accesibilidad y señal de carrera |
| Pabellón Norte C | MADRING Norte; capacidad de 600 personas; primera apertura posible a las 13:45 | Reserva, coste, shuttles Norte↔Sur, tiempo de traslado y aceptación del retraso |
| Catering contratado | 600 servicios; dos entregas de 360 y 240 al muelle Sur | Redistribución, accesos, personal y horarios |
| Cuatro shuttles | 180 pasajeros en total, ya asignados al acceso Sur | Posición, llegada y aceptación de nuevas instrucciones (incluido cambio de zona) |
| Personal de recepción | Seis personas | Reparto entre accesos Sur/Norte y atención de incidencias |
| Equipo audiovisual | Preparado para el Pabellón Principal | Viabilidad y coste de conectar Pabellón B y Lounge Sur |

Las capacidades pertenecen al montaje concreto del escenario. El sistema no deduce que un espacio admite más personas moviendo mobiliario o cambiando configuraciones sin validación del recinto. Tampoco asume que un espacio Norte cubre a un invitado con pase Sur sin un traslado acordado.

### 3.4. Una primera solución posible

Una alternativa es utilizar **Pabellón B + Lounge Sur** para alojar a las 600 personas en la misma zona, con señal de carrera compartida y servicio coordinado. Es viable únicamente si se confirman las condiciones necesarias y el organizador acepta dividir el programa de hospitalidad.

Ejemplo de coste adicional previsto:

| Concepto | Importe |
| --- | ---:|
| Habilitación de Pabellón B | 1.500 € |
| Habilitación de Lounge Sur | 900 € |
| Redistribución del catering | 400 € |
| Conexión audiovisual entre espacios | 400 € |
| **Total** | **3.200 €** |

El importe cabe en la contingencia de 5.000 €, pero supera la autonomía inicial de 1.500 €. El coordinador presenta la propuesta completa al responsable, con sus condiciones pendientes, para que autorice hasta 3.200 €.

La autorización de gasto no confirma por sí sola los espacios ni obliga a ejecutar el plan si una condición falla. Tampoco se puede eludir el límite dividiendo la misma operación entre varios agentes.

Mover el bloque entero a Pabellón Norte C puede reunir a las 600 personas, pero introduce traslado, retraso respecto a las 13:00 y coordinación de shuttles entre zonas. Esa vía solo avanza si el organizador acepta el recorte de tiempo hasta la carrera.

## 4. Qué significa resolver la crisis

El sistema intenta, por este orden:

1. Respetar las condiciones de seguridad, aforo, zona de acceso y accesibilidad, y atender los incidentes que requieran respuesta inmediata.
2. Conseguir una alternativa confirmada para los invitados y los servicios esenciales.
3. Reducir retrasos y personas sin atención o sin instrucciones claras.
4. Mantener el gasto dentro de lo autorizado.
5. Preservar tanto como sea posible el programa y la experiencia contratada (hospitalidad y visionado de carrera).

La recuperación requiere acuerdos que se puedan ejecutar. No basta con encontrar un pabellón o enviar muchos mensajes.

Si no existe una solución completa, el sistema debe mostrar la limitación: por ejemplo, 450 plazas confirmadas en Sur y 150 personas todavía sin ubicación. Presentará alternativas y escalará la decisión necesaria sin dar la crisis por resuelta.

## 5. Participantes humanos

| Participante | Qué sabe o decide | Relación con el sistema |
| --- | --- | --- |
| Responsable de operaciones | Prioridades, presupuesto y cambios aceptables | Supervisa, autoriza y modifica decisiones |
| Responsable de recinto | Espacios, capacidades, accesos Norte/Sur y condiciones de uso | Confirma alternativas y restricciones |
| Responsable de catering | Comida, personal, tiempos y requisitos de servicio | Negocia una entrega y un servicio viables |
| Coordinador de transporte | Vehículos, posiciones y puntos de llegada | Confirma cambios de ruta, zona y parada |
| Equipo de recepción | Situación real de quienes ya están en el acceso | Ejecuta instrucciones y comunica incidencias |
| Invitados | Ubicación, zona de pase, necesidades y aceptación de cambios | Reciben información relevante y pueden responder |
| Personal sanitario o de seguridad | Valoración y respuesta dentro de su competencia | Recibe avisos y dirige la actuación correspondiente |

El invitado final no tiene que conocer la arquitectura del sistema. Necesita instrucciones claras, coherentes y adecuadas a su situación y a su zona de acceso.

## 6. Agentes y responsabilidades

### 6.1. Agente coordinador

Mantiene el estado global de la crisis y decide qué trabajo debe avanzar primero. Relaciona los resultados de los especialistas y resuelve conflictos de recursos, zonas o prioridades.

Sus responsabilidades son:

- Identificar qué información cambia el plan.
- Separar hechos confirmados, hipótesis y datos pendientes.
- Asignar tareas con un objetivo y un plazo.
- Comparar alternativas y comprobar sus dependencias, incluida la zona Norte/Sur.
- Controlar el presupuesto acumulado y las autorizaciones.
- Detectar compromisos invalidados por nueva información.
- Escalar decisiones y explicar brevemente por qué propone una acción.

Ejemplo: Espacios encuentra un lounge disponible en Sur, pero Catering necesita un muelle de carga que todavía no está confirmado. El coordinador mantiene esa alternativa como provisional y ordena verificar el acceso antes de confirmar el servicio completo.

### 6.2. Agente de Espacios

Habla con el recinto y alternativas disponibles. Comprueba capacidad, zona (Norte o Sur), horarios, accesibilidad, montaje, accesos, equipamiento y condiciones de reserva.

**Ejemplo de conversación:**

> Agente: «Necesitamos reubicar a 600 invitados de hospitalidad para abrir a las 13:00 en Sur. ¿Podéis confirmar Pabellón B y Lounge de Fan Zone Sur para ese horario?»
>
> Responsable: «Pabellón B sí. El lounge está disponible, pero el montaje no termina hasta las 13:15».
>
> Agente: «¿Hay una zona de espera autorizada para las 150 personas y qué capacidad tiene? Necesito confirmar también su acceso y la señal de carrera».

El agente registra las condiciones. El coordinador decide si el retraso parcial puede encajar o si hay que explorar Norte, con el coste de traslado que eso implica.

### 6.3. Agente de Catering

Coordina la continuidad del servicio: cantidades, horarios, ubicaciones, descarga, personal y requisitos alimentarios ya registrados.

**Ejemplo de conversación:**

> Agente: «El Pabellón Principal está cerrado. Estamos preparando un reparto de 450 servicios en Pabellón B y 150 en Lounge Sur. ¿Podéis realizarlo manteniendo los requisitos alimentarios de cada grupo?»
>
> Proveedor: «Sí, pero la segunda entrega necesita entrar por el muelle este de Sur y un miembro de recepción debe abrirlo».

El resultado genera una dependencia con el recinto y una tarea para recepción. El catering solo queda confirmado cuando esas condiciones tienen responsable y aceptación.

Las necesidades alimentarias se vinculan a las personas o grupos correctos. Una alternativa de menú requiere la confirmación correspondiente; el agente no inventa garantías sobre ingredientes o alérgenos.

### 6.4. Agente de Transporte

Coordina la llegada de invitados y los desplazamientos contratados. Comprueba posiciones, capacidades, accesibilidad, puntos de parada, zona Norte/Sur y tiempos.

**Ejemplo de conversación:**

> Agente: «El acceso habitual del Pabellón Principal ha cambiado. Para el shuttle 2 proponemos la entrada este de Sur, donde recepción os recogerá. ¿Podéis confirmar llegada a las 12:50?»
>
> Coordinador: «El vehículo puede llegar, pero esa entrada no permite parar un autocar».

El sistema descarta ese punto de parada y busca uno autorizado con el recinto. No comunica el destino descartado a los pasajeros como si estuviera confirmado. Si el plan pasa a Norte, el agente no da el cambio por hecho hasta que el conductor acepte la nueva ruta por el exterior.

### 6.5. Agente de Asistentes

Comunica cambios de forma segmentada y recoge respuestas que puedan afectar al plan. Distingue entre quienes ya están en el acceso Sur, quienes viajan en los shuttles y quienes llegan por su cuenta.

Ejemplos:

- A una persona en camino: «Tu acceso sigue siendo MADRING Sur. La apertura se mantiene a las 13:00. Te enviaremos el pabellón asignado cuando quede confirmado. No intentes entrar por Norte: las zonas no están conectadas por dentro».
- A una persona ya en el recinto: «Permanece en el control de acceso Sur. El equipo te acompañará al nuevo espacio cuando esté preparado».
- A una persona con una necesidad de accesibilidad registrada: confirma que la alternativa cubre su requisito y coordina la asistencia necesaria.

Puede usar mensajes para avisos sencillos y llamadas para casos donde haga falta aclarar una necesidad o acordar una alternativa.

**Mensaje enviado**, **mensaje entregado**, **cambio aceptado** y **asistencia completada** son resultados distintos.

## 7. Cómo se coordinan

Todos los agentes trabajan sobre un estado compartido: recursos, incidencias, restricciones, tareas, acuerdos y versión del plan. Cada cambio relevante debe quedar registrado con su origen y su hora.

Una acción o compromiso debe permitir conocer:

- Qué se ha acordado y con quién.
- Qué agente o persona es responsable.
- A qué plan pertenece.
- De qué condiciones depende.
- Cuándo debe ocurrir o caduca.
- Qué evidencia confirma su aceptación o ejecución.

### Ejemplo completo de coordinación

1. Espacios obtiene confirmación de Pabellón B y una disponibilidad condicionada del Lounge Sur.
2. El coordinador detecta que todavía faltan 150 plazas confirmadas y solicita verificar la condición pendiente.
3. Catering comprueba si puede dividir el servicio y comunica su necesidad del muelle este de Sur.
4. El coordinador asigna al responsable de recinto la verificación de ese acceso y a recepción la atención de la descarga.
5. Transporte acuerda puntos de llegada compatibles con las nuevas ubicaciones en Sur.
6. El responsable humano autoriza el gasto y la división del programa de hospitalidad.
7. Los proveedores confirman los acuerdos; Asistentes comunica las asignaciones que ya son válidas.
8. El sistema comprueba entregas, llegada de vehículos y preparación de los espacios.

Las consultas independientes pueden avanzar a la vez. Las confirmaciones que dependen de otras acciones deben esperar a que se cumplan sus condiciones.

### Estados de un compromiso

| Estado | Significado |
| --- | --- |
| Propuesto | El sistema ha identificado una alternativa |
| En consulta | Está verificando condiciones con el participante |
| Aceptado con condiciones | Existe acuerdo, pero faltan requisitos explícitos |
| Confirmado | Se cumplen las condiciones necesarias y existe aceptación verificable |
| En ejecución | La acción ha empezado |
| Completado | Existe evidencia de que se ha realizado |
| Invalidado o cancelado | Un cambio impide mantenerlo o se ha acordado retirarlo |

Una llamada iniciada no confirma una reserva. Una reserva confirmada no significa que el pabellón ya esté preparado.

### Cuando se cambia de plan

Replanificar incluye revisar lo ya comprometido:

- Liberar reservas que dejan de utilizarse y registrar posibles costes.
- Cancelar tareas obsoletas.
- Comunicar instrucciones nuevas a quienes recibieron las anteriores.
- Comprobar que los interlocutores han aceptado el cambio.
- Evitar reservas o notificaciones duplicadas al reintentar una acción.

Por ejemplo, si un shuttle ya confirmó el acceso este de Sur y el plan cambia a Pabellón Norte C, ese traslado sigue pendiente de modificación hasta que el transportista acepte el nuevo destino.

## 8. Información incompleta, ruido y contradicciones

El sistema puede recibir llamadas, mensajes, respuestas de proveedores, cambios en reservas y observaciones del personal.

| Información entrante | Tratamiento esperado |
| --- | --- |
| El responsable de recinto confirma que el Pabellón Principal está cerrado | Cambia el estado del espacio y revisa los compromisos afectados |
| Un invitado repite un rumor sobre el cierre de todo MADRING Sur | Registra la incertidumbre y verifica antes de ampliar el alcance del incidente |
| Llega dos veces el mismo aviso de cierre | Vincula ambos avisos al mismo incidente |
| Una página de disponibilidad muestra Pabellón B libre, pero el responsable dice que está ocupado | Marca el conflicto y comprueba disponibilidad antes de reservar |
| El catering pregunta por un detalle de branding | Atiende o aplaza según la carga y prioridad actuales |
| Transporte confirma un retraso de 20 minutos | Recalcula la llegada del grupo y sus tareas dependientes |
| Un invitado pide entrar por Norte porque el GPS le llevó a Valdebebas | No reasigna zona sin comprobar pase, traslado y capacidad; da instrucciones al acceso correcto |

El coordinador debe poder explicar qué información cambió su decisión. También debe mostrar cuándo un dato importante sigue sin verificarse.

## 9. Cambios que pueden ocurrir durante la demo

El fallo del Pabellón Principal inicia el escenario. Los siguientes giros son opciones para probar adaptación; no es necesario activarlos todos.

| Giro | Consecuencia | Respuesta esperada |
| --- | --- | --- |
| Lounge Sur deja de estar disponible | Faltan 150 plazas en Sur | Invalidar esa parte del plan, explorar alternativas (incluido Norte con traslado) y mantener informados a los afectados |
| La capacidad validada de Pabellón B baja a 400 | Pabellón B + Lounge Sur solo cubren 550 personas | Detectar las 50 plazas que faltan y evitar declarar cobertura completa |
| Un shuttle se retrasa 20 minutos | Llegan tarde 45 personas | Ajustar recepción y servicio del grupo y valorar ruta alternativa si aporta una mejora real |
| La segunda entrega de catering se retrasa | 240 servicios no llegan a su hora | Negociar entrega o servicio alternativo y actualizar las previsiones afectadas |
| Se bloquea el muelle de descarga previsto | El proveedor no puede cumplir las instrucciones | Verificar otro acceso y acordarlo con catering y recinto |
| Un proveedor no responde | La alternativa sigue sin confirmar | Aplicar un plazo de espera, intentar otro canal o buscar otro proveedor |
| El organizador rechaza el gasto adicional | El plan propuesto no está autorizado | Recalcular alternativas dentro del límite o presentar el impacto de no ampliarlo |
| El organizador rechaza dividir la hospitalidad | Hay que buscar un único espacio de 600 | Invalidar Pabellón B + Lounge y evaluar Norte C con su retraso |
| Un invitado comunica una necesidad no registrada | Su asignación puede dejar de ser adecuada | Verificar el requisito, corregir su atención y revisar recursos afectados |

Para la demo, el jurado puede elegir uno de estos cambios desde un panel de simulación o interpretar a un proveedor durante una llamada. El sistema debe responder al estado resultante, sin depender de que el giro ocurra en un segundo exacto del guion.

### Incidente sanitario opcional

Una reacción alérgica u otra emergencia de salud puede servir para demostrar un cambio inmediato de prioridad. Es una extensión del escenario, no un requisito de la demo principal.

En ese caso, el agente activa el protocolo establecido para el evento: avisa al personal sanitario o al servicio de emergencias correspondiente, transmite la ubicación disponible (incluido Norte o Sur) y coordina el acceso y la atención presencial. Registra quién ha recibido el aviso y escala si no hay respuesta.

Las decisiones clínicas corresponden a profesionales. El sistema organiza la comunicación y los recursos de apoyo, y evita dar el incidente por resuelto por el mero hecho de haber enviado una alerta. En el hackathon, estas comunicaciones se representan con participantes de prueba, sin contactar servicios de emergencia reales.

## 10. Interfaz de supervisión

La pantalla debe permitir entender la situación en pocos segundos y examinar los detalles cuando haga falta.

### Vista principal

- **Cabecera:** nombre del evento (MADRING · hospitalidad domingo), hora, estado de la crisis e indicador de escenario simulado.
- **Cuenta atrás:** tiempo hasta la apertura de hospitalidad y previsión actual de retraso respecto a la carrera.
- **Plano:** pabellón bloqueado, espacios alternativos, zona Norte/Sur, accesos y puntos de llegada o descarga.
- **Cobertura:** invitados con asignación viable, plazas pendientes y necesidades sin cubrir.
- **Agentes:** objetivo actual, llamada o tarea en curso y último resultado.
- **Actividad:** acuerdos, fallos, cambios del plan y responsables.
- **Decisiones pendientes:** propuesta, coste, condiciones abiertas y efecto de aprobarla o rechazarla.

### Indicadores con significado concreto

| Indicador | Qué cuenta |
| --- | --- |
| Invitados con ubicación confirmada | Personas con asignación a un espacio confirmado, en zona compatible con su pase y requisitos conocidos |
| Invitados informados | Personas para las que existe evidencia definida de recepción de las instrucciones vigentes |
| Servicios de catering confirmados | Servicios acordados con ubicación, horario y requisitos cubiertos |
| Grupos con llegada coordinada | Grupos cuyo transportista y equipo receptor han confirmado las instrucciones vigentes |
| Coste previsto | Estimación de la alternativa actual |
| Coste comprometido | Gasto adicional aceptado con proveedores, incluidas penalizaciones conocidas |
| Condiciones críticas pendientes | Requisitos que todavía impiden ejecutar o confirmar el plan |

El panel no debe mezclar personas informadas con personas cuya solución está confirmada. Todos los estados deben poder remontarse a una acción o evidencia.

### Intervención humana

El responsable puede aprobar un gasto, rechazar una alternativa, fijar una restricción, corregir un dato, pausar nuevas acciones o hacerse cargo de una conversación. La intervención queda registrada y los agentes actualizan su trabajo.

Ejemplo: «No aceptamos dividir la hospitalidad. Buscad una ubicación para los 600 invitados y presentad el retraso y el coste». Esa instrucción invalida la propuesta Pabellón B + Lounge Sur y cambia la búsqueda posterior, probablemente hacia Norte C.

## 11. Interacción real y entorno simulado

La demo combina un escenario anclado en MADRING con acciones verificables.

| Elemento | Implementación prevista para el hackathon |
| --- | --- |
| Evento, invitados y capacidades | Datos sintéticos coherentes con la geografía Norte/Sur |
| Proveedores y responsables | Miembros del equipo o participantes que interpretan esos papeles |
| Conversaciones | Llamadas reales a teléfonos de prueba o interacción de voz con una persona |
| Reservas y tareas | Escrituras reales en un sistema de prueba persistente, con estados y responsables |
| Incidentes adicionales | Cambios introducidos desde un control de simulación |
| Movimiento físico de personas, comida y vehículos | Simulado y etiquetado como tal |

La plataforma HappyRobot se utiliza para las interacciones y flujos que permita la configuración del hackathon. Las integraciones concretas se validan durante la implementación.

La demo debe incluir al menos una conversación real cuyo resultado altere una decisión y una acción persistente que refleje ese resultado. El panel muestra qué se ha ejecutado, qué se ha simulado y qué sigue pendiente.

## 12. Ejemplo de ejecución completa

Esta secuencia ilustra un resultado posible; no debe convertirse en una lista rígida de respuestas.

| Hora simulada | Qué ocurre | Qué hace el sistema |
| --- | --- | --- |
| 12:15 | Se confirma el cierre del Pabellón Principal | Abre la crisis, identifica las dependencias afectadas y asigna consultas |
| 12:16 | Espacios obtiene disponibilidad inicial de Pabellón B y Lounge Sur | Prepara una alternativa en la misma zona y enumera sus condiciones pendientes |
| 12:17 | Catering solicita otro muelle para descargar | Crea una tarea de verificación con el recinto y recepción |
| 12:18 | El plan alternativo tiene un coste previsto de 3.200 € | Solicita autorización y explica qué sigue sin confirmar |
| 12:19 | El organizador autoriza el gasto y la división de la hospitalidad | Avanza en reservas y acuerdos sujetos a validación final |
| 12:20 | Lounge Sur comunica que solo estará preparado a las 13:15 | Revisa la apertura y la atención de las 150 personas afectadas |
| 12:21 | El recinto confirma una espera adecuada en Sur y el organizador acepta apertura escalonada | Actualiza el programa y asigna recepción a ambos grupos |
| 12:23 | Transporte y Catering aceptan sus nuevas instrucciones | Registra compromisos y publica comunicaciones coherentes (seguir en Sur) |
| 12:25 | Se confirma la recepción de parte de los avisos | Actualiza la cobertura de comunicación y contacta a quienes siguen pendientes |

El desenlace no tiene por qué mantener todos los horarios originales. Una recuperación honesta puede incluir retraso parcial, mayor coste, un traslado a Norte o una decisión humana de cancelar una parte. El sistema debe explicar el resultado y las limitaciones restantes.

## 13. Demo propuesta: tres minutos

### 0:00–0:25 · Entender la crisis

Se muestra el bloque de hospitalidad con 600 invitados y el Pabellón Principal cerrado en MADRING Sur. La cuenta atrás marca 45 minutos hasta la apertura. El panel identifica inmediatamente qué partes del plan han quedado afectadas y por qué Norte no es un atajo a pie.

### 0:25–1:15 · Ver a los agentes actuar

Espacios consulta alternativas en Sur mientras Catering y Transporte comprueban muelle y paradas. Se escucha una conversación real con un proveedor que introduce una condición relevante. El sistema la registra y genera la acción dependiente.

### 1:15–1:50 · Comprobar la coordinación

El panel presenta una alternativa, sus costes y los acuerdos pendientes. El organizador puede intervenir. Las tareas cambian de estado cuando llegan confirmaciones, y el agente de Asistentes comunica las instrucciones que ya son válidas.

### 1:50–2:35 · Cambiar el escenario

El jurado reduce una capacidad, retira el Lounge Sur o fuerza el paso a Norte. Se ve qué acuerdos se invalidan y cómo los agentes reorganizan su trabajo y contactan con los afectados.

### 2:35–3:00 · Mostrar el resultado

Se comparan cobertura inicial y actual, compromisos confirmados, coste y asuntos pendientes. Se enseña una acción persistente y la evidencia de una conversación que cambió el plan.

Los tiempos son orientativos para el pitch. Las llamadas y la latencia real deben ensayarse; el reloj del escenario puede avanzar de forma simulada y debe indicarlo.

## 14. Aprendizaje de interacciones anteriores — bonus

El sistema conserva resultados de ejecuciones anteriores: qué condición se omitió, qué proveedor no respondió, qué alternativa falló y qué pregunta habría permitido descubrir el problema antes.

Ejemplo demostrable:

1. En una primera ejecución, el catering acepta el cambio de pabellón, pero la entrega falla porque no se comprobó el muelle de descarga.
2. Al revisar la interacción, el sistema identifica esa condición omitida.
3. En la siguiente ejecución incorpora la comprobación de acceso antes de confirmar la entrega.
4. El panel muestra el fallo anterior y la comprobación añadida.

El aprendizaje debe producir un cambio observable y apoyarse en un registro real de prueba. Una llamada aislada no permite afirmar que un proveedor sea estadísticamente fiable o poco fiable.

## 15. Encaje con el reto HappyRobot

| Requisito | Cómo lo cubre el escenario | Evidencia en la demo |
| --- | --- | --- |
| Sistema agéntico — obligatorio | El coordinador y los especialistas deciden y ejecutan según el estado actual | Elección de alternativa y acciones posteriores ante una respuesta inesperada |
| Escenario que se mueve — obligatorio | Capacidades, disponibilidad, zona Norte/Sur, tiempos y condiciones cambian durante la ejecución | Un cambio introducido por el jurado modifica el plan |
| Respuesta de varios pasos — obligatorio | Espacio, catering, transporte, personal y comunicación dependen unos de otros | Cadena de acuerdos y tareas con dependencias visibles |
| Interacción de verdad — obligatorio | Los agentes hablan con personas y modifican un sistema de prueba real | Conversación real y reserva o tarea persistente |
| Interfaz para la persona — obligatorio | El panel muestra el estado y permite intervenir | Aprobación, rechazo, cambio de restricción o pausa |
| Aprendizaje de interacciones pasadas — bonus | Se revisan fallos y se ajustan comprobaciones posteriores | Comparación entre dos ejecuciones registradas |

Los tres bloques de evaluación se reflejan así:

- **Cómo decide:** distingue datos relevantes, prioriza necesidades y revisa planes ante nueva información.
- **Cómo actúa:** coordina personas y recursos, consigue acuerdos y comprueba su ejecución.
- **Cómo se supervisa:** muestra decisiones, incertidumbre y límites, y permite al organizador intervenir.

Referencia del enunciado: [HappyRobot · HackSpain 2026](https://hackspain2026.happyrobot.ai). La copia del reto utilizada para definir este escenario es `happyrobot.pdf`.

## 16. Alcance de la primera versión

La primera versión se concentra en:

- Un bloque de hospitalidad el domingo de carrera en MADRING y una crisis activa.
- Un coordinador y las cuatro especialidades descritas.
- Tres alternativas de espacio: Pabellón B (Sur), Lounge Sur y Pabellón Norte C.
- La restricción Norte/Sur sin conexión interior.
- Un proveedor de catering con dos entregas.
- Un operador de transporte con cuatro shuttles.
- Tres grupos de llegada de invitados, más sus requisitos individuales.
- Un panel de supervisión y un control para introducir cambios.
- Un estado persistente de tareas, recursos, acuerdos y autorizaciones.
- Una conversación real que descubra una restricción y cambie el plan.
- Un giro en directo que invalide al menos un compromiso.

Para una ampliación posterior quedan la gestión de varios bloques simultáneos, proveedores adicionales, incidentes sanitarios, cancelaciones comerciales y aprendizaje entre ejecuciones. El bonus de aprendizaje se incorpora cuando la recuperación principal ya funciona de principio a fin.

## 17. Criterios para considerar la demo lista

- [ ] El cierre inicial afecta de forma visible a varias áreas del programa de hospitalidad.
- [ ] Los recursos tienen capacidades, zona Norte/Sur, horarios y responsables coherentes.
- [ ] El sistema diferencia disponibilidad anunciada y compromiso confirmado.
- [ ] Una conversación aporta información nueva y modifica una acción.
- [ ] Dos áreas se coordinan para cumplir una dependencia real.
- [ ] Existe evidencia de una interacción real y una escritura persistente.
- [ ] El cambio introducido en directo invalida el estado anterior y provoca adaptación.
- [ ] Replanificar actualiza o cancela los compromisos que dejan de servir.
- [ ] El sistema evita exceder aforos, mezclar zonas sin traslado, duplicar recursos o superar el gasto autorizado.
- [ ] El responsable humano puede intervenir y los agentes respetan el cambio.
- [ ] El panel separa lo confirmado, lo ejecutado y lo pendiente.
- [ ] Los resultados y las limitaciones se explican sin dar por resueltas acciones incompletas.

## 18. Por qué elegimos este escenario

El problema se entiende rápido: cientos de invitados están llegando el domingo de carrera y el pabellón donde debían reunirse ya no puede utilizarse. La cuenta atrás hasta la apertura, la hora de carrera y la geografía Norte/Sur hacen visible la crisis.

Las conversaciones permiten descubrir soluciones que no estaban en los datos iniciales. Un proveedor puede aceptar otro muelle; el recinto puede habilitar una espera en Sur; el organizador puede autorizar un retraso o un traslado a Norte. Esas respuestas cambian las posibilidades del conjunto.

El escenario ofrece decisiones con consecuencias observables, acciones reales que se pueden demostrar y una supervisión humana clara. También permite introducir cambios sin perder el hilo de la historia.

**La promesa del producto:** convertir una crisis de hospitalidad en carrera en un plan compartido que espacios, catering, transporte e invitados puedan ejecutar, y mantenerlo actualizado cuando la realidad vuelva a cambiar.
