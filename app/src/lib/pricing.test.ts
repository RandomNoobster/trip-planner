import { describe, expect, it } from 'vitest'
import type { Leg, LegTransfer, Stay } from '../data/schema'
import { adjustedRating, bagCharge, confidence, legFare, priceLeg, stayNightPP, transferChoice } from './pricing'

function stay(over: Partial<Stay>): Stay {
  return {
    id: 's1', city: 'KRK', platform: 'airbnb', name: 'Flat', typeTitle: null, roomType: 'entire_home', sleeps: 4, bedrooms: 2,
    beds: 3, baths: 1, checkin: '2026-12-07', checkout: '2026-12-15', nights: 8, totalEUR: 800, nightlyEUR: 100, perPerson: false,
    rating: 4.8, ratingScale: 5, reviews: 120, url: null, includes: [], missing: [], capturedAt: null, notes: null,
    unitNightlyEUR: 100, rating5: 4.8, adjusted: 4.6, confidence: 'medium', ...over,
  }
}

describe('stayNightPP', () => {
  it('splits a whole place across the group when sharing', () => {
    expect(stayNightPP(stay({}), 4, 'share').pp).toBe(25)
    expect(stayNightPP(stay({}), 5, 'share')).toMatchObject({ units: 2, pp: 40 })
  })

  it('gives everyone a bedroom when they want their own room', () => {
    // 2 bedrooms per place: 3 people need 2 places
    expect(stayNightPP(stay({}), 3, 'own')).toMatchObject({ units: 2, pp: (2 * 100) / 3 })
  })

  it('prices hostel private rooms per head when sharing and per room when alone', () => {
    const hostel = stay({ platform: 'hostelworld', roomType: 'hostel_private', perPerson: true, sleeps: 2, unitNightlyEUR: 40 })
    expect(stayNightPP(hostel, 3, 'share')).toMatchObject({ units: 2, pp: 80 / 3 })
    expect(stayNightPP(hostel, 3, 'own').pp).toBe(40)
  })
})

describe('adjustedRating', () => {
  const prior = { reviews: 40, mean: 4.2 }
  it('ranks a well-reviewed 4.6 above a thinly reviewed 4.9', () => {
    expect(adjustedRating(4.6, 1240, prior)).toBeGreaterThan(adjustedRating(4.9, 12, prior))
  })
  it('falls back to the prior mean without a rating', () => {
    expect(adjustedRating(null, 0, prior)).toBe(4.2)
  })
  it('bands confidence by review count', () => {
    expect([confidence(10), confidence(50), confidence(200)]).toEqual(['low', 'medium', 'high'])
  })
})

const airport: LegTransfer = {
  where: 'KRK', kind: 'airport', place: 'KRK',
  public: { eur: 4, min: 18, mode: 'train', to: 'Kraków Główny', hours: null },
  taxi: { eurPerCar: 24, min: 25, capacity: 4, basis: 'Bolt' },
}

describe('transferChoice', () => {
  it('takes public transport for small groups and a shared taxi when it is cheaper per head', () => {
    expect(transferChoice(airport, 2, 'cheapest')).toMatchObject({ how: 'public', eur: 4 })
    expect(transferChoice({ ...airport, taxi: { ...airport.taxi!, eurPerCar: 12 } }, 4, 'cheapest')).toMatchObject({ how: 'taxi', eur: 3 })
  })
  it('needs two cars for five people', () => {
    expect(transferChoice(airport, 5, 'taxi').eur).toBeCloseTo((2 * 24) / 5)
  })
})

describe('bagCharge and priceLeg', () => {
  const leg = {
    id: 'L', kind: 'flight', fromCity: 'TRD', toCity: 'KRK', priceEUR: 50, roundTrip: false, overnight: false, fareType: 'adult',
    includes: [], missing: [], estimated: false, durationMin: 140,
    bags: {
      cabin: { included: false, addEUR: 15, estimate: true, basis: 'Ryanair fee table' },
      checked: { included: false, addEUR: 30, estimate: true, basis: 'Ryanair fee table' },
      both: { addEUR: 42, estimate: true, basis: 'Ryanair fee table' },
    },
    transfers: [airport],
  } as unknown as Leg
  it('charges nothing for a personal item, and the bundle price for both bags', () => {
    expect(bagCharge(leg, { cabin: false, checked: false }).eur).toBe(0)
    expect(bagCharge(leg, { cabin: true, checked: false }).eur).toBe(15)
    expect(bagCharge(leg, { cabin: true, checked: true }).eur).toBe(42)
  })
  it('adds fare, bags and transfers door to door', () => {
    const p = priceLeg(leg, { n: 2, bags: { cabin: true, checked: false }, transfer: 'cheapest' })
    expect(p.total).toBe(50 + 15 + 4)
    expect(p.minutes).toBe(140 + 18)
  })
})

describe('legFare', () => {
  const ferry = { id: 'F', priceEUR: 49.9, cabin: { eur: 99, berths: 4, perPersonEUR: 16.9, name: null } } as unknown as Leg
  it('splits a ferry cabin within the party and adds the per-person surcharge', () => {
    expect(legFare(ferry, 4).eur).toBeCloseTo(99 / 4 + 16.9)
    expect(legFare(ferry, 1).eur).toBeCloseTo(99 + 16.9)
    expect(legFare(ferry, 5)).toEqual({ eur: (2 * 99) / 5 + 16.9, note: '2 cabins for up to 4' })
  })
  it('books a cabin each with own rooms, and leaves other legs at their fare', () => {
    expect(legFare(ferry, 3, 'own').eur).toBeCloseTo(99 + 16.9)
    expect(legFare({ priceEUR: 20 } as unknown as Leg, 3)).toEqual({ eur: 20, note: null })
  })
})
