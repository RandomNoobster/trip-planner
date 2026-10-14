import type { IconName } from '../components/Icon'
import type { HeadsUpKind } from './trips'

/*
 * The app's visual canon: one icon per idea and one meaning per colour, used the same way on the route cards, the
 * route page, the comparison, the filters and the map.
 *
 * Colours mean a judgment, never a category: teal is good (cheaper, central, included, best in a comparison), amber
 * is worth a check (heads-ups, few reviews, estimates, far from the centre), rust is missing or poor. Blue is what you
 * can click, and the open route. Temperatures keep their own cold-to-hot scale, always beside a thermometer, and each
 * compared route has its own letter and colour.
 */

export const ICON = {
  price: 'tag',
  fares: 'ticket',
  bags: 'bag',
  transfers: 'transfer',
  transport: 'route',
  stays: 'bed',
  food: 'food',
  beer: 'beer',
  entry: 'passport',
  time: 'clock',
  nights: 'moon',
  dates: 'calendar',
  rating: 'star',
  centre: 'walk',
  city: 'pin',
  /** where a traveller flies home to */
  home: 'home',
  weather: 'thermo',
  events: 'sparkle',
  headsUp: 'warn',
  missing: 'x',
  included: 'check',
  saving: 'down',
  compare: 'compare',
} as const satisfies Record<string, IconName>

export const MODE_ICON = { flight: 'plane', train: 'train', bus: 'bus' } as const satisfies Record<string, IconName>

export type Tone = 'good' | 'caution' | 'bad'

/** A heads-up is always amber; its icon says what it is about. */
export const HEADS_UP_ICON: Record<HeadsUpKind, IconName> = {
  long: 'clock',
  entry: 'passport',
  estimate: 'tag',
  range: 'tag',
  youth: 'users',
  reviews: 'star',
  date: 'calendar',
  bags: 'bag',
  transfer: 'transfer',
}

/** Few reviews make a rating less certain: amber under 200 reviews, rust under 50 (pricing.confidence). */
export function confidenceTone(level: 'high' | 'medium' | 'low'): Tone | null {
  return level === 'high' ? null : level === 'medium' ? 'caution' : 'bad'
}

/** A price index against the median destination (100), in the map's bands: cheap is good, pricey worth a check. */
export function priceTone(index: number | null | undefined): Tone | null {
  if (index == null) return null
  return index < 92 ? 'good' : index < 110 ? null : index < 150 ? 'caution' : 'bad'
}

/**
 * Compared routes: a letter and a colour each, the same on the cards, the tray, the table and the map. The colours
 * stay clear of teal, amber and rust, which already mean good, check and poor.
 */
export const COMPARE_COLORS = ['#1B4FD8', '#7C3AED', '#DB2777', '#EA580C', '#0891B2', '#4D7C0F']
export const COMPARE_MAX = COMPARE_COLORS.length
export const compareLetter = (slot: number) => String.fromCharCode(65 + slot)
export const compareColor = (slot: number) => COMPARE_COLORS[slot % COMPARE_COLORS.length]

/** A colour mixed toward white, so the scales drawn for light backgrounds still read on the dark map. */
export function lift(hex: string, amount = 0.28): string {
  const n = parseInt(hex.slice(1), 16)
  const ch = [n >> 16, (n >> 8) & 255, n & 255].map((c) => Math.round(c + (255 - c) * amount))
  return `#${ch.map((c) => c.toString(16).padStart(2, '0')).join('')}`
}
