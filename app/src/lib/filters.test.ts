import { describe, expect, it } from 'vitest'
import type { Leg } from '../data/schema'
import { carriers, describeFilters, legPasses, NO_FILTERS, readFilters, weatherPasses, writeFilters, type Filters } from './filters'

const f = (patch: Partial<Filters>): Filters => ({ ...NO_FILTERS, ...patch })
const leg = (patch: Partial<Leg>): Leg =>
  ({ id: 'x', kind: 'flight', fromCity: 'TRD', toCity: 'KRK', priceEUR: 100, roundTrip: false, overnight: false, fareType: 'adult', includes: [], missing: [], transfers: [], estimated: false, ...patch }) as Leg

describe('filters in the URL', () => {
  it('round-trips every filter and leaves defaults out', () => {
    const all = f({
      maxPrice: 450, minRating: 4.6, minReviews: 50, cities: [2, 1], maxLegH: 6, modes: ['train', 'flight'], maxStops: 1,
      avoidOps: ['Ryanair', 'Wizz Air'], exactOnly: true, stayKinds: ['whole'], needs: ['kitchen'], starts: ['2026-12-07'], ends: ['2026-12-15'],
      nights: [8], schengenOnly: true, avoidCountries: ['GB'], minHighC: 10, dry: true, sunny: true, city: 'KRK',
      maxCentreKm: 2, whatsOn: ['xmas'], maxBeer: 4, maxFoodIx: 80,
    })
    const p = new URLSearchParams()
    writeFilters(p, all)
    expect(readFilters(p)).toEqual({ ...all, cities: [1, 2], modes: ['flight', 'train'], avoidOps: ['Ryanair', 'Wizz Air'] })
    const empty = new URLSearchParams()
    writeFilters(empty, NO_FILTERS)
    expect(empty.toString()).toBe('')
  })
  it('reads links from the first version', () => {
    expect(readFilters(new URLSearchParams('route=single&hideLow=1'))).toMatchObject({ cities: [1], minReviews: 50 })
    expect(readFilters(new URLSearchParams('route=multi')).cities).toEqual([2, 3])
  })
})

describe('leg rules', () => {
  it('treats overnight or long legs as failing a duration limit', () => {
    expect(legPasses(leg({ durationMin: 9 * 60 }), f({ maxLegH: 10 }), true)).toBe(true)
    expect(legPasses(leg({ durationMin: 10 * 60 }), f({ maxLegH: 10 }), true)).toBe(false)
    expect(legPasses(leg({ durationMin: 120, overnight: true }), f({ maxLegH: 10 }), true)).toBe(false)
    expect(legPasses(leg({ durationMin: 120, durationBackMin: 700, roundTrip: true }), f({ maxLegH: 10 }), true)).toBe(false)
  })
  it('splits joint operators and matches skipped companies', () => {
    const l = leg({ operator: 'Wideroe and Lufthansa' })
    expect(carriers(l)).toEqual(['Widerøe', 'Lufthansa'])
    expect(legPasses(l, f({ avoidOps: ['Lufthansa'] }), true)).toBe(false)
    expect(legPasses(leg({ kind: 'train+bus' }), f({ modes: ['train'] }), true)).toBe(false)
    expect(legPasses(leg({ stops: 2 }), f({ maxStops: 1 }), true)).toBe(false)
    expect(legPasses(leg({ fareType: 'youth' }), NO_FILTERS, false)).toBe(false)
  })
})

describe('weather and chips', () => {
  const c = { highC: 12, lowC: 6, wetShare: 0.4, snowShare: 0, frostShare: 0, sunH: 5.5 }
  it('applies warmth, dryness and sun', () => {
    expect(weatherPasses(c, f({ minHighC: 10, sunny: true }))).toBe(true)
    expect(weatherPasses(c, f({ dry: true }))).toBe(false)
    expect(weatherPasses(null, f({ minHighC: 5 }))).toBe(false)
    expect(weatherPasses(null, NO_FILTERS)).toBe(true)
  })
  it('describes active filters as removable chips', () => {
    const chips = describeFilters(f({ city: 'KRK', maxLegH: 10, avoidOps: ['Ryanair'], maxBeer: 4 }), { city: () => 'Kraków', country: (cc) => cc })
    expect(chips.map((x) => x.label)).toEqual(['Through Kraków', 'Legs under 10 h, none overnight', 'No Ryanair', 'Beer up to €4 everywhere'])
    expect(chips[2].patch).toEqual({ avoidOps: [] })
  })
})
