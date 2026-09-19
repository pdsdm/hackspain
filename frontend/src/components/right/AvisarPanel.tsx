import { useState } from 'react'
import { PhoneOutgoing } from 'lucide-react'
import { CONTACTOS, type Contacto } from '../../domain/contactos'
import { api } from '../../data/apiClient'
import { Dialog } from '../ui/Dialog'

type Resultado = { ok: boolean; texto: string }

export function AvisarPanel() {
  const [abierto, setAbierto] = useState(false)
  const [llamando, setLlamando] = useState<string | null>(null)
  const [resultado, setResultado] = useState<Record<string, Resultado>>({})

  // El panel no habla con HappyRobot: manda un evento y el backend despacha la
  // llamada al hook del área (ver agent/happyrobot/SPEC.md).
  const llamar = async (c: Contacto) => {
    setLlamando(c.id)
    try {
      const res = await api.requestCall({
        area: c.area,
        counterpart: `${c.nombre} - ${c.organizacion}`,
        objective: c.objetivo,
      })
      setResultado((r) => ({ ...r, [c.id]: { ok: true, texto: `Aviso registrado · evento ${res.eventId.slice(0, 8)}` } }))
    } catch (e) {
      setResultado((r) => ({ ...r, [c.id]: { ok: false, texto: e instanceof Error ? e.message : 'No se pudo registrar el aviso' } }))
    } finally {
      setLlamando(null)
    }
  }

  return (
    <>
      <button className="small-button justify-center" onClick={() => setAbierto(true)}>
        <PhoneOutgoing size={15} /> Avisar a…
      </button>

      {abierto && (
        <Dialog title="Avisar a…" onClose={() => setAbierto(false)}>
          <p className="text-[12px] text-muted mb-3">El backend lanza la llamada por HappyRobot con el guion del área. El resultado aparece en la cronología y en la tarjeta de llamada.</p>
          <ul className="space-y-2">
            {CONTACTOS.map((c) => {
              const r = resultado[c.id]
              return (
                <li key={c.id} className="border border-line p-3">
                  <div className="flex items-start gap-3">
                    <div className="min-w-0 flex-1">
                      <div className="font-semibold text-[13px]">{c.nombre}</div>
                      <div className="text-[12px] text-muted">{c.organizacion} · {c.area}</div>
                      <div className="text-[12px] mt-1">{c.objetivo}</div>
                    </div>
                    <button className="small-button" disabled={llamando === c.id} onClick={() => void llamar(c)}>
                      <PhoneOutgoing size={14} /> {llamando === c.id ? 'Avisando…' : 'Avisar'}
                    </button>
                  </div>
                  {r && <p role="status" className={`text-[12px] mt-2 ${r.ok ? 'text-green' : 'text-red'}`}>{r.texto}</p>}
                </li>
              )
            })}
          </ul>
        </Dialog>
      )}
    </>
  )
}
