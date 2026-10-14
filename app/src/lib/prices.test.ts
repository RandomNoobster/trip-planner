import { describe, expect, it } from 'vitest'
import type { CityPrices } from '../data/schema'
import { dailySpend, indexBand, money } from './prices'

const prices: CityPrices = {
  items: { mealCheap: { eur: 10, src: 'numbeo' }, mealMid2: { eur: 50, src: 'numbeo' }, beerBar: { eur: 4, src: 'livingcost' } },
  sources: [],
  beerIndex: 80,
  foodIndex: 90,
  foodDayEUR: 38,
}

describe('dailySpend', () => {
  it('prices each plan from the city prices', () => {
    expect(dailySpend(prices, 'off')).toBeNull()
    expect(dailySpend(prices, 'meals')).toBe(20)
    expect(dailySpend(prices, 'beers')).toBe(32)
    expect(dailySpend(prices, 'dine')).toBe(10 + 25 + 12)
  })

  it('gives up when a needed price is missing', () => {
    expect(dailySpend({ ...prices, items: { mealCheap: prices.items.mealCheap } }, 'beers')).toBeNull()
    expect(dailySpend(null, 'meals')).toBeNull()
  })
})

describe('formatting and bands', () => {
  it('keeps cents under €10 and calls 0 free', () => {
    expect(money(2.8)).toBe('€2.80')
    expect(money(14.4)).toBe('€14')
    expect(money(0)).toBe('free')
  })

  it('bands indices around the median of 100', () => {
    expect(indexBand(60).word).toBe('Cheap')
    expect(indexBand(100).word).toBe('Average')
    expect(indexBand(240).word).toBe('Very pricey')
  })
})
