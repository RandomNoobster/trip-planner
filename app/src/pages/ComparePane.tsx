import { useLayoutEffect, useState, type ReactNode } from 'react'
import { Link } from 'react-router'
import { CompareBadge, HomePrices } from '../components/bits'
import { Icon, type IconName } from '../components/Icon'
import { compareColor, HEADS_UP_ICON, ICON, MODE_ICON } from '../lib/canon'
import { dateRange, duration, eur } from '../lib/format'
import { climateWords, degrees } from '../lib/places'
import { PAPER_LABEL, paperRank, tripPaper } from '../lib/filters'
import { EAT_PLAN_LABEL, money, REFERENCE_PLAN } from '../lib/prices'
import { legsSummary, operatorsOf } from '../lib/tripText'
import type { EvalTrip } from '../lib/trips'
import { useExplore } from '../state/explore'

type Row = {
  label: string
  /** the canon's icon for the idea, as on the cards */
  icon: IconName
  /** the value to rank by, if the row has a best (lowest unless `high`) */
  score?: (e: EvalTrip) => number
  high?: boolean
  show: (e: EvalTrip) => ReactNode
  /** a row only worth showing for some routes */
  when?: (es: EvalTrip[]) => boolean
}

const ROWS: Row[] = [
  {
    label: 'Per person', icon: ICON.price, score: (e) => e.totalPP,
    show: (e) => (
      <>
        <strong>{eur(e.totalPP)}</strong>
        {e.split && <span className="muted small"> average</span>}
      </>
    ),
  },
  { label: 'By home', icon: ICON.home, when: (es) => es.some((e) => e.split), show: (e) => <HomePrices e={e} /> },
  { label: 'Dates', icon: ICON.dates, show: (e) => `${dateRange(e.trip.start, e.trip.end)} · ${e.stops.map((s) => s.stop.nights).join(' + ')} nights` },
  { label: 'Transport', icon: ICON.transport, score: (e) => e.transportPP, show: (e) => `${eur(e.transportPP)} · ${legsSummary(e)}` },
  { label: 'of which transfers', icon: ICON.transfers, score: (e) => e.transfersPP, show: (e) => eur(e.transfersPP) },
  { label: 'Stays', icon: ICON.stays, score: (e) => e.staysPP, show: (e) => eur(e.staysPP) },
  { label: 'Time travelling', icon: ICON.time, score: (e) => e.transitMin, show: (e) => duration(e.transitMin) },
  { label: 'Longest leg', icon: ICON.time, score: (e) => Math.max(...e.legs.map((l) => l.minutes)), show: (e) => duration(Math.max(...e.legs.map((l) => l.minutes))) },
  { label: 'Airlines and buses', icon: MODE_ICON.flight, show: (e) => operatorsOf(e) },
  { label: 'Weakest stay rating', icon: ICON.rating, score: (e) => e.weakestAdjusted, high: true, show: (e) => `adj ${e.weakestAdjusted.toFixed(2)}` },
  {
    label: 'Stays from the centre', icon: ICON.centre,
    score: (e) => Math.max(...e.stops.map((s) => s.chosen.stay.centerKm ?? 99)),
    show: (e) => (
      <ul className="compare-list">
        {e.stops.map((s) => (
          <li key={s.stop.city}>
            {s.dest.name}: {s.chosen.stay.centerKm != null ? `${s.chosen.stay.centerKm.toFixed(1)} km` : 'not known'}
          </li>
        ))}
      </ul>
    ),
  },
  {
    label: 'Weather', icon: ICON.weather,
    score: (e) => -Math.min(...e.stops.map((s) => s.dest.climate?.highC ?? -99)),
    show: (e) => (
      <ul className="compare-list">
        {e.stops.map((s) => (
          <li key={s.stop.city}>
            {s.dest.name}: {s.dest.climate ? `${degrees(s.dest.climate.highC)}, ${climateWords(s.dest.climate).toLowerCase()}` : 'no data'}
          </li>
        ))}
      </ul>
    ),
  },
  {
    label: 'Beer in a bar', icon: ICON.beer,
    score: (e) => Math.max(...e.stops.map((s) => s.dest.prices?.items.beerBar?.eur ?? 99)),
    show: (e) => (
      <ul className="compare-list">
        {e.stops.map((s) => (
          <li key={s.stop.city}>
            {s.dest.name}: {s.dest.prices?.items.beerBar ? money(s.dest.prices.items.beerBar.eur) : 'not known'}
          </li>
        ))}
      </ul>
    ),
  },
  {
    label: 'Eating out, a day', icon: ICON.food,
    score: (e) => Math.max(...e.stops.map((s) => s.dest.prices?.foodDayEUR ?? 999)),
    show: (e) => (
      <ul className="compare-list">
        {e.stops.map((s) => (
          <li key={s.stop.city}>
            {s.dest.name}: {s.dest.prices?.foodDayEUR != null ? `${money(s.dest.prices.foodDayEUR)} (index ${s.dest.prices.foodIndex})` : 'not known'}
          </li>
        ))}
      </ul>
    ),
  },
  {
    label: 'Food & drink for the trip', icon: ICON.food,
    score: (e) => e.foodEstPP ?? 9999,
    show: (e) =>
      e.foodEstPP != null ? (
        <>
          {eur(e.foodEstPP)}
          <span className="muted small"> · {e.foodPP > 0 ? 'in the price' : `${EAT_PLAN_LABEL[REFERENCE_PLAN].toLowerCase()}, not in the price`}</span>
        </>
      ) : (
        <span className="muted">not known</span>
      ),
  },
  {
    label: 'On during the stay', icon: ICON.events,
    score: (e) => -e.stops.reduce((a, s) => a + s.events.length, 0),
    show: (e) => {
      const ev = e.stops.flatMap((s) => s.events.map((a) => a.name))
      return ev.length ? ev.join(' · ') : <span className="muted">nothing found</span>
    },
  },
  {
    label: 'Entry paperwork', icon: ICON.entry,
    score: (e) => paperRank(tripPaper(e)),
    show: (e) => {
      const hard = e.stops.filter((s) => s.dest.entryInfo?.level && s.dest.entryInfo.level !== 'id')
      return (
        <>
          {PAPER_LABEL[tripPaper(e)]}
          {e.entryPP > 0 && ` (${eur(e.entryPP)} per person)`}
          {hard.length > 0 && <span className="muted small"> · {[...new Set(hard.map((s) => s.dest.entryInfo?.name ?? s.dest.country))].join(', ')}</span>}
        </>
      )
    },
  },
  {
    label: 'Missing',
    icon: ICON.missing,
    show: (e) =>
      e.missing.length ? (
        <ul className="chips compare-chips">
          {e.missing.map((m) => (
            <li key={m} className="chip chip--missing">
              <Icon name={ICON.missing} size={11} />
              {m}
            </li>
          ))}
        </ul>
      ) : (
        <span className="muted">nothing flagged</span>
      ),
  },
  {
    label: 'Heads-ups',
    icon: ICON.headsUp,
    score: (e) => e.headsUp.length,
    show: (e) =>
      e.headsUp.length ? (
        <ul className="compare-list compare-headsup">
          {e.headsUp.map((h) => (
            <li key={h.text}>
              <Icon name={HEADS_UP_ICON[h.kind]} size={12} /> {h.text}
            </li>
          ))}
        </ul>
      ) : (
        'none'
      ),
  },
]

/**
 * The routes in the comparison side by side, each under its letter and colour (the same as on its card, in the tray
 * and on the map), with the best value in each row marked in teal.
 */
export function ComparePane() {
  const { savedTrips, toggleSaved, clearSaved, carry, paneRef } = useExplore()
  const [copied, setCopied] = useState(false)
  // the comparison opens at its top, wherever the list was scrolled
  useLayoutEffect(() => {
    if (paneRef.current) paneRef.current.scrollTop = 0
  }, [paneRef])
  if (!savedTrips.length) {
    return (
      <div className="card empty">
        <h3>Nothing to compare yet</h3>
        <p className="muted">
          Press <strong>+ Compare</strong> on any route. It joins the bar under the list with a letter; add two or more, then open them here side by side.
        </p>
        <Link className="btn btn--ghost" to={{ pathname: '/', search: carry }}>
          Back to the routes
        </Link>
      </div>
    )
  }
  const live = savedTrips.flatMap((s) => (s.e ? [s.e] : []))
  const best = (row: Row): number | null => {
    if (!row.score || live.length < 2) return null
    const vals = live.map(row.score)
    return row.high ? Math.max(...vals) : Math.min(...vals)
  }
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(window.location.href)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      setCopied(false)
    }
  }
  return (
    <div className="compare">
      <div className="compare__bar">
        <p className="muted small">
          {savedTrips.length < 2 ? (
            <>Add another route from the list to see them side by side.</>
          ) : (
            <>
              Each route keeps its letter and colour here, in the list and on the map. <span className="tone-good">Teal</span> marks the best value in each row.
            </>
          )}
        </p>
        <span className="compare__actions">
          <button type="button" className="btn btn--ghost btn--small" onClick={copy}>
            <Icon name="copy" size={13} /> {copied ? 'Link copied' : 'Copy link for the group'}
          </button>
          <button type="button" className="link-btn small" onClick={clearSaved}>
            Clear comparison
          </button>
        </span>
      </div>
      <div className="table-scroll">
        <table className="compare-table">
          <thead>
            <tr>
              <th scope="col">
                <span className="sr-only">Detail</span>
              </th>
              {savedTrips.map((s, i) => (
                <th key={s.id} scope="col" style={{ borderTopColor: compareColor(i) }}>
                  <span className="compare-table__route">
                    <CompareBadge slot={i} />
                    <Link to={{ pathname: `/trip/${encodeURIComponent(s.id)}`, search: carry }}>{s.title}</Link>
                    <button type="button" className="crumb__x" onClick={() => toggleSaved(s.id)} aria-label={`Take ${s.title} out of the comparison`} title="Take it out">
                      <Icon name="x" size={12} />
                    </button>
                  </span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {ROWS.filter((row) => !row.when || row.when(live)).map((row) => {
              const top = best(row)
              return (
                <tr key={row.label}>
                  <th scope="row">
                    <span className="compare-table__label">
                      <Icon name={row.icon} size={13} />
                      {row.label}
                    </span>
                  </th>
                  {savedTrips.map((s) => {
                    const isBest = !!s.e && top != null && !!row.score && row.score(s.e) === top
                    return (
                      <td key={s.id} className={isBest ? 'is-best' : undefined}>
                        {isBest && (
                          <span className="best-mark">
                            <Icon name={ICON.included} size={12} label="Best" />
                          </span>
                        )}
                        {s.e ? row.show(s.e) : row.label === 'Per person' ? <span className="muted">Does not fit your current filters</span> : null}
                      </td>
                    )
                  })}
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}
