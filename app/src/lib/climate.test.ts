import { describe, expect, it } from 'vitest'
import type { ClimatePeriod } from '../data/schema'
import { climateBetween, periodIndex } from './climate'

const period = (highC: number, wetShare: number): ClimatePeriod => ({
  highC,
  lowC: highC - 5,
  highP10: null,
  highP90: null,
  wetShare,
  precipMm: null,
  snowShare: 0,
  frostShare: 0,
  sunH: 2,
  daylightH: 7,
  windKmh: null,
  days: 150,
})

describe('periodIndex', () => {
  it('splits each month at the 15th', () => {
    expect(periodIndex('2026-01-01')).toBe(0)
    expect(periodIndex('2026-01-15')).toBe(0)
    expect(periodIndex('2026-01-16')).toBe(1)
    expect(periodIndex('2026-12-04')).toBe(22)
    expect(periodIndex('2026-12-31')).toBe(23)
  })
})

describe('climateBetween', () => {
  const periods: (ClimatePeriod | null)[] = Array.from({ length: 24 }, () => null)
  periods[22] = period(6, 0.4)
  periods[23] = period(3, 0.2)

  it('weights each half month by the days that fall in it', () => {
    // 4–18 Dec: 12 days in the first half, 3 in the second
    const c = climateBetween(periods, '2026-12-04', '2026-12-18')!
    expect(c.highC).toBeCloseTo((6 * 12 + 3 * 3) / 15, 1)
    expect(c.wetShare).toBeCloseTo((0.4 * 12 + 0.2 * 3) / 15, 2)
    expect(c.sunH).toBe(2)
  })

  it('uses only the half months it has data for, and null when none', () => {
    expect(climateBetween(periods, '2026-11-25', '2026-12-05')!.highC).toBe(6)
    expect(climateBetween(periods, '2026-06-01', '2026-06-10')).toBeNull()
  })
})
