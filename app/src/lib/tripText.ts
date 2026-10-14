import { plural } from './format'
import { modeOf, operatorName } from './labels'
import type { EvalTrip } from './trips'

export function cardId(key: string): string {
  return `trip-${key.replace(/[^A-Za-z0-9]/g, '-')}`
}

/** "2 flights, 1 bus" */
export function legsSummary(t: EvalTrip): string {
  const counts = { flight: 0, train: 0, bus: 0 }
  t.legs.forEach((l) => counts[modeOf(l.leg.kind)]++)
  return [
    counts.flight && plural(counts.flight, 'flight'),
    counts.train && plural(counts.train, 'train'),
    counts.bus && plural(counts.bus, 'bus', 'buses'),
  ]
    .filter(Boolean)
    .join(', ')
}

/** "Norwegian · FlixBus · KLM" */
export function operatorsOf(t: EvalTrip): string {
  const ops = t.legs.map((l) => operatorName(l.leg))
  return [...new Set(ops)].join(' · ')
}
