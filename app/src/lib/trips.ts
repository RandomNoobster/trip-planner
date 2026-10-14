import type { Model } from '../data/model'
import type { Activity, Destination, Home, Leg, Stay, Stop, Trip } from '../data/schema'
import { legPasses, PAPER_LABEL, stayPasses, type Filters } from './filters'
import { shortDate } from './format'
import { labels, modeOf, operatorName } from './labels'
import { dailySpend, REFERENCE_PLAN, type EatPlan } from './prices'
import { adjustedRating, confidence, priceLeg, stayNightPP, type Bags, type LegPrice, type Rooms, type TransferPref } from './pricing'

export type SortKey = 'price' | 'rating' | 'time'

export type Settings = {
  n: number
  rooms: Rooms
  sort: SortKey
  youth: boolean
  /** luggage on every leg; a personal item is always included */
  bags: Bags
  transfer: TransferPref
  /** food and drink added to the price per day in each city ('off': shown as an estimate, not added) */
  eat: EatPlan
  /** travellers flying home somewhere other than the origin, per home id; the rest fly back to the origin */
  home: Record<string, number>
  f: Filters
}

export type HeadsUpKind = 'long' | 'entry' | 'estimate' | 'youth' | 'reviews' | 'date' | 'range' | 'bags' | 'transfer'
export type HeadsUp = { kind: HeadsUpKind; text: string }

export type EvalLeg = {
  leg: Leg
  index: number
  travelDate: string | null
  /** fare + bags + airport or station transfers, per person */
  costPP: number
  minutes: number
  price: LegPrice
  /** other airlines or modes for the same route and dates, cheapest first */
  alternatives: Leg[]
}

export type StayOption = {
  stay: Stay
  nightPP: number
  units: number
  note: string
  adjusted: number
  confidence: 'high' | 'medium' | 'low'
}

export type EvalStop = {
  stop: Stop
  dest: Destination
  chosen: StayOption
  options: StayOption[]
  totalPP: number
  /** dated events in this city that overlap the nights spent there */
  events: Activity[]
}

/** One home's share of the group: who flies there, their legs and what the trip costs each of them. */
export type HomeEval = {
  home: Home
  count: number
  /** the whole journey for these travellers: the trip's legs, with the flight back replaced for a home other than the origin */
  legs: EvalLeg[]
  /** the legs that differ from the trip's own (the flights home); empty for the origin */
  own: EvalLeg[]
  transportPP: number
  totalPP: number
  transitMin: number
}

export type EvalTrip = {
  trip: Trip
  key: string
  title: string
  cities: string[]
  isMulti: boolean
  legs: EvalLeg[]
  stops: EvalStop[]
  /** fares + bags + transfers, per person */
  transportPP: number
  faresPP: number
  bagsPP: number
  transfersPP: number
  staysPP: number
  /** food and drink in the price, per person (0 when not counted) */
  foodPP: number
  /** food and drink under the chosen plan, or the reference plan when not counted; null when a city lacks prices */
  foodEstPP: number | null
  /** paid entry permits (such as the UK ETA) for the trip's countries, each country once, per person */
  entryPP: number
  /** what the entry permits are, for the price split */
  entryNames: string[]
  /** per person: the group's average when travellers fly home to different places */
  totalPP: number
  groupTotal: number
  /** the homes in use, in the set's order (the origin first) */
  homes: HomeEval[]
  /** the home most travellers fly to; `legs` above are its legs */
  mainHome: HomeEval
  /** travellers fly home to more than one place */
  split: boolean
  transitMin: number
  weakestAdjusted: number
  headsUp: HeadsUp[]
  included: string[]
  missing: string[]
  youthFare: boolean
}

/** Choices the trip page lets the viewer make: a different flight for leg i, a different stay for stop i, another flight to a home. */
export type Overrides = { legs?: Record<number, string>; stays?: Record<number, string>; homes?: Record<string, string> }

export function cityName(model: Model, code: string): string {
  if (code === model.origin.code) return model.origin.name
  return model.destByCode.get(code)?.name ?? model.airportNames.get(code) ?? code
}

/** The airport a home's travellers land at: the end of their last flight (a round trip ends where it began). */
export function homeEnd(h: HomeEval): string {
  const last = h.legs[h.legs.length - 1].leg
  return last.roundTrip ? last.fromCity : last.toCity
}

/** Where the party flies home, from the settings: the origin takes everyone not sent elsewhere. Origin first. */
export function homesInUse(model: Model, s: Settings): { home: Home; count: number }[] {
  const others = model.homes
    .slice(1)
    .map((home) => ({ home, count: s.home[home.id] ?? 0 }))
    .filter((h) => h.count > 0)
  const rest = s.n - others.reduce((a, h) => a + h.count, 0)
  return [...(rest > 0 ? [{ home: model.homes[0], count: rest }] : []), ...others]
}

/**
 * Prices a trip for the current party, room setup, fare rules and leg and stay filters: a leg that fails the filters
 * is swapped for the cheapest alternative that passes, and each stop gets the cheapest qualifying stay.
 * Returns null when the trip cannot be made to fit.
 */
export function evaluateTrip(model: Model, trip: Trip, s: Settings, ov: Overrides = {}): EvalTrip | null {
  const prior = model.set.meta.prior
  const fits = (l: Leg) => legPasses(l, s.f, s.youth)
  const inUse = homesInUse(model, s)
  const atOrigin = inUse.find((h) => h.home.id === model.homes[0].id)?.count ?? 0
  /**
   * legs `ids` from position `offset` on, each swapped for its cheapest passing alternative when it fails the filters;
   * `party` is how many take each one (a taxi to the airport is shared only by those on that flight)
   */
  const pick = (ids: string[], alts: string[][], forced: (string | undefined)[], dates: (string | null | undefined)[], offset: number, party: number[]): EvalLeg[] | null => {
    const out: EvalLeg[] = []
    for (let k = 0; k < ids.length; k++) {
      const opts = { n: party[k], bags: s.bags, transfer: s.transfer, rooms: s.rooms }
      const cost = (l: Leg) => priceLeg(l, opts).total
      const primary = model.legById.get(ids[k])
      if (!primary) return null
      const others = (alts[k] ?? []).map((id) => model.legById.get(id)).filter((l): l is Leg => !!l)
      const wanted = forced[k]
      const want = wanted ? model.legById.get(wanted) : undefined
      const leg = (want && fits(want) ? want : undefined) ?? (fits(primary) ? primary : others.filter(fits).sort((a, b) => cost(a) - cost(b))[0])
      if (!leg) return null
      const alternatives = [primary, ...others].filter((l) => l.id !== leg.id && fits(l)).sort((a, b) => cost(a) - cost(b))
      const price = priceLeg(leg, opts)
      out.push({ leg, index: offset + k, travelDate: dates[k] ?? leg.date ?? null, costPP: price.total, minutes: price.minutes, price, alternatives })
    }
    return out
  }
  // someone flying home elsewhere swaps the flight back (or the round trip, which cannot be split) for their own
  const keep = trip.legs.length - 1
  const base = pick(
    trip.legs,
    trip.legAlternatives ?? [],
    trip.legs.map((_, i) => ov.legs?.[i]),
    trip.legs.map((_, i) => trip.legDates?.[i]),
    0,
    trip.legs.map((_, i) => (i < keep || !atOrigin ? s.n : atOrigin)),
  )
  if (!base) return null
  const homeLegs: { home: Home; count: number; legs: EvalLeg[]; own: EvalLeg[] }[] = []
  for (const { home, count } of inUse) {
    if (home.id === model.homes[0].id) {
      homeLegs.push({ home, count, legs: base, own: [] })
      continue
    }
    const opt = trip.homes?.[home.id]
    if (!opt) return null
    const last = opt.legs.length - 1
    const own = pick(
      opt.legs,
      opt.legs.map((_, k) => (k === last ? opt.alts : [])),
      opt.legs.map((_, k) => (k === last ? ov.homes?.[home.id] : undefined)),
      opt.legs.map(() => null),
      keep,
      opt.legs.map(() => count),
    )
    if (!own) return null
    homeLegs.push({ home, count, legs: [...base.slice(0, keep), ...own], own })
  }
  // the leg list shown is that of the home most travellers fly to (the origin on a tie); the others are listed apart
  const primary = homeLegs.reduce((a, b) => (b.count > a.count ? b : a))
  const legs = primary.legs

  const stops: EvalStop[] = []
  for (let i = 0; i < trip.stops.length; i++) {
    const stop = trip.stops[i]
    const dest = model.destByCode.get(stop.city)
    if (!dest) return null
    const options: StayOption[] = []
    for (const id of [stop.stay, ...stop.altStays]) {
      const stay = model.stayById.get(id)
      if (!stay) continue
      const price = stayNightPP(stay, s.n, s.rooms)
      options.push({
        stay,
        nightPP: price.pp,
        units: price.units,
        note: price.note,
        adjusted: adjustedRating(stay.rating5, stay.reviews, prior),
        confidence: confidence(stay.reviews),
      })
    }
    const pool = options.filter((o) => stayPasses(o.stay, o.adjusted, s.f)).sort((a, b) => a.nightPP - b.nightPP)
    const forced = ov.stays?.[i]
    const chosen = (forced ? pool.find((o) => o.stay.id === forced) : undefined) ?? pool[0]
    if (!chosen) return null
    const events = (model.activitiesByCity.get(stop.city) ?? []).filter(
      (a) => a.category === 'event' && a.dates && a.dates.start < stop.checkout && a.dates.end >= stop.checkin,
    )
    stops.push({ stop, dest, chosen, options: pool, totalPP: chosen.nightPP * stop.nights, events })
  }

  const staysPP = stops.reduce((a, st) => a + st.totalPP, 0)
  const foodEstPP = foodFor(stops, s.eat === 'off' ? REFERENCE_PLAN : s.eat)
  const foodPP = s.eat !== 'off' && foodEstPP != null ? foodEstPP : 0
  const permits = new Map<string, { name: string; eur: number }>()
  for (const st of stops) {
    const e = st.dest.entryInfo
    if (e?.costEUR && (e.level === 'eta' || e.level === 'visa')) permits.set(st.dest.cc ?? st.dest.code, { name: e.name ?? st.dest.country ?? st.dest.name, eur: e.costEUR })
  }
  const entryPP = [...permits.values()].reduce((a, p) => a + p.eur, 0)
  const sum = (ls: EvalLeg[], f: (l: EvalLeg) => number) => ls.reduce((a, l) => a + f(l), 0)
  const homes: HomeEval[] = homeLegs.map((h) => {
    const transport = sum(h.legs, (l) => l.costPP)
    return { ...h, transportPP: transport, totalPP: transport + staysPP + foodPP + entryPP, transitMin: sum(h.legs, (l) => l.minutes) }
  })
  /** the group's average of a per-person figure */
  const avg = (f: (h: HomeEval) => number) => homes.reduce((a, h) => a + h.count * f(h), 0) / s.n
  const totalPP = avg((h) => h.totalPP)
  const main = homes.find((h) => h.home.id === primary.home.id) ?? homes[0]
  const ownLegs = homes.filter((h) => h !== main).flatMap((h) => h.own)
  const cities = trip.stops.map((st) => st.city)
  return {
    trip,
    key: cities.join('>'),
    title: cities.map((c) => cityName(model, c)).join(' → '),
    cities,
    isMulti: cities.length > 1,
    legs,
    stops,
    transportPP: avg((h) => h.transportPP),
    faresPP: avg((h) => sum(h.legs, (l) => l.price.fare)),
    bagsPP: avg((h) => sum(h.legs, (l) => l.price.bags.eur)),
    transfersPP: avg((h) => sum(h.legs, (l) => l.price.transferEUR)),
    staysPP,
    foodPP,
    foodEstPP,
    entryPP,
    entryNames: [...permits.values()].map((p) => p.name),
    totalPP,
    groupTotal: totalPP * s.n,
    homes,
    mainHome: main,
    split: homes.length > 1,
    transitMin: main.transitMin,
    weakestAdjusted: Math.min(...stops.map((st) => st.chosen.adjusted)),
    headsUp: headsUpFor(model, [...legs, ...ownLegs], stops, s),
    ...inclusions(legs, stops, s.bags),
    youthFare: legs.some((l) => l.leg.fareType === 'youth'),
  }
}

/** Food and drink for one person over the trip: a day in each city per night spent there. */
export function foodFor(stops: EvalStop[], plan: EatPlan): number | null {
  let sum = 0
  for (const st of stops) {
    const day = dailySpend(st.dest.prices, plan)
    if (day == null) return null
    sum += day * st.stop.nights
  }
  return sum
}

/**
 * Why a leg deserves a heads-up, in the words that fit: an overnight layover (named in the flight's notes), a journey
 * of 10 hours or more, a landing after midnight, or a night bus or train. Null when none applies.
 */
export function legHeadsUp(leg: Leg, from: string, to: string): string | null {
  const mins = leg.durationMin ?? 0
  const hours = Math.round(mins / 60)
  const layover = leg.notes?.match(/layover [\d.]+ h at ([^;]+?) overnight/)
  if (layover) return `Long transfer: ${from} to ${to} takes ${hours} h with an overnight layover at ${layover[1]}`
  if (mins >= 600) return `Long transfer: ${from} to ${to} takes ${hours} h${leg.overnight ? ', through the night' : ''}`
  if (!leg.overnight) return null
  const lands = leg.depTime && leg.arrTime && leg.arrTime < leg.depTime && leg.arrTime <= '05:00' ? leg.arrTime : null
  return lands ? `${from} to ${to} lands after midnight, at ${lands}` : `${from} to ${to} travels through the night (${hours} h)`
}

const clockMin = (t: string) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3, 5))

/**
 * A flight home that lands too late (or too early) for the train onward from that airport (Oslo Gardermoen to Tønsberg),
 * going by the hours the train runs and about 25 minutes from the gate to the platform.
 */
export function lateForTrain(model: Model, l: EvalLeg): string | null {
  const at = l.price.transfers.find((t) => t.transfer.where === l.leg.toCity && t.transfer.where !== model.origin.code && model.airportNames.has(t.transfer.where))
  const pub = at?.how === 'public' ? at.transfer.public : null
  const hours = pub?.hours?.match(/(\d{2}:\d{2})\s*[–-]\s*(\d{2}:\d{2})/)
  if (!pub || !hours || !l.leg.arrTime) return null
  const lands = clockMin(l.leg.arrTime) + 25
  const nextDay = !!(l.leg.arrDate && l.leg.date && l.leg.arrDate > l.leg.date)
  if (!nextDay && lands <= clockMin(hours[2]) && lands >= clockMin(hours[1])) return null
  const place = cityName(model, l.leg.toCity)
  const line = pub.line ?? 'train'
  if (!nextDay && lands < clockMin(hours[1])) return `${place}: lands at ${l.leg.arrTime}, before the first ${line} (${hours[1]}).`
  return `${place}: lands at ${l.leg.arrTime}${nextDay ? ' the next day' : ''}, after the last ${line} (${hours[2]}); the first one leaves at ${hours[1]}.`
}

function headsUpFor(model: Model, legs: EvalLeg[], stops: EvalStop[], s: Settings): HeadsUp[] {
  const out: HeadsUp[] = []
  for (const l of legs) {
    const from = cityName(model, l.leg.fromCity)
    const to = cityName(model, l.leg.toCity)
    const long = legHeadsUp(l.leg, from, to)
    if (long) out.push({ kind: 'long', text: long })
    if (l.leg.estimated) {
      out.push({ kind: 'estimate', text: `${from} to ${to}: estimated fare (half of a round trip). Check the real price at the link.` })
    }
    if (l.leg.fareType === 'youth') {
      const sas = /\bSAS\b|Scandinavian/i.test(l.leg.operator ?? '')
      out.push({
        kind: 'youth',
        text: sas
          ? 'SAS Young fare (ages 12–25): book while logged in to EuroBonus (free to join) and carry ID showing your age.'
          : `Youth fare on ${l.leg.operator ?? 'this flight'}: carry ID showing your age when you fly.`,
      })
    }
    const touchesOrigin = l.leg.fromCity === model.origin.code || l.leg.toCity === model.origin.code
    if (!touchesOrigin && l.leg.date && l.travelDate && l.leg.date !== l.travelDate) {
      out.push({ kind: 'date', text: `${from} to ${to}: price seen for ${shortDate(l.leg.date)}, you travel ${shortDate(l.travelDate)}.` })
    }
    const late = lateForTrain(model, l)
    if (late) out.push({ kind: 'transfer', text: late })
    if (l.leg.priceMaxEUR && l.leg.priceMaxEUR > l.leg.priceEUR) {
      out.push({
        kind: 'range',
        text: `${from} to ${to}: ${modeOf(l.leg.kind)} price is an estimate range (€${Math.round(l.leg.priceEUR)}–€${Math.round(l.leg.priceMaxEUR)}).`,
      })
    }
  }
  const estimatedBags = [...new Set(legs.filter((l) => l.price.bags.estimate && l.price.bags.eur > 0).map((l) => operatorName(l.leg)))]
  if ((s.bags.cabin || s.bags.checked) && estimatedBags.length) {
    out.push({ kind: 'bags', text: `Bag fees for ${estimatedBags.join(', ')} are typical prices, not quotes; check them when you book.` })
  }
  const unpriced = legs.flatMap((l) => l.price.transfers.filter((t) => t.how === null && t.transfer.kind === 'airport').map((t) => t.transfer.place ?? t.transfer.where))
  if (unpriced.length) out.push({ kind: 'transfer', text: `No transfer price found for ${[...new Set(unpriced)].join(', ')} airport; add a local bus or taxi.` })
  const rough = legs.flatMap((l) =>
    l.price.transfers.filter((t) => t.how === 'public' && t.transfer.public?.estimate).map((t) => `${t.transfer.place ?? t.transfer.where} (${t.transfer.public?.line ?? 'public transport'})`),
  )
  if (rough.length) out.push({ kind: 'transfer', text: `Transfer fare is a rough estimate at ${[...new Set(rough)].join(', ')}; check the operator's price.` })
  for (const st of stops) {
    const entry = st.dest.entryInfo
    if (entry?.level && entry.level !== 'id') {
      out.push({ kind: 'entry', text: `${entry.name ?? st.dest.country ?? st.dest.name}: ${PAPER_LABEL[entry.level].toLowerCase()}${entry.paperwork ? `. ${entry.paperwork}` : ''}` })
    } else if (!entry?.level && st.dest.schengen === false && st.dest.entry) out.push({ kind: 'entry', text: `${st.dest.name}: ${st.dest.entry}` })
    if (st.chosen.confidence === 'low') {
      out.push({ kind: 'reviews', text: `${st.chosen.stay.name} has only ${st.chosen.stay.reviews} reviews.` })
    }
  }
  const seen = new Set<string>()
  return out.filter((h) => (seen.has(h.text) ? false : (seen.add(h.text), true)))
}

const CABIN_LABELS = ['Cabin bag', 'Cabin bag in overhead bin']

function inclusions(legs: EvalLeg[], stops: EvalStop[], bags: Bags): { included: string[]; missing: string[] } {
  const missing = new Set<string>()
  for (const l of legs) labels(l.leg.missing).forEach((m) => missing.add(m))
  for (const st of stops) labels(st.chosen.stay.missing).forEach((m) => missing.add(m))
  const everywhere = (sets: Set<string>[]) => (sets.length ? [...sets[0]].filter((x) => sets.every((s) => s.has(x))) : [])
  const stayInc = everywhere(stops.map((st) => new Set(labels(st.chosen.stay.includes))))
  const legInc = everywhere(legs.map((l) => new Set(labels(l.leg.includes)))).filter(
    (x) => !(bags.cabin && CABIN_LABELS.includes(x)) && !(bags.checked && x === 'Checked bag'),
  )
  // the chosen bags are bought wherever a fare lacks them, so they are covered on every leg
  const bagInc = [...(bags.cabin ? ['Cabin bag on every leg'] : []), ...(bags.checked ? ['Checked bag on every leg'] : [])]
  if (bags.cabin) CABIN_LABELS.forEach((x) => missing.delete(x))
  if (bags.checked) missing.delete('Checked bag')
  const included = [...new Set([...bagInc, ...stayInc, ...legInc])].filter((x) => !missing.has(x))
  return { included, missing: [...missing] }
}

export type TripGroup = {
  key: string
  title: string
  cities: string[]
  best: EvalTrip
  variants: EvalTrip[]
  /** how much cheaper the best variant is than the cheapest one on the exact window dates */
  savingVsWindow: number | null
  minPP: number
}

function pickBest(variants: EvalTrip[], sort: SortKey): EvalTrip {
  if (sort === 'rating') return [...variants].sort((a, b) => b.weakestAdjusted - a.weakestAdjusted || a.totalPP - b.totalPP)[0]
  if (sort === 'time') return [...variants].sort((a, b) => a.transitMin - b.transitMin || a.totalPP - b.totalPP)[0]
  return variants[0]
}

/** One card per city combination: the best variant up front, other dates and stays behind it. */
export function groupTrips(evals: EvalTrip[], sort: SortKey, window: { start: string; end: string }): TripGroup[] {
  const byKey = new Map<string, EvalTrip[]>()
  for (const e of evals) {
    const list = byKey.get(e.key)
    if (list) list.push(e)
    else byKey.set(e.key, [e])
  }
  const groups: TripGroup[] = []
  for (const [key, list] of byKey) {
    list.sort((a, b) => a.totalPP - b.totalPP)
    const seen = new Set<string>()
    const variants: EvalTrip[] = []
    for (const v of list) {
      const id = `${v.trip.start}|${v.trip.end}|${v.legs.map((l) => l.leg.id).join(',')}|${v.stops.map((s) => s.chosen.stay.id).join(',')}`
      if (seen.has(id)) continue
      seen.add(id)
      variants.push(v)
    }
    const best = pickBest(variants, sort)
    const onWindow = variants.filter((v) => v.trip.start === window.start && v.trip.end === window.end)
    const baseline = onWindow.length ? Math.min(...onWindow.map((v) => v.totalPP)) : null
    const saving = baseline != null && (best.trip.start !== window.start || best.trip.end !== window.end) ? baseline - best.totalPP : null
    groups.push({
      key,
      title: best.title,
      cities: best.cities,
      best,
      variants,
      savingVsWindow: saving != null && saving >= 1 ? saving : null,
      minPP: variants[0].totalPP,
    })
  }
  groups.sort((a, b) => {
    if (sort === 'rating') return b.best.weakestAdjusted - a.best.weakestAdjusted || a.best.totalPP - b.best.totalPP
    if (sort === 'time') return a.best.transitMin - b.best.transitMin || a.best.totalPP - b.best.totalPP
    return a.best.totalPP - b.best.totalPP
  })
  return groups
}

export type DestSummary = { code: string; minPP: number; groupKey: string }

/** Cheapest visible total per destination, and the card to open when it is clicked on the map. */
export function summarizeDestinations(groups: TripGroup[]): Map<string, DestSummary> {
  const out = new Map<string, DestSummary>()
  for (const g of groups) {
    for (const c of g.cities) {
      const cur = out.get(c)
      const better = !cur || g.minPP < cur.minPP - 0.5 || (Math.abs(g.minPP - cur.minPP) <= 0.5 && g.cities.length === 1)
      if (better) out.set(c, { code: c, minPP: g.minPP, groupKey: g.key })
    }
  }
  return out
}

export function quantile(values: number[], q: number): number {
  if (!values.length) return 0
  const s = [...values].sort((a, b) => a - b)
  const pos = (s.length - 1) * q
  const lo = Math.floor(pos)
  const hi = Math.ceil(pos)
  return s[lo] + (s[hi] - s[lo]) * (pos - lo)
}
