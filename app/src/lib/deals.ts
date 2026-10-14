import type { Discount } from '../data/schema'
import type { EvalTrip } from './trips'

const NEGATIVE_VERDICT = /^(no\b|none|nothing|unknown|unlikely|probably not|low\b|marginal)/i

export function verdictOf(d: Discount): string {
  return (d.worthItForThisTrip || d.relevantForTRD || '').trim()
}

/** Real, claimable at the travelers' age, and judged worth it by the research. */
export function isUseful(d: Discount): boolean {
  return d.available === true && d.eligibleAt23 !== false && !NEGATIVE_VERDICT.test(verdictOf(d))
}

/** A useful deal that touches this trip's airlines, stays or countries. Passes, cards and agencies stay on the deals page. */
export function dealApplies(d: Discount, e: EvalTrip): boolean {
  if (!isUseful(d)) return false
  const kind = d.kind.toLowerCase()
  if (kind === 'airline') {
    const name = d.provider.toLowerCase()
    return e.legs.some((l) => (l.leg.operator ?? '').toLowerCase().includes(name))
  }
  if (kind === 'accommodation') return e.stops.some((st) => st.chosen.stay.roomType === 'hostel_private')
  if (kind === 'attractions' || kind === 'rail' || kind === 'bus') {
    const cc = (d.country ?? '').toUpperCase()
    return e.stops.some((st) => (st.dest.cc ?? '').toUpperCase() === cc)
  }
  return false
}
