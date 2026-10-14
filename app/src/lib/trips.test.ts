import { describe, expect, it } from 'vitest'
import { buildModel } from '../data/model'
import { NO_FILTERS, type Filters } from './filters'
import { evaluateTrip, groupTrips, lateForTrain, legHeadsUp, summarizeDestinations, type Settings } from './trips'

const bags = {
  cabin: { included: true, addEUR: 0, estimate: false, basis: 'fare' },
  checked: { included: false, addEUR: 70, estimate: true, basis: 'KLM fare table' },
  both: { addEUR: 70, estimate: true, basis: 'KLM fare table' },
}
const leg = (id: string, from: string, to: string, price: number, extra: Record<string, unknown> = {}) => ({
  id, kind: 'flight', from, to, fromCity: from, toCity: to, date: '2026-12-07', returnDate: '2026-12-15', roundTrip: true,
  operator: 'KLM', priceEUR: price, includes: [], missing: ['checked bag'], bags, ...extra,
})
const stay = (id: string, city: string, nightly: number, reviews: number) => ({
  id, city, platform: 'airbnb', name: id, roomType: 'entire_home', sleeps: 4, bedrooms: 2, perPerson: false, rating: 4.8,
  ratingScale: 5, reviews, includes: ['kitchen', 'wifi'], missing: ['breakfast'], unitNightlyEUR: nightly, rating5: 4.8,
  adjusted: 4.5, confidence: reviews >= 200 ? 'high' : reviews >= 50 ? 'medium' : 'low',
})
const trip = (id: string, legs: string[], stays: string[], start = '2026-12-07', end = '2026-12-15', alts: string[][] = []) => ({
  id, kind: 'single', start, end, nights: 8,
  stops: [{ city: 'KRK', stay: stays[0], nights: 8, checkin: start, checkout: end, altStays: stays.slice(1) }],
  legs, legAlternatives: alts, transportPP: 0, transitMin: 0, ppEstimate: {}, weakestAdjusted: 4.5,
})

const raw = {
  schema: 1,
  meta: {
    id: 'test', title: 'Test', origin: 'TRD', window: { start: '2026-12-07', end: '2026-12-15', flexDays: 3 },
    party: { min: 2, max: 6, default: 3 }, capturedAt: '2026-10-11', prior: { reviews: 40, mean: 4.2 },
  },
  destinations: [{ code: 'KRK', name: 'Kraków', lat: 50.06, lon: 19.94, airports: [], schengen: true }],
  legs: [leg('L1', 'TRD', 'KRK', 200), leg('L2', 'TRD', 'KRK', 150, { fareType: 'youth', operator: 'SAS' }), leg('L3', 'TRD', 'KRK', 180, { date: '2026-12-05', returnDate: '2026-12-13' })],
  stays: [stay('S1', 'KRK', 80, 300), stay('S2', 'KRK', 60, 12)],
  trips: [trip('T1', ['L2'], ['S1', 'S2'], '2026-12-07', '2026-12-15', [['L1']]), trip('T2', ['L3'], ['S1', 'S2'], '2026-12-05', '2026-12-13'), trip('broken', ['nope'], ['S1'])],
}

const base: Settings = { n: 4, rooms: 'share', sort: 'price', youth: true, bags: { cabin: false, checked: false }, transfer: 'cheapest', eat: 'off', home: {}, f: NO_FILTERS }
const withF = (f: Partial<Filters>): Settings => ({ ...base, f: { ...NO_FILTERS, ...f } })

describe('research model', () => {
  it('drops trips that reference missing records and reports them', () => {
    const m = buildModel(raw, 'published', 'test.json')
    expect(m.trips.map((t) => t.id)).toEqual(['T1', 'T2'])
    expect(m.issues).toHaveLength(1)
  })
  it('rejects files that are not research sets', () => {
    expect(() => buildModel({ hello: 1 }, 'file', 'x.json')).toThrow(/not a valid research set/)
  })
})

describe('evaluateTrip', () => {
  const m = buildModel(raw, 'published', 'test.json')
  it('picks the cheapest stay for the party and adds transport', () => {
    const e = evaluateTrip(m, m.trips[0], base)!
    expect(e.stops[0].chosen.stay.id).toBe('S2')
    expect(e.totalPP).toBe(150 + (60 / 4) * 8)
    expect(e.missing).toContain('Checked bag')
    expect(e.headsUp.map((h) => h.kind)).toEqual(expect.arrayContaining(['youth', 'reviews']))
  })
  it('avoids stays with too few reviews when asked', () => {
    const e = evaluateTrip(m, m.trips[0], withF({ minReviews: 50 }))!
    expect(e.stops[0].chosen.stay.id).toBe('S1')
    expect(e.stops[0].options.map((o) => o.stay.id)).toEqual(['S1'])
  })
  it('takes the cheapest stay that meets the rating bar instead of dropping the trip', () => {
    // S1 (300 reviews) adjusts to about 4.73, S2 (12 reviews) to about 4.34
    const e = evaluateTrip(m, m.trips[0], withF({ minRating: 4.6 }))!
    expect(e.stops[0].chosen.stay.id).toBe('S1')
    expect(evaluateTrip(m, m.trips[0], withF({ minRating: 4.8 }))).toBeNull()
  })
  it('swaps a leg that breaks a transport filter for an alternative that passes', () => {
    const e = evaluateTrip(m, m.trips[0], withF({ avoidOps: ['SAS'] }))!
    expect(e.legs[0].leg.id).toBe('L1')
    expect(evaluateTrip(m, m.trips[1], withF({ avoidOps: ['KLM'] }))).toBeNull()
  })
  it('adds bag fees on legs whose fare lacks the bags and drops them from Missing', () => {
    const e = evaluateTrip(m, m.trips[0], { ...base, youth: false, bags: { cabin: false, checked: true } })!
    expect(e.bagsPP).toBe(70)
    expect(e.totalPP).toBe(200 + 70 + (60 / 4) * 8)
    expect(e.missing).not.toContain('Checked bag')
    expect(e.included).toContain('Checked bag on every leg')
  })
  it('swaps a youth fare for the adult alternative when youth fares are off', () => {
    const e = evaluateTrip(m, m.trips[0], { ...base, youth: false })!
    expect(e.legs[0].leg.id).toBe('L1')
    expect(e.youthFare).toBe(false)
  })
})

describe('groupTrips', () => {
  const m = buildModel(raw, 'published', 'test.json')
  it('groups by city sequence and reports the saving against the planned dates', () => {
    const evals = m.trips.map((t) => evaluateTrip(m, t, { ...base, youth: false })!)
    const groups = groupTrips(evals, 'price', m.set.meta.window)
    expect(groups).toHaveLength(1)
    expect(groups[0].best.trip.id).toBe('T2')
    expect(groups[0].savingVsWindow).toBe(20)
    expect(summarizeDestinations(groups).get('KRK')?.groupKey).toBe('KRK')
  })
})

describe('legHeadsUp', () => {
  const base = { id: 'x', kind: 'flight', from: 'TRD', to: 'GDN', fromCity: 'TRD', toCity: 'GDN', priceEUR: 50, includes: [], missing: [] }
  const make = (extra: Record<string, unknown>) => ({ ...base, ...extra }) as unknown as Parameters<typeof legHeadsUp>[0]
  it('names an overnight layover from the flight notes', () => {
    const l = make({ durationMin: 1100, overnight: true, notes: 'layover 9.5 h at Oslo lufthavn overnight; layover 1 h at Frankfurt Airport' })
    expect(legHeadsUp(l, 'Trondheim', 'Agadir')).toBe('Long transfer: Trondheim to Agadir takes 18 h with an overnight layover at Oslo lufthavn')
  })
  it('says a short evening flight lands after midnight instead of calling it an overnight stop', () => {
    const l = make({ durationMin: 230, overnight: true, depTime: '21:10', arrTime: '00:40', notes: 'nonstop' })
    expect(legHeadsUp(l, 'Trondheim', 'Gdańsk')).toBe('Trondheim to Gdańsk lands after midnight, at 00:40')
  })
  it('calls a night bus a night journey and leaves short daytime legs alone', () => {
    expect(legHeadsUp(make({ kind: 'bus', durationMin: 485, overnight: true, notes: 'departs 20:55, arrives 05:00' }), 'Copenhagen', 'Berlin')).toBe(
      'Copenhagen to Berlin travels through the night (8 h)',
    )
    expect(legHeadsUp(make({ durationMin: 150, overnight: false }), 'Trondheim', 'Gdańsk')).toBeNull()
    expect(legHeadsUp(make({ durationMin: 720, overnight: false }), 'Trondheim', 'Bangkok')).toBe('Long transfer: Trondheim to Bangkok takes 12 h')
  })
})

describe('flying home elsewhere', () => {
  const ow = (id: string, from: string, to: string, price: number, date: string) => leg(id, from, to, price, { roundTrip: false, returnDate: null, date })
  const homeRaw = {
    ...raw,
    meta: {
      ...raw.meta,
      homes: [
        { id: 'trondheim', name: 'Trondheim', short: 'Værnes', airport: 'Værnes', airports: ['TRD'] },
        { id: 'stavanger', name: 'Stavanger', short: 'Sola', airport: 'Sola', airports: ['SVG'] },
        { id: 'tonsberg', name: 'Tønsberg', airport: 'Torp, or Oslo + train', airports: ['TRF', 'OSL'] },
      ],
      homeAirports: [
        { code: 'SVG', name: 'Stavanger Sola', lat: 58.88, lon: 5.64 },
        { code: 'OSL', name: 'Oslo Gardermoen', lat: 60.19, lon: 11.1 },
      ],
    },
    legs: [
      ...raw.legs,
      ow('O1', 'TRD', 'KRK', 90, '2026-12-07'),
      ow('B1', 'KRK', 'TRD', 110, '2026-12-15'),
      // a taxi to the airport at EUR 40 a car: shared by the whole group on the flight back, by one person flying to Sola
      { ...ow('H1', 'KRK', 'SVG', 60, '2026-12-15'), transfers: [{ where: 'KRK', kind: 'airport', public: null, taxi: { eurPerCar: 40, min: 25, capacity: 4 } }] },
      ow('H2', 'KRK', 'SVG', 80, '2026-12-15'),
    ],
    trips: [
      { ...trip('OW', ['O1', 'B1'], ['S1']), homes: { stavanger: { legs: ['H1'], alts: ['H2'] } } },
      { ...trip('RT', ['L1'], ['S1']), homes: { stavanger: { legs: ['O1', 'H1'], alts: [] } } },
    ],
  }
  const m = buildModel(homeRaw, 'published', 'homes.json')
  const t = (id: string) => m.trips.find((x) => x.id === id)!

  it('prices each home and gives the group average', () => {
    const e = evaluateTrip(m, t('OW'), { ...base, home: { stavanger: 1 } })!
    expect(e.split).toBe(true)
    expect(e.homes.map((h) => [h.home.id, h.count])).toEqual([['trondheim', 3], ['stavanger', 1]])
    const [vaernes, sola] = e.homes
    expect(vaernes.totalPP - sola.totalPP).toBeCloseTo(50 - 40)
    expect(e.totalPP).toBeCloseTo((3 * vaernes.totalPP + sola.totalPP) / 4)
    expect(e.groupTotal).toBeCloseTo(3 * vaernes.totalPP + sola.totalPP)
    expect(e.legs.map((l) => l.leg.id)).toEqual(['O1', 'B1'])
    expect(sola.own.map((l) => l.leg.id)).toEqual(['H1'])
  })
  it('shares an airport taxi only among those on the flight', () => {
    const one = evaluateTrip(m, t('OW'), { ...base, home: { stavanger: 1 } })!
    expect(one.homes[1].own[0].price.transferEUR).toBeCloseTo(40)
    const all = evaluateTrip(m, t('OW'), { ...base, home: { stavanger: 4 } })!
    expect(all.homes[0].own[0].price.transferEUR).toBeCloseTo(10)
  })
  it('books one-ways instead of a round trip, and hides a route with no flight home that day', () => {
    const e = evaluateTrip(m, t('RT'), { ...base, home: { stavanger: 1 } })!
    expect(e.homes[1].legs.map((l) => l.leg.id)).toEqual(['O1', 'H1'])
    expect(evaluateTrip(m, t('OW'), { ...base, home: { tonsberg: 1 } })).toBeNull()
  })
  it('lists the legs of the home most of the group flies to', () => {
    const e = evaluateTrip(m, t('OW'), { ...base, n: 2, home: { stavanger: 2 } })!
    expect(e.split).toBe(false)
    expect(e.mainHome.home.id).toBe('stavanger')
    expect(e.legs.map((l) => l.leg.id)).toEqual(['O1', 'H1'])
  })
  it('warns when a flight home lands after the last train onward', () => {
    const train = { where: 'OSL', kind: 'airport', public: { eur: 18.7, min: 106, mode: 'train', line: 'Vy RE11', hours: '05:13–23:13' }, taxi: null }
    const osl = (arrTime: string, arrDate = '2026-12-15') => ({ ...ow('X', 'KRK', 'OSL', 50, '2026-12-15'), arrTime, arrDate, transfers: [train] })
    const m2 = buildModel({ ...homeRaw, legs: [...homeRaw.legs, osl('22:10')] }, 'published', 'x.json')
    const priced = (leg: ReturnType<typeof osl>) => {
      const l = m2.legById.get('X')!
      return { leg: { ...l, ...leg }, index: 0, travelDate: null, costPP: 0, minutes: 0, alternatives: [], price: { transfers: [{ transfer: train, how: 'public', eur: 18.7, min: 106 }] } } as never
    }
    expect(lateForTrain(m2, priced(osl('22:10')))).toBeNull()
    expect(lateForTrain(m2, priced(osl('23:05')))).toBe('Oslo Gardermoen: lands at 23:05, after the last Vy RE11 (23:13); the first one leaves at 05:13.')
    expect(lateForTrain(m2, priced(osl('00:40', '2026-12-16')))).toContain('the next day')
  })
  it('lets the viewer pick another flight home', () => {
    const e = evaluateTrip(m, t('OW'), { ...base, home: { stavanger: 1 } }, { homes: { stavanger: 'H2' } })!
    expect(e.homes[1].own[0].leg.id).toBe('H2')
    expect(e.homes[1].own[0].alternatives.map((l) => l.id)).toEqual(['H1'])
  })
})
