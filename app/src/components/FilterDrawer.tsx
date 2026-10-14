import { useEffect, useRef, type ReactNode } from 'react'
import {
  AMENITIES,
  AMENITY_LABEL,
  BEER_STEPS,
  CENTRE_STEPS,
  FOOD_STEP_LABEL,
  FOOD_STEPS,
  PAPER_LABEL,
  PAPER_STEP_LABEL,
  PAPER_STEPS,
  LEG_HOURS,
  MODES,
  MODE_LABEL,
  RATING_STEPS,
  REVIEW_STEPS,
  STAY_KINDS,
  STAY_KIND_LABEL,
  STOP_STEPS,
  SUNNY_HOURS,
  WARM_STEPS,
  WHATS_ON,
  WHATS_ON_LABEL,
  type Filters,
  type WhatsOn,
} from '../lib/filters'
import { ICON } from '../lib/canon'
import { dayLabel } from '../lib/format'
import { Segmented } from './bits'
import { BudgetFilter, ChipSet } from './FilterBar'
import { Icon } from './Icon'

type Props = {
  open: boolean
  onClose: () => void
  f: Filters
  setF: (patch: Partial<Filters>) => void
  onClearAll: () => void
  routeMins: number[]
  counts: {
    cities: Map<number, number>
    nights: Map<number, number>
    starts: Map<string, number>
    countries: Map<string, number>
    whatsOn: Map<WhatsOn, number>
    beer: Map<number, number>
    food: Map<number, number>
    paper: Map<string, number>
  }
  options: { cities: number[]; nights: number[]; starts: string[]; countries: { cc: string; name: string }[]; carriers: string[]; places: { code: string; name: string }[] }
  shownRoutes: number
}

/** The drawer's sections, in order: the canon's icon, a short name for the jump links and how many filters each has on. */
const SECTIONS = [
  { id: 'price', icon: ICON.price, short: 'Price', on: (f: Filters) => +(f.maxPrice != null) + +f.exactOnly },
  { id: 'stays', icon: ICON.stays, short: 'Stays', on: (f: Filters) => +(f.minRating > 0) + +(f.minReviews > 0) + +(f.maxCentreKm != null) + +(f.stayKinds.length > 0) + f.needs.length },
  { id: 'route', icon: ICON.dates, short: 'Route & dates', on: (f: Filters) => +(f.cities.length > 0) + +(f.starts.length > 0) + +(f.nights.length > 0) },
  { id: 'around', icon: ICON.transport, short: 'Getting around', on: (f: Filters) => +(f.maxLegH != null) + +(f.modes.length > 0) + +(f.maxStops != null) + f.avoidOps.length },
  { id: 'weather', icon: ICON.weather, short: 'Weather', on: (f: Filters) => +(f.minHighC != null) + +f.dry + +f.sunny },
  { id: 'eat', icon: ICON.food, short: 'Food & drink', on: (f: Filters) => +(f.maxBeer != null) + +(f.maxFoodIx != null) },
  { id: 'on', icon: ICON.events, short: "What's on", on: (f: Filters) => f.whatsOn.length },
  { id: 'dest', icon: ICON.city, short: 'Destinations', on: (f: Filters) => +(f.city != null) + +(f.maxPaper != null) + +f.schengenOnly + +(f.avoidCountries.length > 0) },
] as const
type SectionId = (typeof SECTIONS)[number]['id']

function Section({ id, title, hint, children }: { id: SectionId; title: string; hint?: string; children: ReactNode }) {
  const icon = SECTIONS.find((s) => s.id === id)!.icon
  return (
    <section className="drawer__section" id={`filters-${id}`} aria-labelledby={`filters-${id}-title`}>
      <h3 id={`filters-${id}-title`}>
        <Icon name={icon} size={15} /> {title}
      </h3>
      {hint && <p className="muted small">{hint}</p>}
      {children}
    </section>
  )
}

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="frow">
      <span className="frow__label">{label}</span>
      <div className="frow__control">{children}</div>
    </div>
  )
}

function Toggle({ on, onChange, children, title }: { on: boolean; onChange: (v: boolean) => void; children: ReactNode; title?: string }) {
  return (
    <button type="button" className="toggle-chip" aria-pressed={on} onClick={() => onChange(!on)} title={title}>
      {on && <Icon name="check" size={12} />}
      {children}
    </button>
  )
}

/** Every filter, grouped the way people think about a trip. A native modal dialog: Esc and the backdrop close it. */
export function FilterDrawer({ open, onClose, f, setF, onClearAll, routeMins, counts, options, shownRoutes }: Props) {
  const ref = useRef<HTMLDialogElement>(null)
  useEffect(() => {
    const d = ref.current
    if (!d) return
    if (open && !d.open) d.showModal()
    if (!open && d.open) d.close()
  }, [open])

  return (
    <dialog
      ref={ref}
      className="drawer"
      aria-labelledby="drawer-title"
      onClose={onClose}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose()
      }}
    >
      <div className="drawer__panel">
        <header className="drawer__head">
          <h2 id="drawer-title">All filters</h2>
          <button type="button" className="icon-btn" onClick={onClose} aria-label="Close filters">
            <Icon name="x" />
          </button>
        </header>
        <nav className="drawer__index" aria-label="Filter sections">
          {SECTIONS.map((sec) => {
            const n = sec.on(f)
            return (
              <button
                key={sec.id}
                type="button"
                className={`index-chip${n ? ' is-on' : ''}`}
                onClick={() => document.getElementById(`filters-${sec.id}`)?.scrollIntoView({ block: 'start', behavior: 'smooth' })}
                aria-label={n ? `${sec.short}, ${n} on` : sec.short}
              >
                <Icon name={sec.icon} size={12} />
                {sec.short}
                {n > 0 && <span className="index-chip__n">{n}</span>}
              </button>
            )
          })}
        </nav>

        <div className="drawer__body">
          <Section id="price" title="Price">
            <BudgetFilter label="Budget per person, door to door" value={f.maxPrice} mins={routeMins} onCommit={(maxPrice) => setF({ maxPrice })} />
            <Row label="Fares">
              <Toggle on={f.exactOnly} onChange={(exactOnly) => setF({ exactOnly })} title="Leave out trains and buses priced from a range or estimate">
                Exact fares only
              </Toggle>
            </Row>
          </Section>

          <Section id="stays" title="Stays" hint="Every city gets the cheapest stay that meets these, so trips stay cheap. A multi-city trip is judged by its weakest stay.">
            <Row label="Adjusted rating">
              <Segmented
                legend="Lowest adjusted rating for every stay"
                value={String(f.minRating)}
                onChange={(v) => setF({ minRating: Number(v) })}
                options={[{ value: '0', label: 'Any' }, ...RATING_STEPS.map((r) => ({ value: String(r), label: `★ ${r}+` }))]}
              />
            </Row>
            <Row label="Reviews">
              <Segmented
                legend="Fewest reviews a stay may have"
                value={String(f.minReviews)}
                onChange={(v) => setF({ minReviews: Number(v) })}
                options={[{ value: '0', label: 'Any' }, ...REVIEW_STEPS.map((r) => ({ value: String(r), label: `${r}+` }))]}
              />
            </Row>
            <Row label="Distance from the centre">
              <Segmented
                legend="Farthest a stay may be from the city centre"
                value={f.maxCentreKm == null ? 'any' : String(f.maxCentreKm)}
                onChange={(v) => setF({ maxCentreKm: v === 'any' ? null : Number(v) })}
                options={[{ value: 'any', label: 'Any' }, ...CENTRE_STEPS.map((k) => ({ value: String(k), label: `Within ${k} km` }))]}
              />
            </Row>
            <Row label="Kind of stay">
              <ChipSet legend="Kind of stay" options={STAY_KINDS.map((k) => ({ value: k, label: STAY_KIND_LABEL[k] }))} selected={f.stayKinds} onChange={(stayKinds) => setF({ stayKinds })} />
            </Row>
            <Row label="Must have">
              <ChipSet legend="Stay must have" options={AMENITIES.map((a) => ({ value: a, label: AMENITY_LABEL[a] }))} selected={f.needs} onChange={(needs) => setF({ needs })} />
            </Row>
          </Section>

          <Section id="route" title="Route and dates" hint="Pick any to narrow down; none picked means all. Numbers are routes that would show.">
            <Row label="Cities per trip">
              <ChipSet
                legend="Cities per trip"
                options={options.cities.map((n) => ({ value: n, label: n === 1 ? 'One' : String(n), count: counts.cities.get(n) ?? 0 }))}
                selected={f.cities}
                onChange={(cities) => setF({ cities })}
              />
            </Row>
            <Row label="Leave on">
              <ChipSet
                legend="Departure date"
                options={options.starts.map((d) => ({ value: d, label: dayLabel(d), count: counts.starts.get(d) ?? 0 }))}
                selected={f.starts}
                onChange={(starts) => setF({ starts })}
              />
            </Row>
            <Row label="Nights">
              <ChipSet
                legend="Nights away"
                options={options.nights.map((n) => ({ value: n, label: String(n), count: counts.nights.get(n) ?? 0 }))}
                selected={f.nights}
                onChange={(nights) => setF({ nights })}
              />
            </Row>
          </Section>

          <Section id="around" title="Getting around" hint="A leg that fails these is swapped for another option on the same route when there is one.">
            <Row label="Longest leg">
              <Segmented
                legend="Longest leg, door to door"
                value={f.maxLegH == null ? 'any' : String(f.maxLegH)}
                onChange={(v) => setF({ maxLegH: v === 'any' ? null : Number(v) })}
                options={[{ value: 'any', label: 'Any' }, ...LEG_HOURS.map((h) => ({ value: String(h), label: `Under ${h} h` }))]}
              />
            </Row>
            <p className="muted small frow__note">Any limit also leaves out overnight legs. Layovers count toward a flight's time.</p>
            <Row label="Transport">
              <ChipSet legend="Kinds of transport" options={MODES.map((m) => ({ value: m, label: MODE_LABEL[m] }))} selected={f.modes} onChange={(modes) => setF({ modes })} />
            </Row>
            <Row label="Stops per flight">
              <Segmented
                legend="Most connections on one flight"
                value={f.maxStops == null ? 'any' : String(f.maxStops)}
                onChange={(v) => setF({ maxStops: v === 'any' ? null : Number(v) })}
                options={[{ value: 'any', label: 'Any' }, ...STOP_STEPS.map((s) => ({ value: String(s), label: s === 0 ? 'Direct' : `Up to ${s}` }))]}
              />
            </Row>
            <Row label="Skip companies">
              <ChipSet legend="Airlines and bus companies to leave out" variant="avoid" options={options.carriers.map((c) => ({ value: c, label: c }))} selected={f.avoidOps} onChange={(avoidOps) => setF({ avoidOps })} />
            </Row>
          </Section>

          <Section id="weather" title="Weather" hint="Typical weather for the travel window, from past years' daily records. Applies to every city on the trip.">
            <Row label="Daytime highs">
              <Segmented
                legend="Lowest typical daytime high"
                value={f.minHighC == null ? 'any' : String(f.minHighC)}
                onChange={(v) => setF({ minHighC: v === 'any' ? null : Number(v) })}
                options={[{ value: 'any', label: 'Any' }, ...WARM_STEPS.map((t) => ({ value: String(t), label: `${t}°C+` }))]}
              />
            </Row>
            <Row label="Also">
              <div className="toggle-row">
                <Toggle on={f.dry} onChange={(dry) => setF({ dry })} title="Rain or snow on at most 3 days in 10">
                  Mostly dry
                </Toggle>
                <Toggle on={f.sunny} onChange={(sunny) => setF({ sunny })}>
                  {SUNNY_HOURS} h+ of sun a day
                </Toggle>
              </div>
            </Row>
          </Section>

          <Section id="eat" title="Eating and drinking out" hint="Typical prices in each city (Numbeo and LivingCost.org). Applies to every city on the trip.">
            <Row label="Beer in a bar">
              <Segmented
                legend="Most a 0.5 l draught beer may cost in every city"
                value={f.maxBeer == null ? 'any' : String(f.maxBeer)}
                onChange={(v) => setF({ maxBeer: v === 'any' ? null : Number(v) })}
                options={[{ value: 'any', label: 'Any' }, ...BEER_STEPS.map((s) => ({ value: String(s), label: `Up to €${s} · ${counts.beer.get(s) ?? 0}` }))]}
              />
            </Row>
            <Row label="Food prices">
              <Segmented
                legend="Highest food index allowed in every city"
                value={f.maxFoodIx == null ? 'any' : String(f.maxFoodIx)}
                onChange={(v) => setF({ maxFoodIx: v === 'any' ? null : Number(v) })}
                options={[{ value: 'any', label: 'Any' }, ...FOOD_STEPS.map((s) => ({ value: String(s), label: `${FOOD_STEP_LABEL[s]} · ${counts.food.get(s) ?? 0}` }))]}
              />
            </Row>
            <p className="muted small frow__note">The food index compares a day of eating out (cheap lunch, nicer dinner, coffee); 100 is the median destination. Numbers are routes that would show.</p>
          </Section>

          <Section id="on" title="What's on" hint="December events on while you are in at least one city of the trip. Dates not yet confirmed for 2026 use the usual pattern.">
            <Row label="During the stay">
              <ChipSet
                legend="Events that must be on during the stay"
                options={WHATS_ON.map((k) => ({ value: k, label: WHATS_ON_LABEL[k], count: counts.whatsOn.get(k) ?? 0 }))}
                selected={f.whatsOn}
                onChange={(whatsOn) => setF({ whatsOn })}
              />
            </Row>
          </Section>

          <Section id="dest" title="Destinations">
            <Row label="Through city">
              <select className="select" value={f.city ?? ''} onChange={(e) => setF({ city: e.currentTarget.value || null })} aria-label="Only trips through this city">
                <option value="">Any city</option>
                {options.places.map((p) => (
                  <option key={p.code} value={p.code}>
                    {p.name}
                  </option>
                ))}
              </select>
            </Row>
            <Row label="Paperwork">
              <Segmented
                legend="The most entry paperwork any country on the trip may need, for a Norwegian citizen"
                value={f.maxPaper ?? 'any'}
                onChange={(v) => setF({ maxPaper: v === 'any' ? null : (v as typeof f.maxPaper) })}
                options={[{ value: 'any', label: 'Any' }, ...PAPER_STEPS.map((s) => ({ value: s, label: `${PAPER_STEP_LABEL[s]} · ${counts.paper.get(s) ?? 0}` }))]}
              />
            </Row>
            <p className="muted small frow__note">
              For Norwegian citizens: {PAPER_STEPS.map((s) => `${PAPER_STEP_LABEL[s]} = ${PAPER_LABEL[s].toLowerCase()}`).join('; ')}. Each city guide says exactly what to do.
            </p>
            <Row label="Borders">
              <Toggle on={f.schengenOnly} onChange={(schengenOnly) => setF({ schengenOnly })} title="No passport control and no extra entry paperwork for Norwegian citizens">
                Schengen only
              </Toggle>
            </Row>
            <Row label="Skip countries">
              <ChipSet
                legend="Countries to leave out"
                variant="avoid"
                options={options.countries.map((c) => ({ value: c.cc, label: c.name, count: f.avoidCountries.includes(c.cc) ? undefined : (counts.countries.get(c.cc) ?? 0) }))}
                selected={f.avoidCountries}
                onChange={(avoidCountries) => setF({ avoidCountries })}
              />
            </Row>
          </Section>
        </div>

        <footer className="drawer__foot">
          <button type="button" className="link-btn" onClick={onClearAll}>
            Clear all
          </button>
          <button type="button" className="btn btn--primary" onClick={onClose}>
            Show {shownRoutes} route{shownRoutes === 1 ? '' : 's'}
          </button>
        </footer>
      </div>
    </dialog>
  )
}
