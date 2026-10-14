import { useMemo, useState } from 'react'
import { useResearch } from '../data/researchContext'
import type { Activity, ActivityCategory, Climate, Destination } from '../data/schema'
import { ACTIVITY_CATEGORIES } from '../data/schema'
import { eur, shortDate } from '../lib/format'
import { PAPER_LABEL, paperLevel } from '../lib/filters'
import { activityPrice, CATEGORY, climateWords, degrees, tempBand } from '../lib/places'
import { indexBand, money } from '../lib/prices'
import { ExternalLink } from './bits'
import { Icon, type IconName } from './Icon'

// ---------- weather ----------

const deg = degrees

function wetText(share: number): string {
  const inTen = Math.round(share * 10)
  if (inTen <= 0) return 'Rarely wet'
  return `Rain or snow ${inTen} day${inTen === 1 ? '' : 's'} in 10`
}

export function WeatherStrip({ climate: c, name }: { climate: Climate; name: string }) {
  const range = c.highP10 != null && c.highP90 != null ? `highs usually ${deg(c.highP10)} to ${deg(c.highP90)}` : null
  return (
    <div className="weather" aria-label={`Typical weather in ${name}`}>
      <p className="weather__words">
        <span className="weather__dot" style={{ background: tempBand(c.highC).color }} aria-hidden="true" />
        {climateWords(c)}
      </p>
      <ul className="weather__stats">
        <li>
          <Icon name="thermo" size={15} />
          <span>
            <strong>
              {deg(c.highC)} / {deg(c.lowC)}C
            </strong>
            {range && <span className="muted"> {range}</span>}
          </span>
        </li>
        <li>
          <Icon name="rain" size={15} />
          <span>{wetText(c.wetShare)}</span>
        </li>
        {c.sunH != null && (
          <li>
            <Icon name="sun" size={15} />
            <span>{c.sunH.toFixed(1)} h sun a day</span>
          </li>
        )}
        {c.daylightH != null && (
          <li>
            <Icon name="moon" size={15} />
            <span>{c.daylightH.toFixed(1)} h of daylight</span>
          </li>
        )}
        {c.snowShare >= 0.03 && (
          <li>
            <Icon name="snow" size={15} />
            <span>Fresh snow on {Math.round(c.snowShare * 100)}% of days</span>
          </li>
        )}
      </ul>
      <p className="muted small">
        Typical of {c.period ?? 'the travel window'}, from{' '}
        {c.sourceUrl ? <ExternalLink href={c.sourceUrl}>Open-Meteo weather records</ExternalLink> : 'weather records'}
        {c.link && (
          <>
            {' · '}
            <ExternalLink href={c.link.url}>{c.link.label}</ExternalLink>
          </>
        )}
      </p>
    </div>
  )
}

// ---------- entry ----------

/** What a Norwegian citizen needs to enter the destination's country, from researched rules (or the set's own note). */
export function EntryNote({ dest, compact = false }: { dest: Destination; compact?: boolean }) {
  const e = dest.entryInfo
  if (!e?.level) {
    if (dest.schengen !== false || !dest.entry) return compact ? null : <p className="muted small">{dest.country} · in Schengen: no passport control (bring ID)</p>
    return (
      <p className="entry-note">
        <Icon name="warn" size={14} /> <span>{dest.entry}</span>
      </p>
    )
  }
  const level = paperLevel(dest)
  const easy = level === 'id'
  if (compact && easy) return null
  const border = e.atBorder && !/^(nothing|none|no extra|passport only)/i.test(e.atBorder) ? e.atBorder : null
  const details = [e.passport && !easy ? `Passport ${e.passport.replace(/^passport\s+/i, '')}` : null, !easy ? border : null, e.stayDays ? `Stay up to ${e.stayDays} days` : null].filter(Boolean)
  return (
    <div className={`entry entry--${level}`}>
      <p className="entry__head">
        <Icon name={easy || level === 'passport' ? 'check' : 'warn'} size={14} />
        <strong>{PAPER_LABEL[level]}</strong>
        <span className="muted">
          {' '}
          · entering {e.name ?? dest.country} with a Norwegian {easy ? 'ID card or passport' : 'passport'}
          {dest.schengen ? ' (Schengen: no passport control)' : ''}
        </span>
      </p>
      {!easy && e.paperwork && <p className="small">{e.paperwork}</p>}
      {!compact && details.length > 0 && <p className="muted small">{details.join(' · ')}</p>}
      {!compact && e.url && (
        <p className="small">
          <ExternalLink href={e.url}>Official entry rules</ExternalLink>
        </p>
      )}
    </div>
  )
}

// ---------- prices ----------

/** "Cheap · 57" in the band's colour; 100 is the median destination. */
export function IndexChip({ ix, what }: { ix: number; what: string }) {
  const band = indexBand(ix)
  return (
    <span className="ix-chip" style={{ ['--ix' as string]: band.color }} title={`${what} index ${ix}: 100 is the median destination, lower is cheaper`}>
      {band.word} · {ix}
    </span>
  )
}

type Price = { eur: number; src: string; note?: string | null; url?: string | null }

function PriceRow({ icon, label, v, each = 1 }: { icon: IconName; label: string; v: Price; each?: number }) {
  return (
    <li title={v.src === 'research' && v.note ? `Checked by hand: ${v.note}` : undefined}>
      <Icon name={icon} size={13} />
      <span className="prices__label">{label}</span>
      <strong>
        {v.src === 'livingcost' ? '≈ ' : ''}
        {money(v.eur / each)}
      </strong>
    </li>
  )
}

/**
 * Everyday prices in a city: a beer in a bar and a day of eating out up front, each with its index, then the details,
 * how locals eat and drink cheaply, and what the same costs at home.
 */
export function PriceStrip({ dest }: { dest: Destination }) {
  const { model } = useResearch()
  const p = dest.prices
  if (!p) return null
  const it = p.items
  const home = model.home?.prices
  const homeName = model.home?.name ?? 'home'
  const meta = model.places?.prices
  const tips = dest.tips
  const nb = p.sources.find((s) => s.name === 'Numbeo')
  const lc = p.sources.find((s) => s.name !== 'Numbeo')
  const scaled = Object.values(it).some((v) => v?.src === 'livingcost')
  const checked = Object.values(it).filter((v): v is Price => !!v && v.src === 'research' && !!v.url)
  return (
    <div className="prices" aria-label={`Prices in ${dest.name}`}>
      <div className="prices__heroes">
        {it.beerBar && (
          <div className="price-hero">
            <span className="price-hero__label">
              <Icon name="beer" size={15} /> Beer in a bar
            </span>
            <span className="price-hero__value">
              {it.beerBar.src === 'livingcost' ? '≈ ' : ''}
              {money(it.beerBar.eur)}
            </span>
            {p.beerIndex != null && <IndexChip ix={p.beerIndex} what="Beer" />}
            <span className="muted small" title={it.beerBar.src === 'research' && it.beerBar.note ? `Checked by hand: ${it.beerBar.note}` : undefined}>
              0.5 l draught
              {it.beerBar.scaledFrom ? `, scaled from ${it.beerBar.scaledFrom.litres} l` : it.beerBar.src === 'research' ? ', checked by hand' : ''}
              {home?.items.beerBar ? ` · ${money(home.items.beerBar.eur)} in ${homeName}` : ''}
            </span>
          </div>
        )}
        {p.foodDayEUR != null && (
          <div className="price-hero">
            <span className="price-hero__label">
              <Icon name="food" size={15} /> Eating out, a day
            </span>
            <span className="price-hero__value">{money(p.foodDayEUR)}</span>
            {p.foodIndex != null && <IndexChip ix={p.foodIndex} what="Food" />}
            <span className="muted small">
              cheap lunch, nicer dinner, coffee{home?.foodDayEUR != null ? ` · ${money(home.foodDayEUR)} in ${homeName}` : ''}
            </span>
          </div>
        )}
      </div>
      {it.beerBar?.scaledFrom && (
        <p className="muted small">
          <Icon name="beer" size={12} />{' '}
          {it.beerBar.note ??
            `Bars here pour ${it.beerBar.scaledFrom.litres} l for ${money(it.beerBar.scaledFrom.eur)}; scaled to 0.5 l to compare with other cities.`}
          {it.beerBar.url && (
            <>
              {' '}
              <ExternalLink href={it.beerBar.url}>Source</ExternalLink>
            </>
          )}
        </p>
      )}
      {p.note && (
        <p className="muted small">
          <Icon name="warn" size={12} /> {p.note}
        </p>
      )}
      <ul className="prices__list">
        {it.mealCheap && <PriceRow icon="food" label="Cheap meal out" v={it.mealCheap} />}
        {it.mealMid2 && <PriceRow icon="food" label="Mid-range dinner, each" v={it.mealMid2} each={2} />}
        {it.cappuccino && <PriceRow icon="coffee" label="Cappuccino" v={it.cappuccino} />}
        {it.beerShop && <PriceRow icon="cart" label="Beer from a shop, 0.5 l" v={it.beerShop} />}
        {it.fastFood && <PriceRow icon="food" label="Fast-food meal" v={it.fastFood} />}
        {it.transit && <PriceRow icon="ticket" label="Bus or metro ticket" v={it.transit} />}
      </ul>
      {tips && (tips.localBeer?.length || tips.cheapEat || tips.saveTip) && (
        <ul className="prices__tips">
          {tips.localBeer?.length ? (
            <li>
              <Icon name="beer" size={13} />
              <span>
                Local beer: <strong>{tips.localBeer.join(', ')}</strong>
              </span>
            </li>
          ) : null}
          {tips.cheapEat && (
            <li>
              <Icon name="food" size={13} />
              <span>
                Cheap eat: <strong>{tips.cheapEat.name}</strong>
                {tips.cheapEat.priceEUR != null && `, about ${money(tips.cheapEat.priceEUR)}`}
                {tips.cheapEat.note && <span className="muted"> · {tips.cheapEat.note}</span>}
              </span>
            </li>
          )}
          {tips.saveTip && (
            <li>
              <Icon name="bulb" size={13} />
              <span>{tips.saveTip}</span>
            </li>
          )}
        </ul>
      )}
      <p className="muted small prices__credit">
        Index 100 is the median destination
        {meta?.beerMedianEUR != null && meta.foodDayMedianEUR != null ? ` (beer ${money(meta.beerMedianEUR)}, a day out ${money(meta.foodDayMedianEUR)})` : ''}; lower
        is cheaper. From {nb && <ExternalLink href={nb.url}>Numbeo</ExternalLink>}
        {nb && lc && ' and '}
        {lc && <ExternalLink href={lc.url}>LivingCost.org</ExternalLink>}
        {nb?.entries ? ` (${nb.entries.toLocaleString('en-GB')} Numbeo entries in the past year)` : ''}
        {scaled && '; ≈ is a LivingCost price scaled to Numbeo’s level'}
        {checked.map((v, i) => (
          <span key={i}>
            {'; '}
            <ExternalLink href={v.url!}>checked by hand</ExternalLink>
          </span>
        ))}
        {tips?.sources?.[0] && (
          <>
            {'; tips from '}
            <ExternalLink href={tips.sources[0]}>{tips.sources[0].includes('wikivoyage') ? 'Wikivoyage' : 'this source'}</ExternalLink>
          </>
        )}
        .
      </p>
    </div>
  )
}

// ---------- things to do ----------

function overlaps(a: { start: string; end: string }, b: { start: string; end: string }): boolean {
  return a.start <= b.end && b.start <= a.end
}

function sortActivities(items: Activity[]): Activity[] {
  const rank = new Map(ACTIVITY_CATEGORIES.map((c, i) => [c, i]))
  return [...items].sort(
    (a, b) =>
      (rank.get(a.category) ?? 9) - (rank.get(b.category) ?? 9) ||
      (a.dates?.start ?? '').localeCompare(b.dates?.start ?? '') ||
      (a.priceEUR ?? 999) - (b.priceEUR ?? 999),
  )
}

type ThingsProps = {
  items: Activity[]
  cityName: string
  /** the nights spent there, to say which events are on during the stay */
  stay?: { start: string; end: string }
  initial?: number
  wikivoyage?: string | null
}

export function ThingsToDo({ items, cityName, stay, initial = 5, wikivoyage }: ThingsProps) {
  const [cat, setCat] = useState<ActivityCategory | 'all'>('all')
  const [all, setAll] = useState(false)
  const sorted = useMemo(() => sortActivities(items), [items])
  const counts = useMemo(() => {
    const m = new Map<ActivityCategory, number>()
    for (const a of items) m.set(a.category, (m.get(a.category) ?? 0) + 1)
    return m
  }, [items])

  if (!items.length) {
    return (
      <div className="todo-empty muted small">
        No things to do collected for {cityName} yet.
        {wikivoyage && (
          <>
            {' '}
            <ExternalLink href={wikivoyage}>{cityName} on Wikivoyage</ExternalLink>
          </>
        )}
      </div>
    )
  }

  const shown = sorted.filter((a) => cat === 'all' || a.category === cat)
  const visible = all ? shown : shown.slice(0, initial)
  const free = items.filter((a) => a.priceEUR === 0).length
  const paid = items.map((a) => a.studentEUR ?? a.priceEUR).filter((p): p is number => p != null && p > 0)
  return (
    <div className="todo">
      <div className="todo__top">
        <h3 className="todo__title">Things to do</h3>
        <span className="muted small">
          {free > 0 && `${free} free`}
          {free > 0 && paid.length > 0 && ' · '}
          {paid.length > 0 && `others ${eur(Math.min(...paid))}–${eur(Math.max(...paid))} (student price where there is one)`}
        </span>
      </div>
      <fieldset className="cat-chips">
        <legend className="sr-only">Kind of thing to do</legend>
        <button type="button" className="mini-chip" aria-pressed={cat === 'all'} onClick={() => setCat('all')}>
          All <span className="count">{items.length}</span>
        </button>
        {ACTIVITY_CATEGORIES.filter((c) => counts.get(c)).map((c) => (
          <button key={c} type="button" className="mini-chip" aria-pressed={cat === c} onClick={() => setCat(c)}>
            <Icon name={CATEGORY[c].icon} size={13} />
            {CATEGORY[c].label} <span className="count">{counts.get(c)}</span>
          </button>
        ))}
      </fieldset>
      <ul className="todo__list">
        {visible.map((a) => {
          const during = stay && a.dates ? overlaps(a.dates, stay) : null
          return (
            <li key={a.id} className="todo-item">
              <div className="todo-item__head">
                <span className={`todo-item__icon todo-item__icon--${a.category}`} title={CATEGORY[a.category].label}>
                  <Icon name={CATEGORY[a.category].icon} size={14} />
                </span>
                <span className="todo-item__name">{a.url || a.source ? <ExternalLink href={a.url ?? a.source}>{a.name}</ExternalLink> : a.name}</span>
                <span className={`todo-item__price${a.priceEUR === 0 ? ' is-free' : ''}`}>{activityPrice(a)}</span>
              </div>
              {a.blurb && <p className="todo-item__blurb">{a.blurb}</p>}
              <p className="todo-item__meta small">
                {a.dates && (
                  <span className={`date-pill${during === true ? ' date-pill--on' : during === false ? ' date-pill--off' : ''}`}>
                    {a.dates.start === a.dates.end ? shortDate(a.dates.start) : `${shortDate(a.dates.start)} – ${shortDate(a.dates.end)}`}
                    {during === true && ' · during your stay'}
                    {during === false && ' · not on your dates'}
                  </span>
                )}
                {a.dates && a.datesConfirmed === false && <span className="muted">2026 dates not confirmed yet</span>}
                {a.when && <span className="muted">{a.when}</span>}
                {a.bookAhead && <span className="tag tag--warn">Book ahead</span>}
                {a.priceText && <span className="muted">{a.priceText}</span>}
              </p>
            </li>
          )
        })}
      </ul>
      {shown.length > initial && (
        <button type="button" className="link-btn todo__more" onClick={() => setAll((v) => !v)} aria-expanded={all}>
          {all ? 'Show fewer' : `Show all ${shown.length}`}
        </button>
      )}
      <p className="muted small todo__credit">
        Picked from {wikivoyage ? <ExternalLink href={wikivoyage}>Wikivoyage</ExternalLink> : 'Wikivoyage'} (CC BY-SA), official sites and organisers.
        Prices checked October 2026; student prices are for under-26s or ISIC holders.
      </p>
    </div>
  )
}

// ---------- the focused city on the explore page ----------

type Stats = { routes: number; single: number; multi: number; minPP: number | null; hidden: number }

/** One line above the routes of a focused city: how many, from what price, and entry rules when outside Schengen. */
export function CityStrip({ dest, stats }: { dest: Destination; stats: Stats }) {
  return (
    <div className="city-strip">
      <p>
        {stats.routes ? (
          <>
            <strong>{stats.routes}</strong> route{stats.routes === 1 ? '' : 's'} through {dest.name} ({stats.single} one-city, {stats.multi} multi-city)
            {stats.minPP != null && (
              <>
                , from <strong>{eur(stats.minPP)}</strong> per person
              </>
            )}
          </>
        ) : (
          `No routes through ${dest.name} match your filters.`
        )}
        {stats.hidden > 0 && <span className="muted"> · {stats.hidden} more hidden by filters</span>}
      </p>
      <EntryNote dest={dest} compact />
    </div>
  )
}

/** The second tab of a focused city: typical weather, prices and things to do. */
export function CityAbout({ dest, activities }: { dest: Destination; activities: Activity[] }) {
  return (
    <section className="city-about" aria-label={`${dest.name}: weather, prices and things to do`}>
      <EntryNote dest={dest} />
      {dest.climate && <WeatherStrip climate={dest.climate} name={dest.name} />}
      <PriceStrip dest={dest} />
      <ThingsToDo items={activities} cityName={dest.name} initial={8} wikivoyage={dest.wikivoyage} />
    </section>
  )
}
