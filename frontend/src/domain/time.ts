export const hm = (h: number, m: number, s = 0) => h * 3600 + m * 60 + s

export function fmtClock(sec: number, withSeconds = false) {
  const s = Math.max(0, Math.floor(sec))
  const h = Math.floor(s / 3600) % 24
  const m = Math.floor((s % 3600) / 60)
  const ss = s % 60
  const p = (n: number) => String(n).padStart(2, '0')
  return withSeconds ? `${p(h)}:${p(m)}:${p(ss)}` : `${p(h)}:${p(m)}`
}

export function fmtCountdown(sec: number) {
  const neg = sec < 0
  const s = Math.abs(Math.floor(sec))
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  const ss = s % 60
  const p = (n: number) => String(n).padStart(2, '0')
  return `${neg ? '-' : ''}${p(h)}:${p(m)}:${p(ss)}`
}

export const fmtEur = (n: number | null) => n === null ? 'Sin estimar' : `${n.toLocaleString('es-ES')} €`

/** Duración de una llamada en MM:SS. Sigue contando pasada la hora en vez de romperse. */
export function fmtElapsed(sec: number) {
  const s = Math.max(0, Math.floor(sec))
  const m = Math.floor(s / 60)
  const ss = s % 60
  return `${String(m).padStart(2, '0')}:${String(ss).padStart(2, '0')}`
}

/** Hora de pared local a partir de un epoch ms. Para la cronología, que registra el ahora. */
export function fmtRealClock(ms: number) {
  const d = new Date(ms)
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}
