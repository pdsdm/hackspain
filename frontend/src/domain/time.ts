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

export const fmtEur = (n: number) => `${n.toLocaleString('es-ES')} €`
