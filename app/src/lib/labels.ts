// Research files describe inclusions in free text. These rules map them to a short, consistent vocabulary
// so a trip can say "Missing: Checked bag, Breakfast" the same way for every source.

const RULES: [RegExp, string][] = [
  [/overhead bin/i, 'Cabin bag in overhead bin'],
  [/^cabin bag|cabin trolley|10 ?kg cabin|carry-?on/i, 'Cabin bag'],
  [/personal item|small (cabin bag|personal item)|hand luggage|under-?seat/i, 'Personal item'],
  [/checked bag|1 checked/i, 'Checked bag'],
  [/seat (selection|reservation)/i, 'Seat reservation'],
  [/protected connection|separate tickets/i, 'Protected connection'],
  [/same-airport|change airports/i, 'Same-airport connection'],
  [/luggage storage/i, 'Luggage storage'],
  [/^luggage/i, 'Luggage'],
  [/whole place/i, 'Whole place'],
  [/private bathroom/i, 'Private bathroom'],
  [/private room/i, 'Private room'],
  [/kitchen/i, 'Kitchen'],
  [/breakfast/i, 'Breakfast'],
  [/wi-?fi/i, 'Wi-Fi'],
]

// Booking terms the planner said do not matter for this trip: cancellation, refunds, changes.
const IGNORED = /refund|cancell?ation|rebook|change fee|changes? (allowed|for a fee|without)|flexib/i

export function label(raw: string): string {
  for (const [re, text] of RULES) if (re.test(raw)) return text
  const t = raw.trim()
  return t ? t[0].toUpperCase() + t.slice(1) : t
}

/** Normalised, de-duplicated labels with booking-terms noise removed. */
export function labels(raw: string[]): string[] {
  return [...new Set(raw.filter((r) => !IGNORED.test(r)).map(label))]
}

export const ROOM_TYPE: Record<string, string> = {
  entire_home: 'Whole place',
  private_room: 'Private room in a home',
  hostel_private: 'Private room in a hostel',
  hotel_room: 'Hotel room',
}

export const PLATFORM: Record<string, string> = {
  airbnb: 'Airbnb',
  hostelworld: 'Hostelworld',
  booking: 'Booking.com',
}

export const SOURCE: Record<string, string> = {
  'google-flights': 'Google Flights',
  'ryanair-api': 'Ryanair',
  'flixbus-api': 'FlixBus',
  rome2rio: 'Rome2Rio',
  'wizz-api': 'Wizz Air',
  sas: 'SAS',
  'rail-research': "the operator's site",
}

export function modeOf(kind: string): 'flight' | 'train' | 'bus' {
  if (kind === 'bus') return 'bus'
  if (kind.startsWith('train')) return 'train'
  return 'flight'
}

/** Who runs a leg, in words a traveler recognises. Rome2Rio gives route types, not companies. */
export function operatorName(leg: { operator?: string | null; kind: string; source?: string | null }): string {
  const mode = modeOf(leg.kind)
  if (leg.source === 'rome2rio') return `${mode === 'flight' ? 'Flights' : mode === 'train' ? 'Trains' : 'Buses'} (several operators)`
  return leg.operator ?? (mode === 'flight' ? 'Airline not shown' : mode === 'train' ? 'Train' : 'Bus')
}
