import type { CSSProperties } from 'react'
import { Link } from 'react-router'
import { COMPARE_MAX, compareColor, compareLetter, confidenceTone, HEADS_UP_ICON, ICON, MODE_ICON, priceTone } from '../lib/canon'
import { dateRange, duration, eur, plural, shortDate } from '../lib/format'
import { modeOf, PLATFORM } from '../lib/labels'
import { climateWords, degrees, tempBand } from '../lib/places'
import { money } from '../lib/prices'
import { cardId, operatorsOf } from '../lib/tripText'
import type { EvalStop, EvalTrip, TripGroup } from '../lib/trips'
import { Centrality, ChipRow, CompareBadge, ExternalLink, Fact, HomePrices } from './bits'
import { Icon } from './Icon'

type StayLineProps = {
  st: EvalStop
  /** the focused city, which needs no "show routes through" button */
  focusCode?: string | null
  onFocusCity?: (code: string) => void
}

/** The stay's rating as the app ranks it (adjusted), with the platform's own score and how many reviews back it. */
export function StayRating({ st }: { st: EvalStop }) {
  const { stay, adjusted, confidence } = st.chosen
  if (stay.rating == null) return <span className="fact__label">No rating yet</span>
  const scale = stay.ratingScale ?? 5
  const tone = confidenceTone(confidence)
  return (
    <Fact
      icon={ICON.rating}
      filled
      title={`Adjusted rating ${adjusted.toFixed(2)}: ${stay.rating}/${scale} on ${PLATFORM[stay.platform] ?? stay.platform}, pulled toward the typical score until a stay has about 200 reviews. ${confidence[0].toUpperCase()}${confidence.slice(1)} confidence.`}
      label={
        <>
          {stay.rating.toFixed(scale === 10 ? 1 : 2)}/{scale} · <span className={tone ? `tone-${tone}` : undefined}>{`${stay.reviews.toLocaleString('en-GB')} review${stay.reviews === 1 ? '' : 's'}`}</span>
        </>
      }
    >
      {adjusted.toFixed(2)}
    </Fact>
  )
}

export function StayLine({ st, focusCode, onFocusCity }: StayLineProps) {
  const { stay } = st.chosen
  const dec = st.dest.december
  const climate = st.dest.climate
  const p = st.dest.prices
  const it = p?.items
  return (
    <li className="stay-line">
      <div className="stay-line__head">
        {onFocusCity && st.dest.code !== focusCode ? (
          <button type="button" className="city-link" onClick={() => onFocusCity(st.dest.code)} title={`Show every route through ${st.dest.name}`}>
            <Icon name={ICON.city} size={12} />
            {st.dest.name}
          </button>
        ) : (
          <strong>{st.dest.name}</strong>
        )}
        <Fact icon={ICON.nights}>{plural(st.stop.nights, 'night')}</Fact>
        <span className="stay-line__night" title="Per person per night">
          <Icon name={ICON.stays} size={13} /> <strong>{eur(st.chosen.nightPP)}</strong> <span className="fact__label">a night each</span>
        </span>
      </div>
      <p className="stay-line__what">
        {stay.name} · {st.chosen.note} · {PLATFORM[stay.platform] ?? stay.platform}
      </p>
      <div className="facts">
        <StayRating st={st} />
        <Centrality stay={stay} />
        {climate && (
          <Fact icon={ICON.weather} iconColor={tempBand(climate.highC).color} label={climateWords(climate).toLowerCase()} title="Typical December daytime high and night low">
            {degrees(climate.highC)} / {degrees(climate.lowC)}
          </Fact>
        )}
        {it?.beerBar && (
          <Fact icon={ICON.beer} tone={priceTone(p?.beerIndex)} title="0.5 l of local draught beer in a bar">
            {money(it.beerBar.eur)}
          </Fact>
        )}
        {it?.mealCheap && (
          <Fact icon={ICON.food} tone={priceTone(p?.foodIndex)} title="A meal at an inexpensive restaurant">
            {money(it.mealCheap.eur)}
          </Fact>
        )}
      </div>
      {st.events.length > 0 && (
        <p className="stay-line__events">
          <Icon name={ICON.events} size={13} />
          <span>
            <span className="sr-only">On while you are there: </span>
            {st.events.map((a) => a.name).join(' · ')}
          </span>
        </p>
      )}
      {!climate && dec && dec.tags.length > 0 && <div className="muted small">December there: {dec.tags.join(', ')}</div>}
    </li>
  )
}

/**
 * Adds a route to the side-by-side comparison or takes it out. Once in, the button carries the route's letter, the
 * same mark as in the tray, the table and on the map.
 */
export function CompareToggle({ slot, full, onToggle }: { slot: number | null; full: boolean; onToggle: () => void }) {
  const on = slot != null
  return (
    <button
      type="button"
      className={`compare-btn${on ? ' is-on' : ''}`}
      aria-pressed={on}
      disabled={!on && full}
      onClick={onToggle}
      title={
        on
          ? `Route ${compareLetter(slot)} in the comparison. Click to take it out.`
          : full
            ? `The comparison holds ${COMPARE_MAX} routes. Take one out first.`
            : 'Add to the side-by-side comparison'
      }
    >
      {on ? <CompareBadge slot={slot} /> : <Icon name="plus" size={13} />}
      {on ? (
        <>
          <span className="compare-btn__state">Comparing</span>
          <span className="compare-btn__undo">Take out</span>
        </>
      ) : (
        'Compare'
      )}
    </button>
  )
}

type Props = {
  group: TripGroup
  rank: number
  n: number
  carry: string
  focusCode: string | null
  /** hovering or focusing a card previews its route on the map */
  onHover: (key: string | null) => void
  onFocusCity: (code: string) => void
  /** the route's place in the comparison (its letter), or null when it is not in it */
  compareSlot: number | null
  compareFull: boolean
  onToggleCompare: (tripId: string) => void
}

/** "[plane] 2 flights [bus] 1 bus": how many of each kind of leg. */
function ModeFacts({ t }: { t: EvalTrip }) {
  const counts = { flight: 0, train: 0, bus: 0 }
  t.legs.forEach((l) => counts[modeOf(l.leg.kind)]++)
  const words = { flight: ['flight', 'flights'], train: ['train', 'trains'], bus: ['bus', 'buses'] } as const
  return (
    <>
      {(['flight', 'train', 'bus'] as const)
        .filter((m) => counts[m] > 0)
        .map((m) => (
          <li key={m}>
            <Fact icon={MODE_ICON[m]} label={words[m][counts[m] === 1 ? 0 : 1]}>
              {counts[m]}
            </Fact>
          </li>
        ))}
    </>
  )
}

/** One route in the list. The whole card opens the route in the side pane; city names focus that city. */
export function TripCard({ group, rank, n, carry, focusCode, onHover, onFocusCity, compareSlot, compareFull, onToggleCompare }: Props) {
  const t = group.best
  const otherDates: EvalTrip[] = []
  const seenDates = new Set([`${t.trip.start}|${t.trip.end}`])
  for (const v of group.variants) {
    const k = `${v.trip.start}|${v.trip.end}`
    if (seenDates.has(k)) continue
    seenDates.add(k)
    otherDates.push(v)
    if (otherDates.length >= 4) break
  }
  const nightsText = t.stops.length > 1 ? `${t.stops.map((s) => s.stop.nights).join(' + ')} nights` : plural(t.trip.nights, 'night')
  const headingId = `${cardId(group.key)}-title`
  const tripLink = (id: string) => ({ pathname: `/trip/${encodeURIComponent(id)}`, search: carry })
  const longTravel = t.headsUp.some((h) => h.kind === 'long')
  return (
    <article
      id={cardId(group.key)}
      className={`card trip-card${compareSlot != null ? ' is-compared' : ''}`}
      style={compareSlot != null ? ({ '--compare': compareColor(compareSlot) } as CSSProperties) : undefined}
      aria-labelledby={headingId}
      onMouseEnter={() => onHover(group.key)}
      onFocus={() => onHover(group.key)}
    >
      <div className="trip-card__head">
        <div className="trip-card__title">
          <span className="rank" aria-label={`Rank ${rank}`}>
            {rank}
          </span>
          <div>
            <h3 id={headingId}>
              <Link className="trip-card__link" to={tripLink(t.trip.id)}>
                {group.title}
              </Link>
            </h3>
            <p className="facts">
              <Fact icon={ICON.dates}>{dateRange(t.trip.start, t.trip.end)}</Fact>
              <Fact icon={ICON.nights}>{nightsText}</Fact>
            </p>
            {group.savingVsWindow != null && (
              <p className="trip-card__saving">
                <Icon name={ICON.saving} size={13} /> {eur(group.savingVsWindow)} cheaper than the planned dates
              </p>
            )}
          </div>
        </div>
        <div className="price">
          <div className="price__pp">{eur(t.totalPP)}</div>
          <div className="muted small">
            {t.split ? 'per person, average' : 'per person'} · {eur(t.groupTotal)} for {n}
          </div>
          <HomePrices e={t} className="price__homes" />
          <CompareToggle slot={compareSlot} full={compareFull} onToggle={() => onToggleCompare(t.trip.id)} />
        </div>
      </div>

      <ul className="facts trip-card__costs" aria-label="Per person">
        <li>
          <Fact icon={ICON.fares} label="fares">
            {eur(t.faresPP)}
          </Fact>
        </li>
        {t.bagsPP > 0 && (
          <li>
            <Fact icon={ICON.bags} label="bags">
              {eur(t.bagsPP)}
            </Fact>
          </li>
        )}
        <li>
          <Fact icon={ICON.transfers} label="transfers" title="Airport or station to the city centre and back, per person. Open the route to see each bus or train.">
            {eur(t.transfersPP)}
          </Fact>
        </li>
        <li>
          <Fact icon={ICON.stays} label="stays">
            {eur(t.staysPP)}
          </Fact>
        </li>
        {t.entryPP > 0 && (
          <li>
            <Fact icon={ICON.entry} label="entry permit" tone="caution" title={`Paid entry permit for ${t.entryNames.join(' and ')} (Norwegian passport); skip it if you already hold a valid one`}>
              {eur(t.entryPP)}
            </Fact>
          </li>
        )}
        {t.foodPP > 0 && (
          <li>
            <Fact icon={ICON.food} label="food & drink" title="Food and drink from each city's typical prices, as chosen under Food & drink">
              {eur(t.foodPP)}
            </Fact>
          </li>
        )}
      </ul>
      <ul className="facts" aria-label="Travel">
        <ModeFacts t={t} />
        <li>
          <Fact icon={ICON.time} label="travelling" tone={longTravel ? 'caution' : null} title={longTravel ? 'One leg is long or runs overnight; see the heads-up' : undefined}>
            {duration(t.transitMin)}
          </Fact>
        </li>
        <li className="fact__label">{operatorsOf(t)}</li>
      </ul>

      <ul className="stay-lines">
        {t.stops.map((st) => (
          <StayLine key={st.stop.city + st.stop.checkin} st={st} focusCode={focusCode} onFocusCity={onFocusCity} />
        ))}
      </ul>

      <ChipRow title="Heads-up" tone="warn" items={t.headsUp.map((h) => ({ text: h.text, icon: HEADS_UP_ICON[h.kind] }))} />
      <ChipRow title="Missing" tone="missing" items={t.missing} empty="nothing flagged" />

      <div className="trip-card__foot small">
        {otherDates.length > 0 && (
          <div className="other-dates">
            <span className="fact__label">
              <Icon name={ICON.dates} size={12} /> Other dates:
            </span>
            {otherDates.map((v) => (
              <Link key={v.trip.id} to={tripLink(v.trip.id)}>
                {shortDate(v.trip.start)}–{shortDate(v.trip.end)} {eur(v.totalPP)}
              </Link>
            ))}
          </div>
        )}
        <div className="links">
          {t.legs.map((l) => (
            <ExternalLink key={l.leg.id} href={l.leg.url}>
              <Icon name={MODE_ICON[modeOf(l.leg.kind)]} size={12} />
              <span className="sr-only">{modeOf(l.leg.kind)} </span>
              {l.leg.fromCity}–{l.leg.toCity}
            </ExternalLink>
          ))}
          {t.stops.map((st) => (
            <ExternalLink key={st.chosen.stay.id} href={st.chosen.stay.url}>
              <Icon name={ICON.stays} size={12} />
              <span className="sr-only">Stay in </span>
              {st.dest.name}
            </ExternalLink>
          ))}
          <span className="trip-card__open" aria-hidden="true">
            Open route <Icon name="arrow" size={13} />
          </span>
        </div>
      </div>
    </article>
  )
}
