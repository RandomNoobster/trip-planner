import type { CityPrices, PriceItem } from '../data/schema'

export const PRICE_LABEL: Record<PriceItem, string> = {
  beerBar: 'Beer in a bar',
  beerShop: 'Beer from a shop',
  mealCheap: 'Cheap meal out',
  mealMid2: 'Mid-range dinner',
  fastFood: 'Fast-food meal',
  cappuccino: 'Cappuccino',
  transit: 'Bus or metro ticket',
  wine: 'Bottle of wine (shop)',
}

/** "€2.83" under €10, "€14" above: small prices need their cents to compare. */
export function money(v: number): string {
  if (v === 0) return 'free'
  return v < 10 ? `€${v.toFixed(2)}` : `€${Math.round(v)}`
}

/** Price bands for the indices (100 = the median destination), shared by the map, the legend and the city views. */
export const INDEX_BANDS = [
  { below: 75, word: 'Cheap', color: '#0E7C86' },
  { below: 92, word: 'Below average', color: '#3F9A72' },
  { below: 110, word: 'Average', color: '#C98C14' },
  { below: 150, word: 'Pricey', color: '#CF5530' },
  { below: Infinity, word: 'Very pricey', color: '#8E2A20' },
] as const

export function indexBand(ix: number) {
  return INDEX_BANDS.find((b) => ix < b.below) ?? INDEX_BANDS[INDEX_BANDS.length - 1]
}

/** What the group eats and drinks each day, to estimate food and drink for a trip. */
export type EatPlan = 'off' | 'meals' | 'beers' | 'dine'
export const EAT_PLANS: EatPlan[] = ['off', 'meals', 'beers', 'dine']
/** used to show an estimate when food and drink are not counted in the price */
export const REFERENCE_PLAN: Exclude<EatPlan, 'off'> = 'beers'
/** for the setup select, where space is tight */
export const EAT_PLAN_SHORT: Record<EatPlan, string> = {
  off: 'Not counted',
  meals: '2 meals a day',
  beers: '2 meals + 3 beers',
  dine: 'Dinner out + 3 beers',
}
export const EAT_PLAN_LABEL: Record<EatPlan, string> = {
  off: 'Not in the price',
  meals: '2 cheap meals a day',
  beers: '2 cheap meals + 3 beers a day',
  dine: 'Cheap lunch, nicer dinner + 3 beers',
}

/** One person's food and drink for a day in a city under a plan, or null when the city lacks the prices. */
export function dailySpend(p: CityPrices | null | undefined, plan: EatPlan): number | null {
  if (!p || plan === 'off') return null
  const cheap = p.items.mealCheap?.eur
  const beer = p.items.beerBar?.eur
  const mid = p.items.mealMid2?.eur
  if (cheap == null) return null
  if (plan === 'meals') return 2 * cheap
  if (beer == null) return null
  if (plan === 'beers') return 2 * cheap + 3 * beer
  return mid == null ? null : cheap + mid / 2 + 3 * beer
}
