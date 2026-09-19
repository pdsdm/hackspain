import { Pause, Play, RotateCcw, Radio } from 'lucide-react'
import type { CrisisController } from '../../data/useCrisisState'
import { fmtClock, fmtCountdown } from '../../domain/time'

const SPEEDS = [1, 5, 20]

export function TopBar({ ctl, onIntervenir }: { ctl: CrisisController; onIntervenir: () => void }) {
  const { state: s } = ctl
  const left = s.clock.openingAt - s.clock.simSeconds
  const late = left < 0
  return (
    <header className="flex items-center gap-5 px-6 h-16 border-b border-line bg-bg flex-none">
      <img src="/brand/zhivel-logo-dark.png" alt="Zhivel" className="h-9 w-auto" />
      <span className="w-px h-6 bg-line-2" />
      <div className="flex flex-col gap-px">
        <span className="display font-bold text-[14px] uppercase tracking-[0.02em]">Centro de operaciones</span>
        <span className="text-[12px] text-muted">MADRING · Hospitalidad · Domingo de Gran Premio</span>
      </div>
      {s.simulated && (
        <span className="ml-1 px-2 py-[3px] border border-line-2 text-muted display font-semibold text-[10px] tracking-[0.14em] uppercase">Simulación</span>
      )}
      {ctl.source === 'api' && (
        <span className={`flex items-center gap-1 text-[11px] ${ctl.stale ? 'text-red' : 'text-green'}`}>
          <Radio size={12} /> {ctl.stale ? 'Datos sin actualizar' : 'Backend conectado'}
        </span>
      )}

      <div className="flex-1" />

      <div className="flex items-baseline gap-2.5">
        <span className="text-[12px] text-muted uppercase tracking-[0.08em]">{late ? 'Apertura retrasada' : 'Apertura en'}</span>
        <span className={`display font-extrabold text-[34px] leading-none tracking-[-0.02em] num ${late ? 'text-red' : left < 15 * 60 ? 'text-amber' : 'text-ink'}`}>{fmtCountdown(left)}</span>
        <span className="text-[12px] text-muted">→ {fmtClock(s.clock.openingAt)}</span>
      </div>

      {(s.simulated || ctl.source === 'api') && (
        <>
          <span className="w-px h-6 bg-line-2" />
          <div className="flex items-center gap-1">
            {s.simulated && (
              <>
            <button onClick={ctl.togglePause} className="w-9 h-9 grid place-items-center border border-line-2 text-ink hover:bg-ink/5" title={s.clock.paused ? 'Reanudar reloj' : 'Pausar reloj'} aria-label={s.clock.paused ? 'Reanudar reloj' : 'Pausar reloj'}>
              {s.clock.paused ? <Play size={14} /> : <Pause size={14} />}
            </button>
            {SPEEDS.map((sp) => {
              const on = s.clock.speed === sp && !s.clock.paused
              return (
                <button key={sp} onClick={() => ctl.setSpeed(sp)} className={`h-9 px-3 border display font-bold text-[12px] num ${on ? 'bg-ink border-ink text-bg' : 'border-line-2 text-muted hover:text-ink'}`}>
                  ×{sp}
                </button>
              )
            })}
              </>
            )}
            <button onClick={ctl.reset} className="w-9 h-9 grid place-items-center border border-line-2 text-muted hover:text-ink hover:bg-ink/5" title="Reiniciar simulación" aria-label="Reiniciar simulación">
              <RotateCcw size={14} />
            </button>
          </div>
        </>
      )}

      <button disabled={ctl.pending || ctl.stale} onClick={onIntervenir} className="chamfer h-10 px-6 bg-ink text-bg display font-extrabold text-[13px] tracking-[0.06em] uppercase hover:bg-ink/90">Intervenir</button>
    </header>
  )
}
