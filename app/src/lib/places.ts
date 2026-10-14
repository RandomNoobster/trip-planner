import type { Activity, ActivityCategory, Climate } from '../data/schema'
import type { IconName } from '../components/Icon'
import { DRY_SHARE } from './filters'
import { eur } from './format'

/** Daytime-high bands shared by the weather words, the map colours and the legend. */
export const TEMP_BANDS = [
  { below: 3, word: 'Freezing', color: '#2B5CB0' },
  { below: 8, word: 'Cold', color: '#4A90C2' },
  { below: 13, word: 'Cool', color: '#3F9A72' },
  { below: 17, word: 'Mild', color: '#C98C14' },
  { below: 26, word: 'Warm', color: '#CF5530' },
  { below: Infinity, word: 'Hot', color: '#9C1F3A' },
] as const

/** Rounded degrees with a real minus sign: "−3°". */
export function degrees(v: number): string {
  const r = Math.round(v)
  return `${r < 0 ? '−' : ''}${Math.abs(r)}°`
}

export function tempBand(highC: number) {
  return TEMP_BANDS.find((b) => highC < b.below) ?? TEMP_BANDS[TEMP_BANDS.length - 1]
}

/** "Cold, often wet and grey" from the averages. */
export function climateWords(c: Climate): string {
  const extras: string[] = []
  if (c.snowShare >= 0.1) extras.push('snow likely')
  if (c.wetShare >= 0.45) extras.push('often wet')
  else if (c.wetShare <= DRY_SHARE) extras.push('mostly dry')
  if ((c.sunH ?? 0) <= 2) extras.push('grey')
  else if ((c.sunH ?? 0) >= 6) extras.push('sunny')
  const word = tempBand(c.highC).word
  if (!extras.length) return word
  return `${word}, ${extras.length === 1 ? extras[0] : `${extras.slice(0, -1).join(', ')} and ${extras[extras.length - 1]}`}`
}

export const CATEGORY: Record<ActivityCategory, { label: string; icon: IconName }> = {
  event: { label: 'December events', icon: 'sparkle' },
  sight: { label: 'Sights', icon: 'eye' },
  museum: { label: 'Museums', icon: 'museum' },
  food: { label: 'Food', icon: 'food' },
  nightlife: { label: 'Nightlife', icon: 'glass' },
  experience: { label: 'Experiences', icon: 'compass' },
}

/** "€12 · €6 student", "Free" or "Price not listed". */
export function activityPrice(a: Activity): string {
  const fmt = (v: number) => (v < 10 && v % 1 ? `€${v.toFixed(1)}` : eur(v))
  if (a.priceEUR === 0) return 'Free'
  if (a.priceEUR == null) return a.studentEUR != null ? `${fmt(a.studentEUR)} student` : 'Price not listed'
  return a.studentEUR != null ? `${fmt(a.priceEUR)} · ${a.studentEUR === 0 ? 'free' : fmt(a.studentEUR)} student` : fmt(a.priceEUR)
}
