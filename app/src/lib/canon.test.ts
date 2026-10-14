import { describe, expect, it } from 'vitest'
import { COMPARE_COLORS, COMPARE_MAX, compareColor, compareLetter, confidenceTone, priceTone } from './canon'

describe('canon', () => {
  it('reads a price index in the map bands: cheap good, average plain, pricey a check, very pricey poor', () => {
    expect(priceTone(70)).toBe('good')
    expect(priceTone(91)).toBe('good')
    expect(priceTone(100)).toBeNull()
    expect(priceTone(120)).toBe('caution')
    expect(priceTone(150)).toBe('bad')
    expect(priceTone(null)).toBeNull()
  })

  it('marks a rating backed by few reviews', () => {
    expect(confidenceTone('high')).toBeNull()
    expect(confidenceTone('medium')).toBe('caution')
    expect(confidenceTone('low')).toBe('bad')
  })

  it('gives each compared route its own letter and colour, clear of the judgment colours', () => {
    expect(COMPARE_MAX).toBe(6)
    expect([0, 1, 2].map(compareLetter)).toEqual(['A', 'B', 'C'])
    expect(new Set(COMPARE_COLORS).size).toBe(COMPARE_COLORS.length)
    expect(COMPARE_COLORS.map((c) => c.toLowerCase())).not.toContain('#0e7c86')
    expect(compareColor(1)).toBe(COMPARE_COLORS[1])
  })
})
