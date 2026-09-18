import { Pause, Play, Users, CloudSun, Radio, RotateCcw } from 'lucide-react'
import type { CrisisController } from '../../data/useCrisisState'
import { fmtClock, fmtCountdown } from '../../domain/time'

const SPEEDS = [1, 5, 20]

export function TopBar({ ctl }: { ctl: CrisisController }) {
  const { state: s } = ctl
  const left = s.clock.openingAt - s.clock.simSeconds
  const late = left < 0
  const total = s.guestGroups.reduce((a, g) => a + g.count, 0)
  return (
    <header className="flex items-center gap-4 px-4 h-14 border-b border-line bg-panel/60">
      <div className="flex items-center gap-3">
        <span className="text-2xl font-extrabold tracking-tight">MADRING</span>
        <span className="w-px h-6 bg-line" />
        <span className="text-[15px] text-text/90">Centro de operaciones · Hospitalidad domingo GP</span>
        {s.simulated && (
          <span className="ml-1 px-2 py-0.5 rounded border border-red/60 text-red text-[11px] font-semibold tracking-wider">SIMULACIÓN</span>
        )}
      </div>

      <div className="flex-1" />

      <div className="flex items-center gap-2">
        <span className="text-muted">{late ? 'Apertura retrasada' : 'Apertura en'}</span>
        <span className={`text-[26px] font-bold num leading-none ${late ? 'text-red' : left < 15 * 60 ? 'text-amber' : 'text-text'}`}>{fmtCountdown(left)}</span>
        <span className="text-[11px] text-muted ml-1">→ {fmtClock(s.clock.openingAt)}</span>
      </div>

      <span className="w-px h-6 bg-line" />

      <div className="flex items-center gap-2 text-muted">
        <Users size={16} className="text-cyan" />
        <span className="text-text font-medium num">{total.toLocaleString('es-ES')}</span> invitados
      </div>

      <span className="w-px h-6 bg-line" />

      <div className="flex items-center gap-2">
        <div className="text-right leading-tight">
          <div className="text-[11px] text-muted">Dom 14 sep · hora simulada</div>
          <div className="font-semibold num text-[15px]">{fmtClock(s.clock.simSeconds, true)}</div>
        </div>
        {s.simulated && (
          <div className="flex items-center gap-1 ml-1">
            <button onClick={ctl.togglePause} className="w-7 h-7 grid place-items-center rounded-md border border-line hover:border-cyan/60 text-muted hover:text-cyan" title={s.clock.paused ? 'Reanudar reloj' : 'Pausar reloj'}>
              {s.clock.paused ? <Play size={13} /> : <Pause size={13} />}
            </button>
            {SPEEDS.map((sp) => (
              <button key={sp} onClick={() => ctl.setSpeed(sp)} className={`h-7 px-2 rounded-md border text-[11px] num ${s.clock.speed === sp && !s.clock.paused ? 'border-cyan/60 text-cyan bg-cyan/10' : 'border-line text-muted hover:text-text'}`}>
                {sp}×
              </button>
            ))}
            <button onClick={ctl.reset} className="w-7 h-7 grid place-items-center rounded-md border border-line hover:border-amber/60 text-muted hover:text-amber" title="Reiniciar simulación">
              <RotateCcw size={13} />
            </button>
          </div>
        )}
      </div>

      <span className="w-px h-6 bg-line" />

      <div className="flex items-center gap-2 text-muted">
        <CloudSun size={16} className="text-amber" />
        <span className="text-text num">24 °C</span>
      </div>

      {ctl.source === 'api' && (
        <span className={`flex items-center gap-1 text-[11px] ${ctl.error ? 'text-red' : 'text-green'}`}>
          <Radio size={12} /> {ctl.error ? 'Backend sin respuesta' : 'Backend conectado'}
        </span>
      )}
    </header>
  )
}
