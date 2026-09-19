import { useState } from 'react'
import { PhoneOutgoing } from 'lucide-react'
import type { CrisisState } from '../../domain/types'
import { CONTACTOS, type Contacto } from '../../domain/contactos'
import { fmtClock } from '../../domain/time'
import { Dialog } from '../ui/Dialog'

type Resultado = { ok: boolean; texto: string }

export function AvisarPanel({ s }: { s: CrisisState }) {
  const [abierto, setAbierto] = useState(false)
  const [llamando, setLlamando] = useState<string | null>(null)
  const [resultado, setResultado] = useState<Record<string, Resultado>>({})

  // POST al hook del workflow. El teléfono y la API key los pone el servidor
  // desde el .env de la raíz (ver agent/happyrobot/SPEC.md).
  const llamar = async (c: Contacto) => {
    setLlamando(c.id)
    try {
      const res = await fetch('/api/happyrobot/call', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contacto: c.id,
          area: c.area,
          contraparte: `${c.nombre} - ${c.organizacion}`,
          objetivo: c.objetivo,
          incidencia: s.spaces.find((x) => x.status === 'cerrado')?.note ?? 'Pabellón Principal cerrado por avería de agua',
          hora_apertura: fmtClock(s.clock.openingAt),
          task_id: `t-${c.area}-${Math.floor(s.clock.simSeconds)}`,
        }),
      })
      const data = (await res.json()) as { error?: string; destino?: string; runId?: string }
      setResultado((r) => ({
        ...r,
        [c.id]: res.ok
          ? { ok: true, texto: `Llamando a ${data.destino ?? 'el número configurado'}${data.runId ? ` · run ${data.runId.slice(0, 8)}` : ''}` }
          : { ok: false, texto: data.error ?? `HTTP ${res.status}` },
      }))
    } catch (e) {
      setResultado((r) => ({ ...r, [c.id]: { ok: false, texto: e instanceof Error ? e.message : 'No se pudo lanzar la llamada' } }))
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
          <p className="text-[12px] text-muted mb-3">Lanza una llamada real por HappyRobot al número de pruebas. El agente llama con el guion del área correspondiente.</p>
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
                      <PhoneOutgoing size={14} /> {llamando === c.id ? 'Llamando…' : 'Llamar'}
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
