# Los 9 giros: qué hace cada uno y qué decide el agente

> Referencia para el equipo y para el pitch. La implementación está en
> `backend/src/domain/control-service.ts` (`applyTwistEffect`), y la lista cerrada de ids
> en `backend/src/contracts/api.ts` (`TWIST_IDS`). Un giro que no esté en esa lista se
> rechaza con HTTP 400.

## Las dos capas de un giro

Cuando alguien pulsa un giro (`POST /simulation/twists`) pasan dos cosas distintas, y
conviene no confundirlas:

**Capa 1 — el efecto, determinista.** Un bloque de código fijo rompe el mundo. Siempre
hace exactamente lo mismo, no interviene ningún modelo, y funciona aunque no haya clave
de LLM. Es el daño y sus consecuencias mecánicas: invalidar compromisos que dependían de
lo que se ha caído, descontar personas que se quedan sin plaza, subir `planVersion`,
poner al coordinador en `replanificando`.

**Capa 2 — la respuesta, no determinista.** El coordinador arranca y decide qué hacer:
a quién consulta, a quién llama, cómo recoloca a los afectados, qué sube al humano. Esto
**no está escrito en ningún sitio**: sale del bucle `evento → LLM → operaciones →
validación`. Con `COORDINATOR_MODE=rules` o sin clave de API, esta capa no ocurre y el
sistema se queda con el daño.

## Taxonomía: 7 sin propuesta, 2 con contingencia

De los nueve giros, **siete dejan el mundo roto y nada más**. Los otros **dos activan
además un plan de contingencia del recinto** (Pabellón Norte C), que el coordinador puede
adoptar o descartar.

| Giro | Qué rompe | ¿Trae contingencia? |
|---|---|---|
| `lounge_unavailable` | Lounge `descartado`, espera `inactivo`, invalida `c-lounge` y `c-espera`, 150 personas pierden plaza | **Sí — Norte C `propuesto`** |
| `reject_split` | Descarta Pabellón B y Lounge, invalida `c-pabB`, `c-lounge`, `c-espera` | **Sí — Norte C `propuesto`** |
| `pabellon_b_400` | Aforo de B a 400, invalida `c-pabB`, recuenta confirmados hasta 550 | No |
| `shuttle_delay` | BUS-02 +20 min, estado `retrasado` | No |
| `delivery_delay` | CAT-02 +25 min, estado `retrasada` | No |
| `dock_blocked` | Muelle Este `cerrado`, invalida `c-muelle`, entregas a `bloqueada` | No |
| `provider_silent` | Agente de Transporte a `incidencia` | No |
| `reject_spend` | La decisión pendiente pasa a `rechazada` | No |
| `guest_need` | Añade necesidades no registradas al grupo «por sus medios» | No |

El recuento de `pabellon_b_400` no cuenta como contingencia: es aritmética (si el aforo
baja, caben menos), no una alternativa nueva.

## Por qué la contingencia es deliberada

Un recinto que opera un Gran Premio tiene planes de contingencia escritos. «Si se cae el
Principal, existe Norte C» es lo que pone un manual de operaciones, no una idea que se le
ocurra a nadie en el momento. Modelarlo así es más realista que hacer que el agente
invente la alternativa desde cero.

Y sobre todo, **prueba mejor el criterio del jurado**. La gracia no es que el agente
encuentre Norte C: es que **tenga criterio para adoptarla o rechazarla**. Norte C son 600
plazas juntas, pero a las 13:45 (45 minutos tarde), en otra zona, con traslado exterior,
transporte y permisos. Un agente que la coge porque está ahí es peor que uno que la
descarta explicando por qué. Rechazar la opción obvia con un motivo sólido demuestra más
juicio que inventar una opción.

## Regla: una contingencia tiene que verse como tal

Para que esto no se lea como «el agente ya lo tenía decidido», **cualquier estado que
active una contingencia debe llevar nota de origen**. El panel ya pinta `space.note` en la
tarjeta de incidencia, el tooltip del mapa y el detalle del recurso, así que no hace falta
trabajo de frontend.

```
norteC → propuesto, note: "Plan de contingencia del recinto · 600 plazas desde 13:45"
```

Sin esa nota, en pantalla no hay forma de distinguir una contingencia preexistente de una
propuesta del coordinador — y si el LLM se cae, la demo parece que sigue razonando cuando
en realidad no hay nadie pensando. Con ella, el fallo se ve.

Si más adelante hace falta precisión, el paso siguiente es un campo de autoría en `Space`
(`propuestoPor: 'recinto' | 'coordinador'`). Para la demo, la nota basta y no toca el
contrato.

## La cadena de dos giros

La contingencia abre una jugada que merece estar en el guion de la demo, porque usa lo que
ya existe y no se puede fingir:

1. **`lounge_unavailable`** → faltan 150 plazas en Sur y aparece la contingencia Norte C.
2. **`provider_silent`** → el transportista no responde. Como Norte exige traslado exterior
   confirmado, **la propia contingencia se queda sin salida**.

El agente pierde la alternativa fácil y tiene que resolver con lo que queda. Es la mejor
prueba de adaptación que podemos enseñar con dos botones.

## Lo que el chat libre no tiene

`POST /events` con texto libre no tiene capa 1: no hay efecto preestablecido para
«se ha incendiado un contenedor en el parking Sur». Todo depende del coordinador. Por eso
el chat demuestra razonamiento de verdad, y por eso **sin clave de LLM no hace
absolutamente nada más que escribirse en la cronología**.
