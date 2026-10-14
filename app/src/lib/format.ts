const eurFmt = new Intl.NumberFormat('en-GB', { maximumFractionDigits: 0 })

export function eur(value: number): string {
  return `€${eurFmt.format(Math.round(value))}`
}

const dayFmt = new Intl.DateTimeFormat('en-GB', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' })
const shortFmt = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' })

export function parseDate(iso: string): Date {
  return new Date(`${iso.slice(0, 10)}T00:00:00Z`)
}

export function dayLabel(iso: string): string {
  return dayFmt.format(parseDate(iso))
}

export function shortDate(iso: string): string {
  return shortFmt.format(parseDate(iso))
}

export function dateRange(start: string, end: string): string {
  return `${dayLabel(start)} – ${dayLabel(end)}`
}

export function daysBetween(a: string, b: string): number {
  return Math.round((parseDate(b).getTime() - parseDate(a).getTime()) / 86_400_000)
}

export function duration(minutes: number | null | undefined): string {
  if (!minutes) return '–'
  const h = Math.floor(minutes / 60)
  const m = Math.round(minutes % 60)
  if (!h) return `${m}m`
  return m ? `${h}h ${String(m).padStart(2, '0')}m` : `${h}h`
}

export function plural(n: number, one: string, many = `${one}s`): string {
  return `${n} ${n === 1 ? one : many}`
}

export function daysAgo(iso: string, today = new Date()): number {
  const t = Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate())
  return Math.max(0, Math.round((t - parseDate(iso).getTime()) / 86_400_000))
}
