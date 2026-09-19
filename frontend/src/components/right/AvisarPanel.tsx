import { useState } from 'react'
import { PhoneOutgoing } from 'lucide-react'
import { api } from '../../data/apiClient'
import { CONTACTOS, type Contacto } from '../../domain/contactos'
import { Dialog } from '../ui/Dialog'

type Resultado = { ok: boolean; texto: string }

export function AvisarPanel({ disabled }: { disabled: boolean }) {
  const [abierto, setAbierto] = useState(false)
  const [llamando, setLlamando] = useState<string | null>(null)
  const [resultado, setResultado] = useState<Record<string, Resultado>>({})

  const llamar = async (contacto: Contacto) => {
    setLlamando(contacto.id)
    try {
      const response = await api.requestCall({
        area: contacto.area,
        counterpart: `${contacto.nombre} - ${contacto.organizacion}`,
        objective: contacto.objetivo,
      })
      setResultado((current) => ({
        ...current,
        [contacto.id]: { ok: true, texto: `Aviso registrado · evento ${response.eventId.slice(0, 8)}` },
      }))
    } catch (error) {
      setResultado((current) => ({
        ...current,
        [contacto.id]: { ok: false, texto: error instanceof Error ? error.message : 'No se pudo registrar el aviso' },
      }))
    } finally {
      setLlamando(null)
    }
  }

  return <>
    <button className="small-button justify-center" disabled={disabled} onClick={() => setAbierto(true)}>
      <PhoneOutgoing size={15} /> Avisar a…
    </button>
    {abierto && <Dialog title="Avisar a…" onClose={() => setAbierto(false)}>
      <p className="text-[12px] text-muted mb-3">El backend lanza la llamada por HappyRobot. El resultado aparece en la cronología y en la tarjeta de llamada.</p>
      <ul className="space-y-2">
        {CONTACTOS.map((contacto) => {
          const result = resultado[contacto.id]
          return <li key={contacto.id} className="border border-line p-3">
            <div className="flex items-start gap-3">
              <div className="min-w-0 flex-1">
                <div className="font-semibold text-[13px]">{contacto.nombre}</div>
                <div className="text-[12px] text-muted">{contacto.organizacion} · {contacto.area}</div>
                <div className="text-[12px] mt-1">{contacto.objetivo}</div>
              </div>
              <button className="small-button" disabled={disabled || llamando !== null} onClick={() => void llamar(contacto)}>
                <PhoneOutgoing size={14} /> {llamando === contacto.id ? 'Avisando…' : 'Avisar'}
              </button>
            </div>
            {result && <p role="status" className={`text-[12px] mt-2 ${result.ok ? 'text-green' : 'text-red'}`}>{result.texto}</p>}
          </li>
        })}
      </ul>
    </Dialog>}
  </>
}
