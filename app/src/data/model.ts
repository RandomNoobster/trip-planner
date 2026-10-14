import { z } from 'zod'
import { placeClimate } from '../lib/climate'
import {
  PlacesSchema,
  ResearchSetSchema,
  SetIndexEntrySchema,
  type Activity,
  type Destination,
  type Home,
  type Leg,
  type Place,
  type Places,
  type ResearchSet,
  type SetIndexEntry,
  type Stay,
  type Trip,
} from './schema'

export type Origin = { code: string; name: string; lat: number; lon: number }

/** A validated research set with lookup tables. Trips that reference missing records are dropped and reported. */
export type Model = {
  id: string
  source: 'published' | 'file'
  fileName: string
  set: ResearchSet
  trips: Trip[]
  legById: Map<string, Leg>
  stayById: Map<string, Stay>
  destByCode: Map<string, Destination>
  /** things to do per destination code, in the research set's order */
  activitiesByCity: Map<string, Activity[]>
  origin: Origin
  /** city facts shared by every research set (weather through the year, everyday prices); null if not published */
  places: Places | null
  /** the origin's own prices, for "at home" comparisons */
  home: Place | null
  /** where travellers fly home to: the origin first, then the homes a traveller can pick instead */
  homes: Home[]
  /** names of the airports travellers fly home to (the origin's and the other homes') */
  airportNames: Map<string, string>
  /** where those airports are, for the map */
  airportPoints: Map<string, { code: string; name: string; lat: number; lon: number }>
  issues: string[]
}

const KNOWN_ORIGINS: Record<string, Omit<Origin, 'code'>> = {
  TRD: { name: 'Trondheim Værnes', lat: 63.4578, lon: 10.924 },
  OSL: { name: 'Oslo Gardermoen', lat: 60.1976, lon: 11.1004 },
  BGO: { name: 'Bergen Flesland', lat: 60.2934, lon: 5.2181 },
}

/**
 * Destinations with the shared city facts filled in: weather for the set's travel window (with its flexible days) and
 * everyday prices. A set's own climate is kept where places.json has none.
 */
function withPlaces(set: ResearchSet, places: Places | null): Destination[] {
  if (!places) return set.destinations
  return set.destinations.map((d) => {
    const place = places.cities[d.code]
    if (!place) return { ...d, entryInfo: (d.cc ? places.countries[d.cc] : null) ?? d.entryInfo }
    return {
      ...d,
      climate: placeClimate(place, places, set.meta.window) ?? d.climate,
      prices: place.prices ?? d.prices,
      tips: place.tips ?? d.tips,
      entryInfo: (d.cc ? places.countries[d.cc] : null) ?? d.entryInfo,
    }
  })
}

export function buildModel(raw: unknown, source: Model['source'], fileName: string, places: Places | null = null): Model {
  const parsed = ResearchSetSchema.safeParse(raw)
  if (!parsed.success) {
    const first = parsed.error.issues
      .slice(0, 4)
      .map((i) => `${i.path.join('.') || 'file'}: ${i.message}`)
      .join('; ')
    throw new Error(`This file is not a valid research set (schema v1). ${first}`)
  }
  const set = { ...parsed.data, destinations: withPlaces(parsed.data, places) }
  const legById = new Map(set.legs.map((l) => [l.id, l]))
  const stayById = new Map(set.stays.map((s) => [s.id, s]))
  const destByCode = new Map(set.destinations.map((d) => [d.code, d]))
  const issues: string[] = []
  const trips = set.trips.filter((t) => {
    const missingLegs = t.legs.filter((id) => !legById.has(id)).length
    const missingStops = t.stops.filter((s) => !stayById.has(s.stay) || !destByCode.has(s.city)).length
    if (missingLegs || missingStops) {
      issues.push(`Trip ${t.id} skipped: ${missingLegs} missing leg(s), ${missingStops} missing stay(s) or destination(s)`)
      return false
    }
    return true
  })
  const meta = set.meta
  const known = KNOWN_ORIGINS[meta.origin]
  const origin: Origin = meta.originInfo ?? { code: meta.origin, ...(known ?? { name: meta.origin, lat: 60, lon: 10 }) }
  const id = source === 'file' ? `file:${meta.id}` : meta.id
  const activitiesByCity = new Map<string, Activity[]>()
  for (const a of set.activities) {
    const list = activitiesByCity.get(a.city)
    if (list) list.push(a)
    else activitiesByCity.set(a.city, [a])
  }
  const home = places?.cities[meta.origin] ?? null
  const homes: Home[] = meta.homes?.length ? meta.homes : [{ id: 'origin', name: origin.name, short: origin.name, airport: origin.name, airports: [origin.code] }]
  const airportPoints = new Map([origin, ...(meta.homeAirports ?? [])].map((a) => [a.code, { code: a.code, name: a.name, lat: a.lat, lon: a.lon }]))
  const airportNames = new Map([...airportPoints.values()].map((a) => [a.code, a.name]))
  // a home whose flight is missing from the set is dropped from that trip (the trip then hides when someone goes there)
  for (const t of trips) {
    if (!t.homes) continue
    for (const [h, opt] of Object.entries(t.homes)) if (opt.legs.some((id) => !legById.has(id))) delete t.homes[h]
  }
  return { id, source, fileName, set, trips, legById, stayById, destByCode, activitiesByCity, origin, places, home, homes, airportNames, airportPoints, issues }
}

const base = import.meta.env.BASE_URL

let indexPromise: Promise<SetIndexEntry[]> | null = null

/** The list of published research sets, newest capture first. Cached for the page's lifetime. */
export function loadIndex(): Promise<SetIndexEntry[]> {
  indexPromise ??= fetch(`${base}research/sets.json`)
    .then((r) => {
      if (!r.ok) throw new Error(`Could not load the research index (HTTP ${r.status}). Run "npm run sync".`)
      return r.json()
    })
    .then((j) => z.array(SetIndexEntrySchema).parse(j))
  return indexPromise
}

let placesPromise: Promise<Places | null> | null = null

/** City facts shared by all research sets. Missing or invalid: null, and the app falls back to the set's own data. */
export function loadPlaces(): Promise<Places | null> {
  placesPromise ??= fetch(`${base}research/places.json`)
    .then((r) => (r.ok ? r.json() : null))
    .then((j) => {
      if (!j) return null
      const parsed = PlacesSchema.safeParse(j)
      if (!parsed.success) console.warn('places.json does not match the schema; weather and prices fall back to the research set', parsed.error.issues.slice(0, 3))
      return parsed.success ? parsed.data : null
    })
    .catch(() => null)
  return placesPromise
}

const setPromises = new Map<string, Promise<Model>>()

export function loadSet(entry: SetIndexEntry): Promise<Model> {
  let p = setPromises.get(entry.id)
  if (!p) {
    const raw = fetch(`${base}${entry.file}`).then((r) => {
      if (!r.ok) throw new Error(`Could not load ${entry.file} (HTTP ${r.status}).`)
      return r.json()
    })
    p = Promise.all([raw, loadPlaces()]).then(([set, places]) => buildModel(set, 'published', entry.file, places))
    setPromises.set(entry.id, p)
  }
  return p
}

// Sets opened from a local file live only in this tab.
const localModels = new Map<string, Model>()
const listeners = new Set<() => void>()
let snapshot: Model[] = []

export function addLocalModel(m: Model): void {
  localModels.set(m.id, m)
  snapshot = [...localModels.values()]
  listeners.forEach((l) => l())
}

export function subscribeLocalModels(listener: () => void): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

export function getLocalModels(): Model[] {
  return snapshot
}

export async function readSetFile(file: File): Promise<Model> {
  const text = await file.text()
  let raw: unknown
  try {
    raw = JSON.parse(text)
  } catch {
    throw new Error(`${file.name} is not valid JSON.`)
  }
  return buildModel(raw, 'file', file.name, await loadPlaces())
}
