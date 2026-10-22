const DAY_MS = 24 * 60 * 60 * 1000

function utcParts(iso: string): { y: number; m: number; d: number } | null {
  const date = /^\d{4}-\d{2}-\d{2}$/.test(iso) ? new Date(`${iso}T00:00:00.000Z`) : new Date(iso)
  if (Number.isNaN(date.getTime())) return null
  return {
    y: date.getUTCFullYear(),
    m: date.getUTCMonth() + 1,
    d: date.getUTCDate(),
  }
}

function pad2(n: number): string {
  return String(n).padStart(2, '0')
}

export function formatDateOnly(iso: string | null | undefined): string {
  if (!iso) return '—'
  const p = utcParts(iso)
  if (!p) return '—'
  return `${pad2(p.d)}/${pad2(p.m)}/${p.y}`
}

export function formatDateTime(iso: string | null | undefined): string {
  if (!iso) return '—'
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return '—'
  return date.toLocaleString('es-AR')
}

export function localToday(): string {
  const d = new Date()
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`
}

export function ageText(birthDate: string | null | undefined, today: string): string | null {
  if (!birthDate) return null
  const from = utcParts(birthDate)
  const to = utcParts(today)
  if (!from || !to) return null
  const days = Math.round(
    (Date.UTC(to.y, to.m - 1, to.d) - Date.UTC(from.y, from.m - 1, from.d)) / DAY_MS,
  )
  if (days < 0) return null
  if (days < 30) return `${days} ${days === 1 ? 'día' : 'días'}`

  let years = to.y - from.y
  let months = to.m - from.m
  if (to.d < from.d) months -= 1
  if (months < 0) {
    years -= 1
    months += 12
  }
  const totalMonths = years * 12 + months
  if (totalMonths < 12) return `${totalMonths} ${totalMonths === 1 ? 'mes' : 'meses'}`
  const yearLabel = `${years} ${years === 1 ? 'año' : 'años'}`
  if (months === 0) return yearLabel
  return `${yearLabel} ${months} ${months === 1 ? 'mes' : 'meses'}`
}

export function formatLiters(n: number): string {
  return n.toLocaleString('es-AR', { maximumFractionDigits: 1, minimumFractionDigits: 0 })
}

export function formatEid(eid: string | null | undefined): string | null {
  if (!eid) return null
  const digits = eid.replace(/[\s\-_]/g, '')
  if (/^\d{15}$/.test(digits)) return `${digits.slice(0, 3)} ${digits.slice(3)}`
  return eid
}

export function naturalCompare(a: string, b: string): number {
  return a.localeCompare(b, 'es', { numeric: true, sensitivity: 'base' })
}

export function eidDigits(eid: string | null | undefined): string {
  return (eid ?? '').replace(/[\s\-_]/g, '')
}

function startOfLocalDay(d: Date): number {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime()
}

export function timeAgo(iso: string, now: Date = new Date()): string {
  const then = new Date(iso)
  if (Number.isNaN(then.getTime())) return '—'
  const diffMs = now.getTime() - then.getTime()
  const diffSec = Math.max(0, Math.round(diffMs / 1000))
  if (diffSec < 60) return 'hace un momento'
  const diffMin = Math.round(diffSec / 60)
  if (diffMin < 60) return `hace ${diffMin} min`
  const today = startOfLocalDay(now)
  const thatDay = startOfLocalDay(then)
  const dayDiff = Math.round((today - thatDay) / DAY_MS)
  if (dayDiff === 0) {
    const hours = Math.max(1, Math.round(diffSec / 3600))
    return `hace ${hours} h`
  }
  if (dayDiff === 1) return 'ayer'
  return `${pad2(then.getDate())}/${pad2(then.getMonth() + 1)}`
}
