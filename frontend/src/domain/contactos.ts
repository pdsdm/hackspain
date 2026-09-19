import type { Area } from './types'

export interface Contacto {
  id: string
  nombre: string
  organizacion: string
  area: Area
  objetivo: string
}

export const CONTACTOS: Contacto[] = [
  { id: 'recinto', nombre: 'Responsable de recinto', organizacion: 'MADRING', area: 'espacios', objetivo: 'Confirmar Pabellón B y Lounge Fan Zone Sur para las 13:00' },
  { id: 'catering', nombre: 'Sabor Ibérico', organizacion: 'Catering', area: 'catering', objetivo: 'Redirigir las dos entregas fuera del Muelle Sur' },
  { id: 'transporte', nombre: 'Transportes Ibéricos', organizacion: 'Transporte', area: 'transporte', objetivo: 'Confirmar punto de llegada de los 4 shuttles' },
  { id: 'recepcion', nombre: 'Recepción', organizacion: 'MADRING', area: 'asistentes', objetivo: 'Asistencia de accesibilidad en el Acceso Sur' },
]
