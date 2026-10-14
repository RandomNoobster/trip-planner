import type { Climate, ClimatePeriod, Place, Places } from '../data/schema'
import { parseDate, shortDate } from './format'

/** The half month a date falls in: 0 is 1–15 Jan, 1 is 16–31 Jan … 23 is 16–31 Dec. */
export function periodIndex(iso: string): number {
  const month = Number(iso.slice(5, 7))
  const day = Number(iso.slice(8, 10))
  return (month - 1) * 2 + (day <= 15 ? 0 : 1)
}

const MEANS = ['highC', 'lowC', 'highP10', 'highP90', 'precipMm', 'sunH', 'daylightH', 'windKmh'] as const
const SHARES = ['wetShare', 'snowShare', 'frostShare'] as const

/**
 * Typical weather from `start` to `end` (both included): the half-month averages, weighted by how many of the days fall
 * in each half month. Null when no half month in the range has data.
 */
export function climateBetween(periods: (ClimatePeriod | null)[], start: string, end: string): ClimatePeriod | null {
  const weights = new Map<number, number>()
  const last = parseDate(end).getTime()
  for (let t = parseDate(start).getTime(); t <= last; t += 86_400_000) {
    const i = periodIndex(new Date(t).toISOString())
    weights.set(i, (weights.get(i) ?? 0) + 1)
  }
  const sum = new Map<string, { v: number; w: number }>()
  let days = 0
  for (const [i, w] of weights) {
    const p = periods[i]
    if (!p) continue
    days += (p.days ?? 0) * (w / 15)
    for (const k of [...MEANS, ...SHARES]) {
      const v = p[k]
      if (v == null) continue
      const cur = sum.get(k) ?? { v: 0, w: 0 }
      sum.set(k, { v: cur.v + v * w, w: cur.w + w })
    }
  }
  const avg = (k: string, digits: number) => {
    const s = sum.get(k)
    return s && s.w ? Math.round((s.v / s.w) * 10 ** digits) / 10 ** digits : null
  }
  const highC = avg('highC', 1)
  const lowC = avg('lowC', 1)
  if (highC == null || lowC == null) return null
  return {
    highC,
    lowC,
    highP10: avg('highP10', 1),
    highP90: avg('highP90', 1),
    wetShare: avg('wetShare', 2) ?? 0,
    precipMm: avg('precipMm', 1),
    snowShare: avg('snowShare', 2) ?? 0,
    frostShare: avg('frostShare', 2) ?? 0,
    sunH: avg('sunH', 1),
    daylightH: avg('daylightH', 1),
    windKmh: avg('windKmh', 0),
    days: Math.round(days),
  }
}

function addDays(iso: string, n: number): string {
  return new Date(parseDate(iso).getTime() + n * 86_400_000).toISOString().slice(0, 10)
}

function span(years: number[] | null | undefined): string | null {
  if (!years?.length) return null
  const lo = Math.min(...years)
  const hi = Math.max(...years)
  return lo === hi ? String(lo) : `${lo}–${hi}`
}

/** Typical weather in a place over a travel window and its flexible days, in the shape the weather views use. */
export function placeClimate(place: Place, places: Places, window: { start: string; end: string; flexDays?: number }): Climate | null {
  const c = place.climate
  if (!c) return null
  const flex = window.flexDays ?? 0
  const start = addDays(window.start, -flex)
  const end = addDays(window.end, flex)
  const avg = climateBetween(c.periods, start, end)
  if (!avg) return null
  const december = start.slice(5, 7) === '12' || end.slice(5, 7) === '12'
  const years = span(december ? (c.decemberYears ?? c.years) : c.years)
  return {
    ...avg,
    link: c.link ?? null,
    period: `${shortDate(start)} – ${shortDate(end)}${years ? `, ${years}` : ''}`,
    source: places.climate?.source ?? null,
    sourceUrl: places.climate?.sourceUrl ?? null,
  }
}
