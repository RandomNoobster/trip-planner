import type { Climate, Destination, Leg, PaperLevel, Stay } from '../data/schema'
import { PAPER_LEVELS } from '../data/schema'
import { shortDate } from './format'
import { labels, modeOf } from './labels'
import type { EvalTrip } from './trips'

export type Mode = 'flight' | 'train' | 'bus'
export type StayKind = 'whole' | 'room' | 'hostel'
export type Amenity = 'kitchen' | 'bath'

/**
 * Everything the explore view can narrow by. Empty lists and nulls mean "no limit".
 * Leg and stay rules change which flight or stay a trip uses (the cheapest one that qualifies);
 * the rest keep or drop whole trips.
 */
export type Filters = {
  /** total per person, EUR */
  maxPrice: number | null
  /** adjusted stay rating that every stop's stay must reach (0 = any) */
  minRating: number
  minReviews: number
  /** allowed numbers of cities per trip */
  cities: number[]
  /** no leg at or above this many hours door to door (layovers included), and none overnight */
  maxLegH: number | null
  modes: Mode[]
  /** connections per flight */
  maxStops: number | null
  avoidOps: string[]
  exactOnly: boolean
  stayKinds: StayKind[]
  needs: Amenity[]
  /** straight-line km from the city centre that every stay must be within */
  maxCentreKm: number | null
  /** allowed departure dates (ISO) */
  starts: string[]
  /** allowed return dates (ISO) */
  ends: string[]
  nights: number[]
  schengenOnly: boolean
  /** country codes no stop may be in */
  avoidCountries: string[]
  /** typical daytime high every stop must reach, °C */
  minHighC: number | null
  dry: boolean
  sunny: boolean
  /** most a 0.5 l draught beer in a bar may cost in every city of the trip, EUR */
  maxBeer: number | null
  /** highest food index (100 = the median destination) any city of the trip may have */
  maxFoodIx: number | null
  /** the most entry paperwork any country on the trip may need (null: any) */
  maxPaper: PaperLevel | null
  /** December events that must be on while the group is in at least one of the trip's cities */
  whatsOn: WhatsOn[]
  /** destination every shown trip must include: the city clicked on the map */
  city: string | null
}

export type WhatsOn = 'xmas' | 'sport'

export const NO_FILTERS: Filters = {
  maxPrice: null,
  minRating: 0,
  minReviews: 0,
  cities: [],
  maxLegH: null,
  modes: [],
  maxStops: null,
  avoidOps: [],
  exactOnly: false,
  stayKinds: [],
  needs: [],
  maxCentreKm: null,
  starts: [],
  ends: [],
  nights: [],
  schengenOnly: false,
  avoidCountries: [],
  minHighC: null,
  dry: false,
  sunny: false,
  maxBeer: null,
  maxFoodIx: null,
  maxPaper: null,
  whatsOn: [],
  city: null,
}

export const RATING_STEPS = [4.4, 4.6, 4.8]
export const REVIEW_STEPS = [50, 200]
export const LEG_HOURS = [10, 6, 4]
export const STOP_STEPS = [0, 1, 2]
export const WARM_STEPS = [5, 10, 15, 20, 25]
export const CENTRE_STEPS = [1, 2, 5]
/** "mostly dry": rain or snow on at most this share of days */
export const DRY_SHARE = 0.3
export const SUNNY_HOURS = 5
/** "beer under €3 / €4 / €5 everywhere" */
export const BEER_STEPS = [3, 4, 5]
/** food index limits: cheap, and at or below the median destination */
export const FOOD_STEPS = [80, 100]
/** what entry takes for a Norwegian citizen, per level */
export const PAPER_LABEL: Record<PaperLevel, string> = {
  id: 'ID card is enough',
  passport: 'Passport only',
  form: 'Passport and a free online form',
  eta: 'Passport and a paid online permit',
  visa: 'Visa needed',
}
/** filter steps: the most paperwork allowed */
export const PAPER_STEPS: Exclude<PaperLevel, 'visa'>[] = ['id', 'passport', 'form', 'eta']
export const PAPER_STEP_LABEL: Record<Exclude<PaperLevel, 'visa'>, string> = { id: 'ID card', passport: 'Passport', form: '+ free form', eta: '+ paid permit' }

/** A destination's paperwork level; without researched rules, Schengen counts as the ID card and the rest as unknown (the strictest). */
export function paperLevel(d: Destination): PaperLevel {
  return d.entryInfo?.level ?? (d.schengen ? 'id' : 'visa')
}

export function paperRank(level: PaperLevel): number {
  return PAPER_LEVELS.indexOf(level)
}

/** The most paperwork any stop of a trip needs. */
export function tripPaper(e: EvalTrip): PaperLevel {
  return e.stops.map((st) => paperLevel(st.dest)).reduce((a, b) => (paperRank(b) > paperRank(a) ? b : a), 'id' as PaperLevel)
}

export const FOOD_STEP_LABEL: Record<number, string> = { 80: 'Cheap (index 80 or less)', 100: 'Average or cheaper (100 or less)' }
export const MODES: Mode[] = ['flight', 'train', 'bus']
export const STAY_KINDS: StayKind[] = ['whole', 'room', 'hostel']
export const AMENITIES: Amenity[] = ['kitchen', 'bath']
export const MODE_LABEL: Record<Mode, string> = { flight: 'Flights', train: 'Trains', bus: 'Buses' }
export const STAY_KIND_LABEL: Record<StayKind, string> = { whole: 'Whole place', room: 'Room in a home', hostel: 'Hostel or hotel room' }
export const AMENITY_LABEL: Record<Amenity, string> = { kitchen: 'Kitchen', bath: 'Private bathroom' }
export const WHATS_ON: WhatsOn[] = ['xmas', 'sport']
export const WHATS_ON_LABEL: Record<WhatsOn, string> = { xmas: 'Christmas market', sport: 'Live football or other match' }

const XMAS = /christmas|xmas|advent|weihnacht|christkindl|no[eë]l|natale|navidad|nadal|kerst|julemarked|julmarknad|joulu|jõulu|santa ll[uú]cia|winter wonderland/i
const MARKET = /market|fair|markt|march[eé]|mercat|mercad|jarmark|v[aá]s[aá]r|\btrh\b|village|wonderland|\bfira\b|basar|bazaar/i
const SPORT = /\bvs?\.?\s|\bversus\b|\bmatch\b|derby|football|soccer|ice hockey|basketball|\bliga\b|league|serie a|bundesliga|ekstraklasa|eredivisie/i

/** Which kinds of December event a list of events (already limited to the stay's dates) includes. */
export function eventKinds(events: { name: string; blurb?: string | null }[]): Set<WhatsOn> {
  const kinds = new Set<WhatsOn>()
  for (const e of events) {
    const text = `${e.name} ${e.blurb ?? ''}`
    if (XMAS.test(text) && MARKET.test(text)) kinds.add('xmas')
    if (SPORT.test(e.name)) kinds.add('sport')
  }
  return kinds
}

const ISO = /^\d{4}-\d{2}-\d{2}$/

function list(v: string | null): string[] {
  return v ? v.split(',').map((x) => x.trim()).filter(Boolean) : []
}

function pick<T extends string>(v: string | null, allowed: readonly T[]): T[] {
  return list(v).filter((x): x is T => (allowed as readonly string[]).includes(x))
}

function numberIn(v: string | null, ok: (n: number) => boolean): number | null {
  if (v == null || v === '') return null
  const n = Number(v)
  return Number.isFinite(n) && ok(n) ? n : null
}

function ints(v: string | null): number[] {
  return list(v)
    .map(Number)
    .filter((n) => Number.isInteger(n) && n > 0)
}

/** Filters from the URL. Also reads the first version's `route` and `hideLow` so old links keep working. */
export function readFilters(p: URLSearchParams): Filters {
  const route = p.get('route')
  const cities = ints(p.get('cities'))
  return {
    maxPrice: numberIn(p.get('price'), (n) => n > 0),
    minRating: numberIn(p.get('rating'), (n) => n > 0 && n <= 5) ?? 0,
    minReviews: numberIn(p.get('reviews'), (n) => n > 0) ?? (p.get('hideLow') === '1' ? 50 : 0),
    cities: cities.length ? cities : route === 'single' ? [1] : route === 'multi' ? [2, 3] : [],
    maxLegH: numberIn(p.get('leg'), (n) => n > 0),
    modes: pick(p.get('modes'), MODES),
    maxStops: numberIn(p.get('stops'), (n) => Number.isInteger(n) && n >= 0),
    avoidOps: list(p.get('avoid')),
    exactOnly: p.get('exact') === '1',
    stayKinds: pick(p.get('stay'), STAY_KINDS),
    needs: pick(p.get('needs'), AMENITIES),
    maxCentreKm: numberIn(p.get('centre'), (n) => n > 0),
    starts: list(p.get('leave')).filter((d) => ISO.test(d)),
    ends: list(p.get('back')).filter((d) => ISO.test(d)),
    nights: ints(p.get('nights')),
    schengenOnly: p.get('schengen') === '1',
    avoidCountries: list(p.get('skip')).map((c) => c.toUpperCase()),
    minHighC: numberIn(p.get('warm'), (n) => n > -50 && n < 50),
    dry: p.get('dry') === '1',
    sunny: p.get('sunny') === '1',
    maxBeer: numberIn(p.get('beer'), (n) => n > 0),
    maxFoodIx: numberIn(p.get('food'), (n) => n > 0),
    maxPaper: pick(p.get('papers'), PAPER_STEPS)[0] ?? null,
    whatsOn: pick(p.get('on'), WHATS_ON),
    city: p.get('city')?.toUpperCase() || null,
  }
}

/** Writes non-default filters to the URL and removes the rest, so shared links stay short. */
export function writeFilters(next: URLSearchParams, f: Filters): void {
  const put = (k: string, v: string | null) => (v ? next.set(k, v) : next.delete(k))
  const join = (xs: (string | number)[]) => (xs.length ? [...xs].map(String).sort().join(',') : null)
  next.delete('route')
  next.delete('hideLow')
  put('price', f.maxPrice != null ? String(Math.round(f.maxPrice)) : null)
  put('rating', f.minRating > 0 ? String(f.minRating) : null)
  put('reviews', f.minReviews > 0 ? String(f.minReviews) : null)
  put('cities', join(f.cities))
  put('leg', f.maxLegH != null ? String(f.maxLegH) : null)
  put('modes', f.modes.length && f.modes.length < MODES.length ? MODES.filter((m) => f.modes.includes(m)).join(',') : null)
  put('stops', f.maxStops != null ? String(f.maxStops) : null)
  put('avoid', join(f.avoidOps))
  put('exact', f.exactOnly ? '1' : null)
  put('stay', f.stayKinds.length && f.stayKinds.length < STAY_KINDS.length ? STAY_KINDS.filter((k) => f.stayKinds.includes(k)).join(',') : null)
  put('needs', join(f.needs))
  put('centre', f.maxCentreKm != null ? String(f.maxCentreKm) : null)
  put('leave', join(f.starts))
  put('back', join(f.ends))
  put('nights', join(f.nights))
  put('schengen', f.schengenOnly ? '1' : null)
  put('skip', join(f.avoidCountries))
  put('warm', f.minHighC != null ? String(f.minHighC) : null)
  put('dry', f.dry ? '1' : null)
  put('sunny', f.sunny ? '1' : null)
  put('beer', f.maxBeer != null ? String(f.maxBeer) : null)
  put('food', f.maxFoodIx != null ? String(f.maxFoodIx) : null)
  put('papers', f.maxPaper)
  put('on', join(f.whatsOn))
  put('city', f.city)
}

/**
 * The filters that change which leg or stay a trip uses, as a string, so trips are re-priced only when these change.
 * fromKey turns it back into Filters (the other fields at their defaults).
 */
export function evalKey(f: Filters): string {
  const { minRating, minReviews, maxLegH, modes, maxStops, avoidOps, exactOnly, stayKinds, needs, maxCentreKm } = f
  return JSON.stringify({ minRating, minReviews, maxLegH, modes, maxStops, avoidOps, exactOnly, stayKinds, needs, maxCentreKm })
}

/** The filters that keep or drop whole trips, as a string (see evalKey). */
export function tripKey(f: Filters): string {
  const { maxPrice, cities, starts, ends, nights, schengenOnly, avoidCountries, minHighC, dry, sunny, maxBeer, maxFoodIx, maxPaper, whatsOn, city } = f
  return JSON.stringify({ maxPrice, cities, starts, ends, nights, schengenOnly, avoidCountries, minHighC, dry, sunny, maxBeer, maxFoodIx, maxPaper, whatsOn, city })
}

export function fromKey(key: string): Filters {
  return { ...NO_FILTERS, ...(JSON.parse(key) as Partial<Filters>) }
}

// ---------- legs ----------

const CARRIER_NAMES: Record<string, string> = {
  'scandinavian airlines': 'SAS',
  sas: 'SAS',
  wideroe: 'Widerøe',
  'widerøe': 'Widerøe',
  'wizz air': 'Wizz Air',
  wizzair: 'Wizz Air',
  'klm royal dutch airlines': 'KLM',
  'norwegian air shuttle': 'Norwegian',
  flixbus: 'FlixBus',
}
const carrierCache = new WeakMap<Leg, string[]>()

/** The companies on a leg: "Wideroe and Lufthansa" gives ["Widerøe", "Lufthansa"]. Rome2Rio route types name none. */
export function carriers(leg: Leg): string[] {
  let c = carrierCache.get(leg)
  if (!c) {
    c =
      leg.source === 'rome2rio' || !leg.operator
        ? []
        : [
            ...new Set(
              leg.operator
                .split(/\s+and\s+|\s*[,+/&]\s*/)
                .map((x) => x.trim())
                .filter(Boolean)
                .map((x) => CARRIER_NAMES[x.toLowerCase()] ?? x),
            ),
          ]
    carrierCache.set(leg, c)
  }
  return c
}

/** Modes a leg uses: a "train+bus" route counts as both. */
export function legModes(leg: Leg): Mode[] {
  return leg.kind === 'train+bus' ? ['train', 'bus'] : [modeOf(leg.kind)]
}

/** Whether a leg meets the transport filters (and the youth-fare setting). */
export function legPasses(leg: Leg, f: Filters, youth: boolean): boolean {
  if (!youth && leg.fareType === 'youth') return false
  if (f.modes.length && !legModes(leg).every((m) => f.modes.includes(m))) return false
  if (f.maxStops != null && modeOf(leg.kind) === 'flight' && (leg.stops ?? 0) > f.maxStops) return false
  if (f.maxLegH != null && (leg.overnight || Math.max(leg.durationMin ?? 0, leg.durationBackMin ?? 0) >= f.maxLegH * 60)) return false
  if (f.avoidOps.length && carriers(leg).some((c) => f.avoidOps.includes(c))) return false
  if (f.exactOnly && (leg.estimated || (leg.priceMaxEUR ?? 0) > leg.priceEUR)) return false
  return true
}

// ---------- stays ----------

export function stayKind(stay: Stay): StayKind {
  if (stay.roomType === 'entire_home') return 'whole'
  if (stay.roomType === 'private_room') return 'room'
  return 'hostel'
}

const stayLabelCache = new WeakMap<Stay, Set<string>>()

function stayLabels(stay: Stay): Set<string> {
  let s = stayLabelCache.get(stay)
  if (!s) {
    s = new Set(labels(stay.includes))
    stayLabelCache.set(stay, s)
  }
  return s
}

/** Whether a stay meets the stay filters. Ratings compare at two decimals, as they are shown. */
export function stayPasses(stay: Stay, adjusted: number, f: Filters): boolean {
  if (f.minRating > 0 && Math.round(adjusted * 100) / 100 < f.minRating) return false
  if (stay.reviews < f.minReviews) return false
  if (f.stayKinds.length && !f.stayKinds.includes(stayKind(stay))) return false
  if (f.maxCentreKm != null && (stay.centerKm == null || stay.centerKm > f.maxCentreKm)) return false
  if (f.needs.length) {
    const have = stayLabels(stay)
    if (f.needs.includes('kitchen') && !have.has('Kitchen')) return false
    if (f.needs.includes('bath') && !have.has('Private bathroom')) return false
  }
  return true
}

// ---------- whole trips ----------

export function weatherPasses(c: Climate | null | undefined, f: Filters): boolean {
  if (f.minHighC == null && !f.dry && !f.sunny) return true
  if (!c) return false
  if (f.minHighC != null && c.highC < f.minHighC) return false
  if (f.dry && c.wetShare > DRY_SHARE) return false
  if (f.sunny && (c.sunH ?? 0) < SUNNY_HOURS) return false
  return true
}

export type Facet = 'price' | 'cities' | 'starts' | 'ends' | 'nights' | 'place' | 'paper' | 'weather' | 'beer' | 'food' | 'whatsOn' | 'city'

/** The priciest bar beer and the highest food index among a trip's cities (Infinity when a city has no price). */
export function tripBeer(e: EvalTrip): number {
  return Math.max(...e.stops.map((st) => st.dest.prices?.items.beerBar?.eur ?? Infinity))
}

export function tripFoodIx(e: EvalTrip): number {
  return Math.max(...e.stops.map((st) => st.dest.prices?.foodIndex ?? Infinity))
}

/** The December events a trip overlaps, by kind: each stop's events already fall inside its nights there. */
export function tripEventKinds(e: EvalTrip): Set<WhatsOn> {
  return eventKinds(e.stops.flatMap((st) => st.events))
}

/** Trip-level filters. `except` skips one facet, to count what each of its options would show. */
export function tripPasses(e: EvalTrip, f: Filters, except?: Facet): boolean {
  if (except !== 'price' && f.maxPrice != null && e.totalPP > f.maxPrice) return false
  if (except !== 'cities' && f.cities.length && !f.cities.includes(e.cities.length)) return false
  if (except !== 'starts' && f.starts.length && !f.starts.includes(e.trip.start)) return false
  if (except !== 'ends' && f.ends.length && !f.ends.includes(e.trip.end)) return false
  if (except !== 'nights' && f.nights.length && !f.nights.includes(e.trip.nights)) return false
  if (except !== 'place') {
    if (f.schengenOnly && e.stops.some((st) => st.dest.schengen === false)) return false
    if (f.avoidCountries.length && e.stops.some((st) => st.dest.cc && f.avoidCountries.includes(st.dest.cc))) return false
  }
  if (except !== 'paper' && f.maxPaper && paperRank(tripPaper(e)) > paperRank(f.maxPaper)) return false
  if (except !== 'weather' && !e.stops.every((st) => weatherPasses(st.dest.climate, f))) return false
  if (except !== 'beer' && f.maxBeer != null && tripBeer(e) > f.maxBeer) return false
  if (except !== 'food' && f.maxFoodIx != null && tripFoodIx(e) > f.maxFoodIx) return false
  if (except !== 'whatsOn' && f.whatsOn.length) {
    const kinds = tripEventKinds(e)
    if (!f.whatsOn.every((k) => kinds.has(k))) return false
  }
  if (except !== 'city' && f.city && !e.cities.includes(f.city)) return false
  return true
}

/** How many routes (city combinations) each option of a facet would show, given every other filter. */
export function facetCounts<K>(evals: EvalTrip[], f: Filters, facet: Facet, keysOf: (e: EvalTrip) => K[]): Map<K, number> {
  const sets = new Map<K, Set<string>>()
  for (const e of evals) {
    if (!tripPasses(e, f, facet)) continue
    for (const k of keysOf(e)) {
      let s = sets.get(k)
      if (!s) sets.set(k, (s = new Set()))
      s.add(e.key)
    }
  }
  return new Map([...sets].map(([k, s]) => [k, s.size]))
}

/** Cheapest price per route, given every filter except the budget: what the budget slider chooses from. */
export function routeMinimums(evals: EvalTrip[], f: Filters): number[] {
  const best = new Map<string, number>()
  for (const e of evals) {
    if (!tripPasses(e, f, 'price')) continue
    const cur = best.get(e.key)
    if (cur == null || e.totalPP < cur) best.set(e.key, e.totalPP)
  }
  return [...best.values()]
}

// ---------- describing active filters ----------

export type ActiveFilter = { id: string; label: string; patch: Partial<Filters> }

function orList(xs: (string | number)[]): string {
  const s = xs.map(String)
  return s.length <= 1 ? (s[0] ?? '') : `${s.slice(0, -1).join(', ')} or ${s[s.length - 1]}`
}

function andList(xs: string[]): string {
  return xs.length <= 1 ? (xs[0] ?? '') : `${xs.slice(0, -1).join(', ')} and ${xs[xs.length - 1]}`
}

/** One removable chip per active filter, in the order people tend to set them. */
export function describeFilters(f: Filters, names: { city: (code: string) => string; country: (cc: string) => string }): ActiveFilter[] {
  const out: ActiveFilter[] = []
  if (f.city) out.push({ id: 'city', label: `Through ${names.city(f.city)}`, patch: { city: null } })
  if (f.maxPrice != null) out.push({ id: 'price', label: `Up to €${f.maxPrice} per person`, patch: { maxPrice: null } })
  if (f.minRating > 0) out.push({ id: 'rating', label: `Stays rated ${f.minRating}+`, patch: { minRating: 0 } })
  if (f.minReviews > 0) out.push({ id: 'reviews', label: `Stays with ${f.minReviews}+ reviews`, patch: { minReviews: 0 } })
  if (f.cities.length) {
    const c = [...f.cities].sort((a, b) => a - b)
    out.push({ id: 'cities', label: `${orList(c)} ${c.length === 1 && c[0] === 1 ? 'city' : 'cities'}`, patch: { cities: [] } })
  }
  if (f.maxLegH != null) out.push({ id: 'leg', label: `Legs under ${f.maxLegH} h, none overnight`, patch: { maxLegH: null } })
  if (f.modes.length) out.push({ id: 'modes', label: `Only ${andList(MODES.filter((m) => f.modes.includes(m)).map((m) => MODE_LABEL[m].toLowerCase()))}`, patch: { modes: [] } })
  if (f.maxStops != null) {
    out.push({ id: 'stops', label: f.maxStops === 0 ? 'Direct flights only' : `Flights with up to ${f.maxStops} stop${f.maxStops === 1 ? '' : 's'}`, patch: { maxStops: null } })
  }
  for (const op of f.avoidOps) out.push({ id: `avoid-${op}`, label: `No ${op}`, patch: { avoidOps: f.avoidOps.filter((x) => x !== op) } })
  if (f.exactOnly) out.push({ id: 'exact', label: 'Exact fares only', patch: { exactOnly: false } })
  if (f.stayKinds.length) {
    out.push({ id: 'stay', label: orList(STAY_KINDS.filter((k) => f.stayKinds.includes(k)).map((k) => STAY_KIND_LABEL[k])), patch: { stayKinds: [] } })
  }
  for (const a of f.needs) out.push({ id: `needs-${a}`, label: `${AMENITY_LABEL[a]} in every stay`, patch: { needs: f.needs.filter((x) => x !== a) } })
  if (f.maxCentreKm != null) out.push({ id: 'centre', label: `Stays within ${f.maxCentreKm} km of the centre`, patch: { maxCentreKm: null } })
  if (f.starts.length) out.push({ id: 'leave', label: `Leave ${orList([...f.starts].sort().map(shortDate))}`, patch: { starts: [] } })
  if (f.ends.length) out.push({ id: 'back', label: `Back ${orList([...f.ends].sort().map(shortDate))}`, patch: { ends: [] } })
  if (f.nights.length) out.push({ id: 'nights', label: `${orList([...f.nights].sort((a, b) => a - b))} nights`, patch: { nights: [] } })
  if (f.schengenOnly) out.push({ id: 'schengen', label: 'Schengen only', patch: { schengenOnly: false } })
  if (f.avoidCountries.length) {
    const label = f.avoidCountries.length <= 2 ? `Not ${orList(f.avoidCountries.map(names.country))}` : `Skipping ${f.avoidCountries.length} countries`
    out.push({ id: 'skip', label, patch: { avoidCountries: [] } })
  }
  if (f.maxPaper) {
    const label = f.maxPaper === 'id' ? 'ID card is enough everywhere' : f.maxPaper === 'passport' ? 'Passport only, no forms' : f.maxPaper === 'form' ? 'No paid entry permits' : 'No visas'
    out.push({ id: 'papers', label, patch: { maxPaper: null } })
  }
  if (f.minHighC != null) out.push({ id: 'warm', label: `Highs of ${f.minHighC}°C or more`, patch: { minHighC: null } })
  if (f.dry) out.push({ id: 'dry', label: 'Mostly dry', patch: { dry: false } })
  if (f.sunny) out.push({ id: 'sunny', label: `${SUNNY_HOURS} h+ of sun a day`, patch: { sunny: false } })
  if (f.maxBeer != null) out.push({ id: 'beer', label: `Beer up to €${f.maxBeer} everywhere`, patch: { maxBeer: null } })
  if (f.maxFoodIx != null) {
    out.push({ id: 'food', label: f.maxFoodIx <= 80 ? 'Cheap food everywhere' : `Food index ${f.maxFoodIx} or less`, patch: { maxFoodIx: null } })
  }
  for (const k of f.whatsOn) out.push({ id: `on-${k}`, label: `${WHATS_ON_LABEL[k]} during the stay`, patch: { whatsOn: f.whatsOn.filter((x) => x !== k) } })
  return out
}
