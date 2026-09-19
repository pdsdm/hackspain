import type { CrisisState } from './types'
import { hm } from './time'
import { ROUTE_NORTE_FROM_SUR } from './initialState'
import { groups, openDecision, pushEvent, setAgent, setCommitment, setSpace, startCall, upsertCommitment } from './helpers'

export interface ScriptStep {
  after: number
  run: (s: CrisisState) => void
}

export type ScriptId = CrisisState['scriptId']

const loungeAlive = (s: CrisisState) => s.spaces.find((x) => x.id === 'loungeSur')!.status !== 'descartado'
const pabBCap = (s: CrisisState) => s.spaces.find((x) => x.id === 'pabellonB')!.capacity ?? 450

function assignSur(s: CrisisState, confirmed: boolean) {
  const g = groups(s)
  const capB = pabBCap(s)
  const capL = loungeAlive(s) ? 150 : 0
  g.acceso.assignedSpaceId = 'pabellonB'
  g.shuttles.assignedSpaceId = 'pabellonB'
  g.propios.assignedSpaceId = capL ? 'pabellonB + loungeSur' : 'pabellonB'
  if (!confirmed) return
  let left = capB
  for (const gr of [g.acceso, g.shuttles, g.propios]) {
    gr.confirmedCount = Math.min(gr.count, left)
    left -= gr.confirmedCount
  }
}

const main: ScriptStep[] = [
  {
    after: 20,
    run(s) {
      pushEvent(s, 'accion', 'Coordinador asigna consultas: Espacios → recinto, Catering → proveedor, Transporte → operador')
      upsertCommitment(s, { id: 'c-pabB', title: 'Reubicar 450 invitados en Pabellón B', area: 'espacios', status: 'propuesto', counterpart: 'Recinto', conditions: ['Disponibilidad', 'Montaje y equipamiento', 'Hora de entrega'] })
      upsertCommitment(s, { id: 'c-lounge', title: 'Reubicar 150 invitados en Lounge Sur', area: 'espacios', status: 'propuesto', counterpart: 'Recinto', conditions: ['Disponibilidad', 'Señal de carrera', 'Accesibilidad'] })
      setSpace(s, 'pabellonB', 'propuesto')
      setSpace(s, 'loungeSur', 'propuesto')
      assignSur(s, false)
      startCall(s, 'espacios', 'Responsable de recinto · MADRING', [
        ['agente', 'Necesitamos reubicar a 600 invitados para abrir a las 13:00 en Sur. ¿Podéis confirmar Pabellón B y Lounge de Fan Zone Sur?'],
        ['humano', 'Pabellón B sí. El lounge está disponible, pero el montaje no termina hasta las 13:15.'],
        ['agente', '¿Hay una zona de espera autorizada para las 150 personas? Necesito confirmar acceso y señal de carrera.'],
        ['humano', 'Lo miro con seguridad y os digo.'],
      ])
      setCommitment(s, 'c-pabB', 'en_consulta')
      setCommitment(s, 'c-lounge', 'en_consulta')
    },
  },
  {
    after: 45,
    run(s) {
      setCommitment(s, 'c-pabB', 'aceptado_condiciones', 'Recinto confirma disponibilidad', ['Montaje listo 12:50'])
      setSpace(s, 'pabellonB', 'pendiente', 'Disponible · montaje 12:50')
      if (loungeAlive(s)) {
        setCommitment(s, 'c-lounge', 'aceptado_condiciones', 'Montaje hasta 13:15', ['Montaje termina 13:15', 'Zona de espera pendiente'])
        setSpace(s, 'loungeSur', 'pendiente', 'Disponible · montaje hasta 13:15')
      }
      setAgent(s, 'espacios', { status: 'activo', objective: 'Cerrar condiciones de Pabellón B + Lounge Sur', lastResult: 'Pabellón B disponible · Lounge con retraso' })
      pushEvent(s, 'acuerdo', 'Recinto: Pabellón B disponible. Lounge Sur disponible con montaje hasta 13:15', 'espacios')
      pushEvent(s, 'info', 'Coordinador: alternativa Sur (450 + 150) con 2 condiciones pendientes. Faltan 150 plazas confirmadas')
      s.budget.forecast = 3200
      startCall(s, 'catering', 'Responsable de catering · Sabor Ibérico', [
        ['agente', 'El Pabellón Principal está cerrado. Preparamos 450 servicios en Pabellón B y 150 en Lounge Sur. ¿Podéis mantener los requisitos alimentarios?'],
        ['humano', 'Sí, pero la segunda entrega tiene que entrar por el muelle este de Sur y alguien de recepción debe abrirlo.'],
        ['agente', 'Registro la condición: muelle este + apertura por recepción. Os confirmo en cuanto el recinto lo valide.'],
      ])
    },
  },
  {
    after: 45,
    run(s) {
      upsertCommitment(s, { id: 'c-entrega1', title: 'Entrega CAT-01 · 360 servicios → Muelle Este Sur', area: 'catering', status: 'aceptado_condiciones', counterpart: 'Sabor Ibérico', conditions: ['Muelle Este validado por recinto', 'Recepción abre el muelle'], note: 'Redistribución 450/150' })
      upsertCommitment(s, { id: 'c-entrega2', title: 'Entrega CAT-02 · 240 servicios → Muelle Este Sur', area: 'catering', status: 'aceptado_condiciones', counterpart: 'Sabor Ibérico', conditions: ['Muelle Este validado por recinto', 'Recepción abre el muelle'] })
      for (const d of s.deliveries) { d.dockId = 'muelleEste'; d.note = 'Pendiente validar Muelle Este' }
      setSpace(s, 'muelleEste', 'pendiente', 'Verificación solicitada al recinto')
      setAgent(s, 'catering', { status: 'esperando', objective: 'Esperar validación del Muelle Este', lastResult: 'Proveedor acepta dividir 450/150' })
      pushEvent(s, 'acuerdo', 'Catering acepta dividir el servicio. Condición nueva: Muelle Este Sur + recepción', 'catering')
      pushEvent(s, 'accion', 'Coordinador crea tarea: recinto verifica Muelle Este; recepción asigna 1 persona a la descarga')
      upsertCommitment(s, { id: 'c-muelle', title: 'Verificar y abrir Muelle Este Sur', area: 'espacios', status: 'en_consulta', counterpart: 'Recinto + Recepción', conditions: ['Acceso de camión autorizado'] })
      startCall(s, 'transporte', 'Coordinador de transporte · Transportes Ibéricos', [
        ['agente', 'El acceso del Pabellón Principal ha cambiado. Para BUS-02 proponemos la entrada este de Sur. ¿Podéis confirmar llegada a las 12:50?'],
        ['humano', 'El vehículo puede llegar, pero esa entrada no permite parar un autocar.'],
        ['agente', 'Descarto esa parada. Busco un punto autorizado con el recinto y os lo confirmo.'],
      ])
    },
  },
  {
    after: 40,
    run(s) {
      setAgent(s, 'transporte', { status: 'activo', objective: 'Encontrar parada autorizada para autocares en Sur', lastResult: 'Entrada este descartada: no admite autocar' })
      pushEvent(s, 'fallo', 'Transporte: la entrada este no admite parada de autocar. Punto descartado', 'transporte')
      pushEvent(s, 'info', 'Plan Sur: coste previsto 3.200 €. Continúan las gestiones sin aprobación económica; las reservas y condiciones siguen pendientes.')
      setAgent(s, 'espacios', { status: 'activo', objective: 'Confirmar reservas y condiciones operativas' })
    },
  },
  {
    after: 15,
    run(s) {
      setCommitment(s, 'c-pabB', 'confirmado', 'Reserva confirmada por recinto', [])
      setSpace(s, 'pabellonB', 'confirmado', `Reservado · ${pabBCap(s)} plazas`)
      s.budget.committed = 1500
      assignSur(s, true)
      setAgent(s, 'espacios', { status: 'activo', objective: 'Cerrar Lounge Sur y zona de espera', lastResult: 'Pabellón B reservado' })
      pushEvent(s, 'acuerdo', `Pabellón B reservado: ${pabBCap(s)} plazas confirmadas en Sur`, 'espacios')
      pushEvent(s, 'info', `Cobertura: ${pabBCap(s)}/600 confirmados · ${600 - pabBCap(s)} pendientes de Lounge Sur`)
      if (loungeAlive(s)) {
        startCall(s, 'espacios', 'Responsable de recinto · MADRING', [
          ['agente', 'Pabellón B confirmado, gracias. Sobre el Lounge Sur: ¿podéis autorizar una zona de espera para 150 personas hasta las 13:15?'],
          ['humano', 'Seguridad autoriza la explanada junto al acceso Sur con carpa y agua. Señal de carrera solo desde las 13:15.'],
          ['agente', 'Perfecto. Registro espera en Sur hasta 13:15 y apertura escalonada. Necesito aceptación del organizador.'],
        ])
      }
    },
  },
  {
    after: 45,
    run(s) {
      if (!loungeAlive(s)) return
      setSpace(s, 'esperaSur', 'pendiente', 'Explanada acceso Sur · carpa y agua')
      setCommitment(s, 'c-lounge', 'aceptado_condiciones', 'Espera autorizada; falta aceptar apertura escalonada', ['Organizador acepta apertura escalonada 13:15'])
      pushEvent(s, 'espera', 'Lounge Sur solo estará preparado a las 13:15. Recinto autoriza zona de espera en Sur', 'espacios')
      pushEvent(s, 'decision', 'Coordinador propone apertura escalonada: 450 a las 13:00, 150 a las 13:15 (coste registrado, sin aprobación económica)')
    },
  },
  {
    after: 35,
    run(s) {
      if (loungeAlive(s)) {
        setCommitment(s, 'c-lounge', 'confirmado', 'Apertura escalonada aceptada por el responsable', [])
        setSpace(s, 'loungeSur', 'confirmado', 'Reservado · 150 plazas · listo 13:15')
        setSpace(s, 'esperaSur', 'confirmado', 'Espera 150 personas hasta 13:15')
        const g = groups(s)
        g.propios.confirmedCount = Math.min(g.propios.count, g.propios.confirmedCount + 150)
        s.budget.committed = 2400
        pushEvent(s, 'intervencion', 'Responsable acepta apertura escalonada. Lounge Sur confirmado (150 plazas, 13:15)')
        pushEvent(s, 'accion', 'Recepción: 4 personas a Pabellón B, 2 a zona de espera Sur')
        setAgent(s, 'espacios', { status: 'estable', objective: 'Vigilar montaje de Pabellón B (12:50) y Lounge (13:15)', lastResult: 'Sur completo: 450 + 150' })
      }
      setCommitment(s, 'c-muelle', 'confirmado', 'Recinto valida acceso de camión; recepción asignada', [])
      setSpace(s, 'muelleEste', 'confirmado', 'Validado · recepción abre a las 12:35')
      pushEvent(s, 'acuerdo', 'Recinto valida Muelle Este Sur. Recepción abrirá a las 12:35', 'espacios')
      startCall(s, 'transporte', 'Coordinador de transporte · Transportes Ibéricos', [
        ['agente', 'Recinto autoriza la parada P2 junto al acceso Sur para los 4 shuttles. ¿Confirmáis nuevas instrucciones a los conductores?'],
        ['humano', 'Confirmado. BUS-04 llega 12:45, BUS-01 12:40, BUS-03 12:48 y BUS-02 12:50 a P2.'],
      ])
    },
  },
  {
    after: 40,
    run(s) {
      for (const sh of s.shuttles) if (sh.status !== 'retrasado') sh.accepted = true
      setCommitment(s, 'c-shuttles', 'confirmado', 'Parada P2 · Acceso Sur aceptada por el operador', [])
      setAgent(s, 'transporte', { status: 'estable', objective: 'Seguir llegada de shuttles a P2', lastResult: '4 shuttles aceptan P2' })
      pushEvent(s, 'acuerdo', 'Transporte acepta parada P2 · Acceso Sur para los 4 shuttles', 'transporte')
      for (const d of s.deliveries) if (d.status === 'programada') { d.status = 'confirmada'; d.note = 'Muelle Este Sur confirmado' }
      setCommitment(s, 'c-entrega1', 'confirmado', 'Muelle Este confirmado', [])
      setCommitment(s, 'c-entrega2', 'confirmado', 'Muelle Este confirmado', [])
      setAgent(s, 'catering', { status: 'estable', objective: 'Seguir entregas CAT-01 (12:40) y CAT-02 (13:05)', lastResult: '2 entregas confirmadas en Muelle Este' })
      pushEvent(s, 'acuerdo', 'Catering confirma CAT-01 y CAT-02 en Muelle Este Sur', 'catering')
      if (s.budget.forecast !== null) s.budget.committed = s.budget.forecast
      s.coordinatorStatus = 'estable'
      s.planVersion = 2
      pushEvent(s, 'accion', 'Plan v2 confirmado. Asistentes publica instrucciones segmentadas (seguir en Sur)')
      setAgent(s, 'asistentes', { status: 'activo', objective: 'Enviar SMS segmentados a 600 invitados', lastResult: 'Plan confirmado, mensajes en curso' })
      startCall(s, 'asistentes', '600 invitados · 3 segmentos', [
        ['agente', 'SMS · en camino (330): «Tu acceso sigue siendo MADRING Sur. Apertura 13:00. No intentes entrar por Norte: las zonas no están conectadas por dentro».'],
        ['agente', 'SMS · en shuttle (180): «Tu shuttle llegará a la parada P2 del acceso Sur. Recepción os acompañará al Pabellón B».'],
        ['agente', 'SMS · en acceso (90): «Permanece en el control de acceso Sur. El equipo te acompañará al nuevo espacio a las 13:00».'],
      ], 'sms')
    },
  },
  {
    after: 40,
    run(s) {
      const g = groups(s)
      g.acceso.informedCount = 90; g.acceso.acceptedCount = 84
      g.shuttles.informedCount = 150; g.shuttles.acceptedCount = 121
      g.propios.informedCount = 240; g.propios.acceptedCount = 187
      setAgent(s, 'asistentes', { status: 'llamada', objective: 'Llamar a 120 invitados sin confirmación de recepción', lastResult: '480/600 informados' })
      pushEvent(s, 'mensaje', 'Entrega confirmada de 480/600 avisos. 120 pendientes: se contacta por llamada', 'asistentes')
      pushEvent(s, 'info', 'Coordinador: 12 invitados con accesibilidad asignados a Pabellón B (acceso a nivel). Confirmación individual en curso')
      s.resolved = true
    },
  },
  {
    after: 60,
    run(s) {
      const g = groups(s)
      g.shuttles.informedCount = 180; g.shuttles.acceptedCount = 168
      g.propios.informedCount = 305; g.propios.acceptedCount = 260
      setAgent(s, 'asistentes', { status: 'estable', objective: 'Reintentar 25 invitados sin respuesta', lastResult: '575/600 informados' })
      pushEvent(s, 'mensaje', '575/600 invitados informados. 25 sin respuesta: reintento a las 12:35', 'asistentes')
    },
  },
]

const norte: ScriptStep[] = [
  {
    after: 15,
    run(s) {
      startCall(s, 'espacios', 'Responsable de recinto · MADRING', [
        ['agente', 'El organizador no acepta dividir el programa. ¿Podéis confirmar Pabellón Norte C para 600 personas y a qué hora estaría listo?'],
        ['humano', 'Norte C está libre. Montaje completo a las 13:45, no antes. El acceso es por Valdebebas.'],
        ['agente', 'Registro apertura 13:45 en Norte. Necesitaré traslado Norte↔Sur para 90 personas que ya están en el acceso Sur.'],
      ])
      setAgent(s, 'espacios', { status: 'llamada', objective: 'Confirmar Pabellón Norte C para 600' })
    },
  },
  {
    after: 45,
    run(s) {
      setSpace(s, 'norteC', 'pendiente', 'Disponible · montaje hasta 13:45')
      setCommitment(s, 'c-norteC', 'aceptado_condiciones', 'Recinto confirma disponibilidad', ['Montaje 13:45', 'Traslado 90 personas Sur→Norte', 'Shuttles redirigidos a Acceso Norte'])
      pushEvent(s, 'acuerdo', 'Recinto: Norte C disponible desde 13:45. Acceso por Valdebebas', 'espacios')
      openDecision(s, {
        id: 'd-plan-norte',
        kind: 'operational',
        title: 'Aceptar traslado a Norte y apertura a las 13:45',
        summary: 'Un único espacio para 600, con 45 min de retraso sobre la apertura y traslado exterior de 90 personas desde el acceso Sur. Coste previsto 2.800 €.',
        cost: 2800,
        conditions: ['Aceptar apertura 13:45 (almuerzo se retrasa a 14:00)', 'Shuttles cambian destino a Acceso Norte', '2 lanzaderas Sur→Norte para 90 personas'],
        effectApprove: 'Se reserva Norte C, se redirigen shuttles y catering a Norte y se informa a 600 invitados.',
        effectReject: 'Sin plan viable para 600 juntos. El coordinador presenta el impacto: 600 personas sin ubicación confirmada.',
      })
    },
  },
  {
    after: 15,
    run(s) {
      setSpace(s, 'norteC', 'confirmado', 'Reservado · 600 plazas · listo 13:45')
      setCommitment(s, 'c-norteC', 'confirmado', 'Reserva confirmada', ['Shuttles a Acceso Norte', 'Lanzaderas Sur→Norte'])
      s.budget.committed = 1800
      s.clock.openingAt = hm(13, 45)
      s.clock.lunchAt = hm(14, 0)
      for (const g of s.guestGroups) { g.assignedSpaceId = 'norteC'; g.confirmedCount = g.count }
      for (const sh of s.shuttles) { sh.destinationId = 'accesoNorte'; sh.accepted = false; sh.status = 'reasignado'; sh.route = [...sh.route.slice(0, -1), ...ROUTE_NORTE_FROM_SUR.slice(1)]; sh.arriveAt += 15 * 60 }
      for (const d of s.deliveries) { d.dockId = 'muelleNorte'; d.status = 'programada'; d.note = 'Redirigida a Norte C · pendiente aceptación'; d.arriveAt += 20 * 60 }
      upsertCommitment(s, { id: 'c-lanzadera', title: 'Lanzadera Sur→Norte para 90 personas (2 viajes)', area: 'transporte', status: 'en_consulta', counterpart: 'Transportes Ibéricos', conditions: ['Vehículo disponible en Sur a las 13:15'] })
      setCommitment(s, 'c-shuttles', 'en_consulta', 'Cambio de destino a Acceso Norte pendiente de aceptación', ['Conductores aceptan ruta exterior a Norte'])
      pushEvent(s, 'acuerdo', 'Pabellón Norte C reservado: 600 plazas. Apertura 13:45', 'espacios')
      pushEvent(s, 'accion', 'Coordinador invalida rutas Sur: 4 shuttles y 2 entregas pendientes de aceptar Norte')
      setAgent(s, 'espacios', { status: 'estable', objective: 'Vigilar montaje Norte C (13:45)', lastResult: 'Norte C reservado' })
      setAgent(s, 'transporte', { status: 'activo', objective: 'Redirigir 4 shuttles a Acceso Norte + lanzadera Sur→Norte' })
      setAgent(s, 'catering', { status: 'activo', objective: 'Redirigir 2 entregas al muelle de Norte C' })
      startCall(s, 'transporte', 'Coordinador de transporte · Transportes Ibéricos', [
        ['agente', 'Cambio de plan: los 4 shuttles van al Acceso Norte (Valdebebas) por el exterior, y necesitamos 2 viajes Sur→Norte para 90 personas a las 13:15.'],
        ['humano', 'Los shuttles pueden ir a Norte, +15 minutos. La lanzadera la hago con BUS-01 cuando descargue.'],
        ['agente', 'Registrado: shuttles a Acceso Norte y BUS-01 como lanzadera desde 13:15.'],
      ])
    },
  },
  {
    after: 45,
    run(s) {
      for (const sh of s.shuttles) { sh.accepted = true; sh.status = 'en_ruta' }
      setCommitment(s, 'c-shuttles', 'confirmado', 'Operador acepta Acceso Norte', [])
      setCommitment(s, 'c-lanzadera', 'confirmado', 'BUS-01 hace lanzadera desde 13:15', [])
      for (const d of s.deliveries) { d.status = 'confirmada'; d.note = 'Muelle Norte C confirmado' }
      upsertCommitment(s, { id: 'c-entrega1', title: 'Entrega CAT-01 · 360 servicios → Norte C', area: 'catering', status: 'confirmado', counterpart: 'Sabor Ibérico', conditions: [] })
      upsertCommitment(s, { id: 'c-entrega2', title: 'Entrega CAT-02 · 240 servicios → Norte C', area: 'catering', status: 'confirmado', counterpart: 'Sabor Ibérico', conditions: [] })
      s.budget.committed = 2800
      s.coordinatorStatus = 'estable'
      s.planVersion += 1
      setAgent(s, 'transporte', { status: 'estable', objective: 'Seguir shuttles a Norte y lanzadera', lastResult: 'Operador acepta Norte' })
      setAgent(s, 'catering', { status: 'estable', objective: 'Seguir entregas a Norte C', lastResult: 'Entregas redirigidas' })
      setAgent(s, 'asistentes', { status: 'activo', objective: 'Avisar a 600 invitados: Norte C, apertura 13:45' })
      pushEvent(s, 'acuerdo', 'Transporte y Catering aceptan el plan Norte', 'transporte')
      pushEvent(s, 'accion', `Plan v${s.planVersion} confirmado. Asistentes envía instrucciones: acceso Norte (Valdebebas), apertura 13:45`)
      startCall(s, 'asistentes', '600 invitados · 3 segmentos', [
        ['agente', 'SMS · en camino (330): «Cambio de acceso: entra por MADRING Norte (Valdebebas). Apertura 13:45. No entres por Sur».'],
        ['agente', 'SMS · en acceso Sur (90): «Permanece en el acceso Sur. Una lanzadera os llevará a Norte a las 13:15».'],
      ], 'sms')
    },
  },
  {
    after: 40,
    run(s) {
      const g = groups(s)
      g.acceso.informedCount = 90; g.acceso.acceptedCount = 80
      g.shuttles.informedCount = 180; g.shuttles.acceptedCount = 160
      g.propios.informedCount = 250; g.propios.acceptedCount = 190
      setAgent(s, 'asistentes', { status: 'llamada', objective: 'Llamar a 80 invitados sin confirmación', lastResult: '520/600 informados' })
      pushEvent(s, 'mensaje', '520/600 avisos entregados. 80 pendientes: se contacta por llamada', 'asistentes')
      s.resolved = true
    },
  },
]

export const SCRIPTS: Record<ScriptId, ScriptStep[]> = { main, norte, reducido: main }
