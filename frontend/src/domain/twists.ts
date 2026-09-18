import type { CrisisState, TwistId } from './types'
import { groups, invalidate, openDecision, pushEvent, setAgent, setCommitment, setSpace, startCall, upsertCommitment } from './helpers'

export interface TwistMeta {
  id: TwistId
  label: string
  consequence: string
}

export const TWISTS: TwistMeta[] = [
  { id: 'lounge_unavailable', label: 'Lounge Sur deja de estar disponible', consequence: 'Faltan 150 plazas en Sur' },
  { id: 'pabellon_b_400', label: 'Pabellón B baja a 400 plazas', consequence: 'B + Lounge solo cubren 550' },
  { id: 'shuttle_delay', label: 'BUS-02 se retrasa 20 min', consequence: '45 personas llegan tarde' },
  { id: 'delivery_delay', label: 'Segunda entrega de catering se retrasa', consequence: '240 servicios fuera de hora' },
  { id: 'dock_blocked', label: 'Se bloquea el muelle de descarga', consequence: 'El proveedor no puede descargar' },
  { id: 'provider_silent', label: 'El transportista no responde', consequence: 'Alternativa sin confirmar' },
  { id: 'reject_spend', label: 'Organizador rechaza el gasto adicional', consequence: 'Plan no autorizado' },
  { id: 'reject_split', label: 'Organizador rechaza dividir la hospitalidad', consequence: 'Buscar un único espacio de 600' },
  { id: 'guest_need', label: 'Invitado comunica necesidad no registrada', consequence: 'Asignación puede no ser adecuada' },
]

function replan(s: CrisisState) {
  s.coordinatorStatus = 'replanificando'
  s.planVersion += 1
}

function pendingDecision(s: CrisisState) {
  return s.decisions.find((d) => d.status === 'pendiente') ?? null
}

export function goToNorte(s: CrisisState, why: string) {
  const pend = pendingDecision(s)
  if (pend) { pend.status = 'rechazada'; s.waitingForDecision = null }
  const inv = ['c-pabB', 'c-lounge', 'c-muelle', 'c-entrega1', 'c-entrega2', 'c-shuttles']
  let n = 0
  for (const id of inv) if (invalidate(s, id, why)) n++
  setSpace(s, 'pabellonB', 'descartado', 'Descartado: no se divide la hospitalidad')
  setSpace(s, 'loungeSur', 'descartado', 'Descartado: no se divide la hospitalidad')
  setSpace(s, 'esperaSur', 'inactivo')
  setSpace(s, 'norteC', 'propuesto', 'Única opción para 600 juntos · apertura 13:45')
  for (const g of s.guestGroups) { g.confirmedCount = 0; g.assignedSpaceId = 'norteC'; g.acceptedCount = 0 }
  for (const sh of s.shuttles) { sh.accepted = false }
  if (s.budget.committed > 0) pushEvent(s, 'fallo', `Se liberan reservas en Sur. Coste ya comprometido: ${s.budget.committed.toLocaleString('es-ES')} € (posible penalización)`)
  s.budget.forecast = 2800
  upsertCommitment(s, { id: 'c-norteC', title: 'Reubicar 600 invitados en Pabellón Norte C', area: 'espacios', status: 'propuesto', counterpart: 'Recinto', conditions: ['Disponibilidad 13:45', 'Traslado exterior Sur→Norte', 'Aceptar retraso de apertura'] })
  pushEvent(s, 'intervencion', why)
  pushEvent(s, 'accion', `Coordinador invalida ${n} compromisos del plan Sur y explora Pabellón Norte C (600, 13:45)`)
  setAgent(s, 'espacios', { status: 'activo', objective: 'Confirmar Pabellón Norte C para 600' })
  setAgent(s, 'transporte', { status: 'esperando', objective: 'Preparar cambio de zona de 4 shuttles a Norte' })
  setAgent(s, 'catering', { status: 'esperando', objective: 'Preparar redirección de entregas a Norte' })
  setAgent(s, 'asistentes', { status: 'esperando', objective: 'Retener avisos hasta confirmar Norte C' })
  replan(s)
  s.scriptId = 'norte'
  s.scriptCursor = 0
  s.nextScriptAt = s.clock.simSeconds + 10
  s.resolved = false
}

export function rejectSpend(s: CrisisState) {
  const pend = pendingDecision(s)
  if (pend && pend.id === 'd-plan-sur') {
    pend.status = 'rechazada'
    s.waitingForDecision = null
    invalidate(s, 'c-lounge', 'Gasto no autorizado: se mantiene el límite de 1.500 €')
    setSpace(s, 'loungeSur', 'descartado', 'Sin autorización de gasto')
    pushEvent(s, 'intervencion', 'Responsable rechaza el gasto adicional. Límite: 1.500 €')
    pushEvent(s, 'accion', 'Coordinador recalcula dentro del límite: solo Pabellón B (1.500 €)')
    replan(s)
    s.scriptId = 'reducido'
    s.scriptCursor = 0
    s.nextScriptAt = s.clock.simSeconds + 8
    return
  }
  if (pend) { pend.status = 'rechazada'; s.waitingForDecision = null }
  s.budget.authorized = 1500
  const g = groups(s)
  if (invalidate(s, 'c-lounge', 'Gasto retirado por el responsable')) {
    setSpace(s, 'loungeSur', 'descartado', 'Gasto retirado')
    setSpace(s, 'esperaSur', 'inactivo')
    g.propios.confirmedCount = Math.max(0, g.propios.confirmedCount - 150)
  }
  s.budget.forecast = 1500
  s.budget.committed = Math.min(s.budget.committed, 1500)
  pushEvent(s, 'intervencion', 'Responsable retira la autorización de gasto adicional (límite 1.500 €)')
  pushEvent(s, 'fallo', '150 invitados sin ubicación confirmada. El coordinador no declara cobertura completa')
  setAgent(s, 'espacios', { status: 'incidencia', objective: '150 invitados sin ubicación · presentar impacto' })
  replan(s)
  s.resolved = false
}

export function applyTwist(s: CrisisState, t: TwistId) {
  s.twistsApplied.push(t)
  const g = groups(s)
  switch (t) {
    case 'lounge_unavailable': {
      const had = invalidate(s, 'c-lounge', 'Recinto retira el Lounge Sur')
      setSpace(s, 'loungeSur', 'descartado', 'No disponible: retirado por el recinto')
      setSpace(s, 'esperaSur', 'inactivo')
      g.propios.confirmedCount = Math.max(0, g.propios.confirmedCount - 150)
      pushEvent(s, 'incidencia', 'Recinto: el Lounge Sur deja de estar disponible', 'espacios')
      pushEvent(s, 'fallo', `Faltan 150 plazas en Sur${had ? ' · compromiso invalidado' : ''}. Se explora Norte C con traslado`)
      setSpace(s, 'norteC', 'propuesto', 'Alternativa para 150 con traslado · 13:45')
      upsertCommitment(s, { id: 'c-norte150', title: 'Traslado de 150 invitados a Norte C (13:45)', area: 'espacios', status: 'propuesto', counterpart: 'Recinto + Transporte', conditions: ['Lanzadera Sur→Norte', 'Aceptar retraso 13:45'] })
      setAgent(s, 'espacios', { status: 'incidencia', objective: 'Cubrir 150 plazas: Norte C con traslado o espera en Sur' })
      setAgent(s, 'asistentes', { status: 'activo', objective: 'Avisar a 150 invitados: instrucción pendiente, esperar en Sur' })
      startCall(s, 'espacios', 'Responsable de recinto · MADRING', [
        ['agente', 'Nos comunican que el Lounge Sur ya no está disponible. ¿Podéis confirmar Norte C para 150 personas a las 13:45 y una lanzadera desde Sur?'],
        ['humano', 'Norte C sí, para 150 sin problema. La lanzadera tenéis que verla con vuestro transportista.'],
      ])
      replan(s)
      break
    }
    case 'pabellon_b_400': {
      const sp = s.spaces.find((x) => x.id === 'pabellonB')!
      sp.capacity = 400
      sp.note = 'Capacidad validada: 400 (antes 450)'
      const c = s.commitments.find((x) => x.id === 'c-pabB')
      if (c) { c.title = 'Reubicar 400 invitados en Pabellón B'; if (c.status === 'confirmado') { c.status = 'aceptado_condiciones'; c.conditions = ['50 plazas por reubicar']; c.updatedAt = s.clock.simSeconds } }
      const total = g.acceso.confirmedCount + g.shuttles.confirmedCount + g.propios.confirmedCount
      if (total > 0) {
        let left = 400 + (s.spaces.find((x) => x.id === 'loungeSur')!.status === 'confirmado' ? 150 : 0)
        for (const gr of [g.acceso, g.shuttles, g.propios]) { gr.confirmedCount = Math.min(gr.count, left); left -= gr.confirmedCount }
      }
      pushEvent(s, 'incidencia', 'Recinto valida Pabellón B con 400 plazas (no 450)', 'espacios')
      pushEvent(s, 'fallo', 'B + Lounge Sur cubren 550/600. Faltan 50 plazas: el coordinador no declara cobertura completa')
      setAgent(s, 'espacios', { status: 'incidencia', objective: 'Cubrir 50 plazas: ampliar espera Sur o Norte C' })
      upsertCommitment(s, { id: 'c-50', title: 'Ubicar 50 invitados sin plaza', area: 'espacios', status: 'propuesto', counterpart: 'Recinto', conditions: ['Espacio adicional en Sur o traslado a Norte'] })
      replan(s)
      break
    }
    case 'shuttle_delay': {
      const sh = s.shuttles.find((x) => x.id === 'BUS-02')!
      sh.delayMin += 20
      sh.arriveAt += 20 * 60
      sh.status = 'retrasado'
      const c = s.commitments.find((x) => x.id === 'c-shuttles')
      if (c && c.status !== 'invalidado') { c.status = 'aceptado_condiciones'; c.conditions = ['BUS-02 llega 13:10 · recepción tardía']; c.note = 'Retraso de 20 min en BUS-02'; c.updatedAt = s.clock.simSeconds }
      g.shuttles.acceptedCount = Math.max(0, g.shuttles.acceptedCount - 45)
      pushEvent(s, 'incidencia', 'Transporte: BUS-02 (45 personas) se retrasa 20 min por la M-11', 'transporte')
      pushEvent(s, 'accion', 'Coordinador recalcula llegada 13:10: recepción tardía en P2 y servicio de almuerzo escalonado para 45')
      setAgent(s, 'transporte', { status: 'incidencia', objective: 'Valorar ruta alternativa para BUS-02 (M-40) y avisar a recepción' })
      setAgent(s, 'asistentes', { status: 'activo', objective: 'Avisar a 45 pasajeros de BUS-02 del retraso' })
      startCall(s, 'transporte', 'Conductor BUS-02 · Transportes Ibéricos', [
        ['agente', 'Vemos 20 minutos de retraso. ¿Ganáis tiempo saliendo por la M-40 hacia el acceso Sur?'],
        ['humano', 'Por la M-40 llego a las 13:05 en vez de 13:10.'],
        ['agente', 'Adelante por la M-40. Aviso a recepción y a los pasajeros: llegada 13:05 a P2.'],
      ])
      replan(s)
      break
    }
    case 'delivery_delay': {
      const d = s.deliveries.find((x) => x.id === 'CAT-02')!
      d.status = 'retrasada'
      d.arriveAt += 25 * 60
      d.note = 'Retraso 25 min · llegada 13:30'
      const c = s.commitments.find((x) => x.id === 'c-entrega2')
      if (c && c.status !== 'invalidado') { c.status = 'aceptado_condiciones'; c.conditions = ['Servicio del segundo turno se retrasa a 13:45']; c.note = 'Entrega retrasada 25 min'; c.updatedAt = s.clock.simSeconds }
      pushEvent(s, 'incidencia', 'Catering: CAT-02 (240 servicios) se retrasa 25 min', 'catering')
      pushEvent(s, 'accion', 'Coordinador propone: servir CAT-01 a los 450 de Pabellón B y negociar servicio frío para 150 si CAT-02 no llega a 13:30')
      setAgent(s, 'catering', { status: 'llamada', objective: 'Negociar entrega parcial o servicio alternativo para 240' })
      startCall(s, 'catering', 'Responsable de catering · Sabor Ibérico', [
        ['agente', 'CAT-02 llega a las 13:30. ¿Podéis adelantar 120 servicios fríos con CAT-01 para el turno de Lounge?'],
        ['humano', 'Puedo meter 100 fríos en CAT-01 si salen ahora. El resto a las 13:30.'],
        ['agente', 'Aceptado: 100 fríos en CAT-01. Actualizo previsión: 140 servicios a las 13:30.'],
      ])
      replan(s)
      break
    }
    case 'dock_blocked': {
      setSpace(s, 'muelleEste', 'cerrado', 'Bloqueado por vehículo de TV')
      let n = 0
      if (invalidate(s, 'c-muelle', 'Muelle Este bloqueado')) n++
      for (const id of ['c-entrega1', 'c-entrega2']) {
        const c = s.commitments.find((x) => x.id === id)
        if (c && c.status !== 'invalidado') { c.status = 'en_consulta'; c.conditions = ['Nuevo muelle por verificar']; c.note = 'Muelle Este bloqueado'; c.updatedAt = s.clock.simSeconds; n++ }
      }
      for (const d of s.deliveries) if (d.status !== 'entregada') { d.status = 'bloqueada'; d.note = 'Muelle Este bloqueado · buscando acceso' }
      pushEvent(s, 'incidencia', 'Recinto: el Muelle Este Sur está bloqueado por un vehículo de TV', 'catering')
      pushEvent(s, 'fallo', `${n} compromisos de catering vuelven a consulta. Se verifica otro acceso con recinto`)
      setAgent(s, 'catering', { status: 'incidencia', objective: 'Verificar muelle alternativo (Puerta Sur 3) con recinto y proveedor' })
      setAgent(s, 'espacios', { status: 'llamada', objective: 'Pedir al recinto acceso de camión por Puerta Sur 3' })
      startCall(s, 'espacios', 'Responsable de recinto · MADRING', [
        ['agente', 'El Muelle Este está bloqueado por un vehículo de TV. ¿Podéis autorizar la descarga por Puerta Sur 3 o retirar el vehículo antes de las 12:40?'],
        ['humano', 'Puerta Sur 3 está libre, pero el camión tiene que entrar antes de las 12:45 porque luego cierra por el desfile.'],
        ['agente', 'Registro Puerta Sur 3 con ventana hasta 12:45. Aviso al catering ahora.'],
      ])
      replan(s)
      break
    }
    case 'provider_silent': {
      for (const c of s.calls) if (c.status === 'en_curso' && c.agent === 'transporte') c.status = 'sin_respuesta'
      const c = s.commitments.find((x) => x.id === 'c-shuttles')
      if (c && c.status !== 'invalidado') { c.status = 'en_consulta'; c.conditions = ['Sin respuesta del operador · 2 intentos']; c.note = 'Transportista no responde'; c.updatedAt = s.clock.simSeconds }
      for (const sh of s.shuttles) sh.accepted = false
      g.shuttles.acceptedCount = 0
      pushEvent(s, 'fallo', 'Transportes Ibéricos no responde (2 llamadas). Alternativa sin confirmar', 'transporte')
      pushEvent(s, 'accion', 'Coordinador aplica plazo de 5 min: SMS al operador y llamada directa a conductores')
      setAgent(s, 'transporte', { status: 'incidencia', objective: 'Contactar conductores directamente · plazo 12:35' })
      startCall(s, 'transporte', 'Conductor BUS-01 · línea directa', [
        ['agente', 'No localizamos a la central. ¿Podéis confirmar destino parada P2, acceso Sur de MADRING, llegada 12:40?'],
        ['humano', 'Confirmado, P2 acceso Sur. Lo paso al resto por el grupo de conductores.'],
      ])
      replan(s)
      break
    }
    case 'reject_spend':
      rejectSpend(s)
      break
    case 'reject_split':
      goToNorte(s, 'Responsable: «No aceptamos dividir la hospitalidad. Buscad ubicación para los 600 y presentad retraso y coste»')
      break
    case 'guest_need': {
      pushEvent(s, 'incidencia', 'Invitada (grupo por sus medios) comunica silla de ruedas no registrada', 'asistentes')
      pushEvent(s, 'accion', 'Coordinador verifica requisito: reasigna a Pabellón B (acceso a nivel) y pide asistencia en P2')
      g.propios.needs = '13 accesibilidad · 38 dieta'
      upsertCommitment(s, { id: 'c-need', title: 'Asistencia de accesibilidad para 1 invitada en acceso Sur', area: 'asistentes', status: 'en_consulta', counterpart: 'Recepción', conditions: ['Persona de recepción en P2 a las 12:55'] })
      setAgent(s, 'asistentes', { status: 'llamada', objective: 'Confirmar asistencia y espacio accesible para 1 invitada' })
      startCall(s, 'asistentes', 'Invitada · Marta R.', [
        ['agente', 'Hola Marta, hemos recibido tu aviso. Tu espacio pasa a Pabellón B, con acceso a nivel. ¿Te recogemos en la parada P2 del acceso Sur a las 12:55?'],
        ['humano', 'Sí, perfecto. Llego en taxi sobre las 12:50.'],
        ['agente', 'Anotado: recepción te espera en P2 a las 12:50. Te envío la confirmación por SMS.'],
      ])
      break
    }
  }
}

export function applyIntervention(s: CrisisState, type: string, text?: string) {
  const pend = pendingDecision(s)
  switch (type) {
    case 'approve_spend': {
      if (!pend) { pushEvent(s, 'intervencion', 'Responsable confirma la autorización vigente'); return }
      pend.status = 'aprobada'
      s.waitingForDecision = null
      s.budget.authorized = Math.max(s.budget.authorized, pend.cost)
      s.coordinatorStatus = 'replanificando'
      pushEvent(s, 'intervencion', `Responsable autoriza: ${pend.title} · hasta ${pend.cost.toLocaleString('es-ES')} €`)
      if (pend.id === 'd-lounge-solo') {
        setSpace(s, 'loungeSur', 'pendiente', 'Autorizado · montaje hasta 13:15')
        setCommitment(s, 'c-lounge', 'aceptado_condiciones', 'Autorizado por el responsable', ['Montaje termina 13:15', 'Zona de espera pendiente'])
        s.budget.forecast = 2400
        s.scriptId = 'main'
        s.scriptCursor = 5
      }
      s.nextScriptAt = s.clock.simSeconds + 5
      return
    }
    case 'reject_spend':
      if (pend?.id === 'd-plan-norte') {
        pend.status = 'rechazada'; s.waitingForDecision = null
        pushEvent(s, 'intervencion', 'Responsable rechaza el plan Norte')
        pushEvent(s, 'fallo', 'Sin plan viable para 600 juntos. 600 invitados sin ubicación confirmada. Impacto presentado al responsable')
        s.coordinatorStatus = 'replanificando'
        s.nextScriptAt = null
        return
      }
      if (pend?.id === 'd-lounge-solo') {
        pend.status = 'rechazada'; s.waitingForDecision = null
        pushEvent(s, 'intervencion', 'Responsable rechaza 900 € para Lounge Sur')
        pushEvent(s, 'fallo', '150 invitados sin ubicación. Asistentes prepara comunicación de cancelación parcial con compensación')
        setAgent(s, 'asistentes', { status: 'activo', objective: 'Preparar aviso de cancelación parcial a 150 invitados' })
        s.scriptId = 'main'
        s.scriptCursor = 6
        s.nextScriptAt = s.clock.simSeconds + 5
        return
      }
      rejectSpend(s)
      return
    case 'reject_split':
      goToNorte(s, 'Responsable: «No aceptamos dividir la hospitalidad. Buscad ubicación para los 600 y presentad retraso y coste»')
      return
    case 'pause':
      s.agentsPaused = true
      s.coordinatorStatus = 'pausado'
      for (const a of s.agents) a.status = 'pausado'
      pushEvent(s, 'intervencion', 'Responsable pausa nuevas acciones de los agentes')
      return
    case 'resume':
      s.agentsPaused = false
      s.coordinatorStatus = s.waitingForDecision ? 'esperando_decision' : 'replanificando'
      for (const a of s.agents) a.status = 'activo'
      pushEvent(s, 'intervencion', 'Responsable reanuda a los agentes')
      return
    case 'set_constraint':
      if (text) {
        s.constraints.push(text)
        pushEvent(s, 'intervencion', `Restricción fijada: «${text}»`)
        s.coordinatorStatus = s.waitingForDecision ? 'esperando_decision' : 'replanificando'
      }
      return
    case 'take_call': {
      const c = s.calls.find((x) => x.status === 'en_curso')
      if (c) {
        c.transcript.push({ who: 'humano', text: `[Responsable de operaciones toma la conversación con ${c.counterpart}]`, at: s.clock.simSeconds - c.startedAt + 1 })
        c.endsAfter += 30
        pushEvent(s, 'intervencion', `Responsable se hace cargo de la conversación con ${c.counterpart}`)
      } else pushEvent(s, 'intervencion', 'No hay conversación en curso')
      return
    }
  }
}

