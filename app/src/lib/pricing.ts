import type { Leg, LegTransfer, Stay } from '../data/schema'

export type Rooms = 'share' | 'own'
export type TransferPref = 'cheapest' | 'public' | 'taxi'
/** Luggage each traveler brings on every leg. A personal item is always included. */
export type Bags = { cabin: boolean; checked: boolean }

export type CostOptions = { n: number; bags: Bags; transfer: TransferPref; rooms?: Rooms }

export type BagCharge = { eur: number; estimate: boolean; basis: string | null; included: boolean }

/** What it costs one traveler to bring the chosen bags on this leg (0 when the fare or mode includes them). */
export function bagCharge(leg: Leg, bags: Bags): BagCharge {
  if (!bags.cabin && !bags.checked) return { eur: 0, estimate: false, basis: null, included: true }
  const b = leg.bags
  if (!b) return { eur: 0, estimate: true, basis: 'no bag data for this leg', included: false }
  if (bags.cabin && bags.checked) {
    const included = b.cabin.included && b.checked.included
    return { eur: b.both.addEUR ?? 0, estimate: b.both.estimate, basis: b.both.basis ?? null, included }
  }
  const one = bags.cabin ? b.cabin : b.checked
  return { eur: one.addEUR ?? 0, estimate: one.estimate, basis: one.basis ?? null, included: one.included }
}

export type TransferChoice = { transfer: LegTransfer; eur: number; min: number; how: 'public' | 'taxi' | null; note: string }

/** Per-person cost of one airport or station transfer for a party of n, by preference. Taxis are shared per car. */
export function transferChoice(t: LegTransfer, n: number, pref: TransferPref): TransferChoice {
  const pub = t.public ?? null
  const taxi = t.taxi ?? null
  const taxiPP = taxi ? (Math.ceil(n / Math.max(1, taxi.capacity)) * taxi.eurPerCar) / n : null
  const usePublic = pub && (pref === 'public' || !taxi || (pref === 'cheapest' && pub.eur <= (taxiPP ?? Infinity)))
  if (usePublic && pub) {
    return { transfer: t, eur: pub.eur, min: pub.min ?? 0, how: 'public', note: `${pub.mode ?? 'public transport'}${pub.min ? `, ${pub.min} min` : ''}` }
  }
  if (taxi && taxiPP != null) {
    const cars = Math.ceil(n / Math.max(1, taxi.capacity))
    return { transfer: t, eur: taxiPP, min: taxi.min ?? 0, how: 'taxi', note: `taxi or ride-hailing, ${cars === 1 ? '1 car' : `${cars} cars`}${taxi.min ? `, ${taxi.min} min` : ''}` }
  }
  return { transfer: t, eur: 0, min: 0, how: null, note: 'no price found' }
}

/** The transfers a leg implies, priced. Older research sets only had one airport figure per end. */
export function legTransfers(leg: Leg, n: number, pref: TransferPref): TransferChoice[] {
  if (leg.transfers.length) return leg.transfers.map((t) => transferChoice(t, n, pref))
  const legacy: LegTransfer[] = []
  for (const [where, t] of [
    [leg.fromCity, leg.departureTransfer],
    [leg.toCity, leg.arrivalTransfer],
  ] as const) {
    if (t && t.eur) legacy.push({ where, kind: 'airport', place: null, public: { eur: t.eur, min: t.min, mode: t.mode ?? null, to: null, hours: null }, taxi: null })
  }
  return legacy.map((t) => transferChoice(t, n, pref))
}

export type LegPrice = {
  fare: number
  /** how the fare was split, for a cabin ("1 cabin for up to 4") */
  fareNote: string | null
  bags: BagCharge
  transfers: TransferChoice[]
  transferEUR: number
  total: number
  minutes: number
}

/** One traveler's fare. A ferry cabin is shared within the party (never with strangers), or one each with own rooms. */
export function legFare(leg: Leg, n: number, rooms: Rooms = 'share'): { eur: number; note: string | null } {
  const c = leg.cabin
  if (!c) return { eur: leg.priceEUR, note: null }
  const units = rooms === 'own' ? n : Math.ceil(n / Math.max(1, c.berths))
  const what = units === 1 ? '1 cabin' : `${units} cabins`
  return { eur: (units * c.eur) / n + c.perPersonEUR, note: rooms === 'own' ? `${what}, one each` : `${what} for up to ${c.berths}` }
}

/** Everything one traveler pays to make this leg with the chosen bags, door to door. */
export function priceLeg(leg: Leg, o: CostOptions): LegPrice {
  const fare = legFare(leg, o.n, o.rooms)
  const bags = bagCharge(leg, o.bags)
  const transfers = legTransfers(leg, o.n, o.transfer)
  const transferEUR = transfers.reduce((a, t) => a + t.eur, 0)
  return {
    fare: fare.eur,
    fareNote: fare.note,
    bags,
    transfers,
    transferEUR,
    total: fare.eur + bags.eur + transferEUR,
    minutes: (leg.durationMin ?? 0) + transfers.reduce((a, t) => a + t.min, 0),
  }
}

export type StayPrice = {
  /** per person per night */
  pp: number
  /** rooms or places booked */
  units: number
  note: string
}

/**
 * What one night costs each traveler for a party of n.
 * share: the group fills rooms or places up to their capacity.
 * own: everyone sleeps in their own room (a bedroom of a whole place, or a separate room).
 */
export function stayNightPP(stay: Stay, n: number, rooms: Rooms): StayPrice {
  const unit = stay.unitNightlyEUR
  const cap = Math.max(1, stay.sleeps)
  if (stay.roomType === 'entire_home') {
    if (rooms === 'own') {
      const perPlace = Math.max(1, stay.bedrooms ?? 1)
      const units = Math.ceil(n / perPlace)
      return { pp: (units * unit) / n, units, note: `${units === 1 ? 'Whole place' : `${units} whole places`}, ${perPlace} bedroom${perPlace === 1 ? '' : 's'} each, own room each` }
    }
    const units = Math.ceil(n / cap)
    return { pp: (units * unit) / n, units, note: `${units === 1 ? 'Whole place' : `${units} whole places`} for up to ${cap}` }
  }
  if (rooms === 'own') {
    // a private room per person; per-person hostel prices assume a shared private room, so one each costs the full room price
    return { pp: unit, units: n, note: `${n} private rooms, one each` }
  }
  const units = Math.ceil(n / cap)
  return { pp: (units * unit) / n, units, note: `${units === 1 ? '1 private room' : `${units} private rooms`} for ${cap}` }
}

/** Bayesian average: the rating pulled toward the prior mean until it has enough reviews to stand on its own. */
export function adjustedRating(rating5: number | null | undefined, reviews: number, prior: { reviews: number; mean: number }): number {
  if (rating5 == null) return prior.mean
  return (reviews * rating5 + prior.reviews * prior.mean) / (reviews + prior.reviews)
}

export function confidence(reviews: number): 'high' | 'medium' | 'low' {
  return reviews >= 200 ? 'high' : reviews >= 50 ? 'medium' : 'low'
}
