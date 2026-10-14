import { useId, useMemo, useState } from 'react'
import { LEG_HOURS, RATING_STEPS, type ActiveFilter, type Filters } from '../lib/filters'
import { eur } from '../lib/format'
import { Segmented } from './bits'
import { Icon } from './Icon'

const BINS = 24

/** Budget slider over a histogram of route prices. Drags locally and commits when released. */
export function BudgetFilter({ value, mins, onCommit, label }: { value: number | null; mins: number[]; onCommit: (v: number | null) => void; label: string }) {
  const id = useId()
  const lo = mins.length ? Math.floor(Math.min(...mins) / 10) * 10 : 0
  const hi = mins.length ? Math.max(lo + 50, Math.ceil(Math.max(...mins) / 50) * 50) : 1000
  const [draft, setDraft] = useState<number | null>(null)
  const pos = Math.min(draft ?? value ?? hi, hi)
  const anyPrice = pos >= hi
  const width = (hi - lo) / BINS
  const counts = useMemo(() => {
    const c: number[] = new Array(BINS).fill(0)
    for (const m of mins) c[Math.max(0, Math.min(BINS - 1, Math.floor((m - lo) / width)))]++
    return c
  }, [mins, lo, width])
  const peak = Math.max(1, ...counts)
  const under = anyPrice ? mins.length : mins.filter((m) => m <= pos).length
  const commit = () => {
    if (draft == null) return
    onCommit(draft >= hi ? null : draft)
    setDraft(null)
  }
  return (
    <div className="budget">
      <label className="fgroup__label" htmlFor={id}>
        {label}
      </label>
      <svg className="budget__hist" viewBox={`0 0 ${BINS} 24`} preserveAspectRatio="none" aria-hidden="true">
        {counts.map((c, i) => {
          const h = c ? Math.max(1.5, (c / peak) * 24) : 0
          return <rect key={i} x={i + 0.12} width={0.76} y={24 - h} height={h} className={anyPrice || lo + i * width < pos ? 'in' : 'out'} />
        })}
      </svg>
      <input
        id={id}
        className="budget__range"
        type="range"
        min={lo}
        max={hi}
        step={10}
        value={pos}
        onChange={(e) => setDraft(Number(e.currentTarget.value))}
        onPointerUp={commit}
        onKeyUp={commit}
        onBlur={commit}
        aria-valuetext={anyPrice ? 'Any price' : `Up to ${eur(pos)} per person`}
      />
      <div className="budget__value">
        <strong>{anyPrice ? 'Any price' : `Up to ${eur(pos)}`}</strong>
        <span className="muted small">
          {under} route{under === 1 ? '' : 's'}
        </span>
      </div>
    </div>
  )
}

export type ChipOption<T> = { value: T; label: string; count?: number }

/**
 * Multi-select chips. "pick" narrows to the chosen options (none chosen means all);
 * "avoid" marks options to leave out. Options that would show nothing are disabled.
 */
export function ChipSet<T extends string | number>({
  legend,
  options,
  selected,
  onChange,
  variant = 'pick',
}: {
  legend: string
  options: ChipOption<T>[]
  selected: T[]
  onChange: (next: T[]) => void
  variant?: 'pick' | 'avoid'
}) {
  return (
    <fieldset className={`chipset${variant === 'avoid' ? ' chipset--avoid' : ''}`}>
      <legend className="sr-only">{legend}</legend>
      {options.map((o) => {
        const on = selected.includes(o.value)
        return (
          <button
            key={String(o.value)}
            type="button"
            className="toggle-chip"
            aria-pressed={on}
            disabled={!on && o.count === 0}
            onClick={() => onChange(on ? selected.filter((x) => x !== o.value) : [...selected, o.value])}
          >
            {on && <Icon name={variant === 'avoid' ? 'x' : 'check'} size={12} />}
            {o.label}
            {o.count != null && <span className="count">{o.count}</span>}
          </button>
        )
      })}
    </fieldset>
  )
}

type BarProps = {
  f: Filters
  setF: (patch: Partial<Filters>) => void
  routeMins: number[]
  cityCounts: Map<number, number>
  cityOptions: number[]
  /** filters set, not counting a focused city (the breadcrumb shows that one) */
  chips: ActiveFilter[]
  onClear: () => void
  onOpenAll: () => void
  /** narrower screens hide the setup band; its inputs open from a button in this bar */
  setup: { summary: string; onOpen: () => void }
}

/**
 * Every filter lives in this one band: All filters first, then the four that decide most trips (budget, stay rating,
 * cities, long legs), and every active filter as a removable chip underneath, wherever it was set. Below 1200 px
 * the bar shrinks to two buttons, Your trip and All filters, beside or above the chips.
 */
export function FilterBar({ f, setF, routeMins, cityCounts, cityOptions, chips, onClear, onOpenAll, setup }: BarProps) {
  const legOn = f.maxLegH != null
  return (
    <section className="filterbar" aria-label="Filters">
      <div className="filterbar__row">
        <button type="button" className="btn btn--ghost filterbar__setup" onClick={setup.onOpen} aria-haspopup="dialog">
          <Icon name="users" />
          <span className="filterbar__setup-text">
            <strong>Your trip</strong>
            <span>{setup.summary}</span>
          </span>
        </button>
        <button
          type="button"
          className="btn btn--ghost filterbar__all"
          onClick={onOpenAll}
          aria-haspopup="dialog"
          aria-label={chips.length ? `All filters, ${chips.length} on` : 'All filters'}
        >
          <Icon name="sliders" /> All filters
          {chips.length > 0 && <span className="badge-count">{chips.length}</span>}
        </button>
        <div className="fgroup fgroup--budget">
          <BudgetFilter label="Budget per person" value={f.maxPrice} mins={routeMins} onCommit={(maxPrice) => setF({ maxPrice })} />
        </div>
        <div className="fgroup fgroup--inline">
          <span className="fgroup__label">Stay rating</span>
          <Segmented
            legend="Lowest adjusted rating for every stay"
            value={String(f.minRating)}
            onChange={(v) => setF({ minRating: Number(v) })}
            options={[{ value: '0', label: 'Any' }, ...RATING_STEPS.map((r) => ({ value: String(r), label: `★ ${r}+` }))]}
          />
        </div>
        <div className="fgroup fgroup--inline">
          <span className="fgroup__label">Cities per trip</span>
          <ChipSet
            legend="Number of cities on the trip"
            options={cityOptions.map((n) => ({ value: n, label: n === 1 ? 'One' : String(n), count: cityCounts.get(n) ?? 0 }))}
            selected={f.cities}
            onChange={(cities) => setF({ cities })}
          />
        </div>
        <div className="fgroup fgroup--inline">
          <span className="fgroup__label">Long journeys</span>
          <button
            type="button"
            className="toggle-chip"
            aria-pressed={legOn}
            onClick={() => setF({ maxLegH: legOn ? null : LEG_HOURS[0] })}
            title="Hide trips with a leg of 10 hours or more door to door, or one that runs overnight"
          >
            {legOn && <Icon name="check" size={12} />}
            {legOn && f.maxLegH !== LEG_HOURS[0] ? `Legs under ${f.maxLegH} h` : 'No 10 h+ or overnight legs'}
          </button>
        </div>
      </div>
      {chips.length > 0 && (
        <div className="active-filters">
          <span className="active-filters__title" aria-hidden="true">
            Active filters
          </span>
          <ul className="active-filters__list" aria-label="Active filters">
            {chips.map((a) => (
              <li key={a.id}>
                <button type="button" className="filter-chip" onClick={() => setF(a.patch)} aria-label={`Remove filter: ${a.label}`}>
                  {a.label}
                  <Icon name="x" size={12} />
                </button>
              </li>
            ))}
            {/* in the list, so it follows the last chip on the same line when there is room */}
            <li className="active-filters__clear">
              <button type="button" className="link-btn small" onClick={onClear}>
                Clear filters
              </button>
            </li>
          </ul>
        </div>
      )}
    </section>
  )
}
