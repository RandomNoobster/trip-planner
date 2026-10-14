import { useLayoutEffect } from 'react'
import { CanonKey } from '../components/CanonKey'
import { CityAbout, CityStrip } from '../components/CityInfo'
import { TripCard } from '../components/TripCard'
import { useResearch } from '../data/researchContext'
import { shortDate } from '../lib/format'
import { useExplore } from '../state/explore'

const PAGE = 30

/** The side pane's list: every route that matches, best first. A focused city adds a weather and things-to-do tab. */
export function RoutesPane() {
  const { model } = useResearch()
  const ctx = useExplore()
  const { groups, focus, focusStats, tab, limit, setLimit, settings, carry, active, clearAll, setF, unpricedTrips, setHoverKey, focusCity, paneRef, listScroll, saved, toggleSaved, compareFull } =
    ctx
  const meta = model.set.meta
  const focusCode = focus?.code ?? null

  // Coming back from a route lands where the list was left; scrolling is remembered as it happens.
  useLayoutEffect(() => {
    const el = paneRef.current
    if (!el) return
    el.scrollTop = listScroll.current
    const onScroll = () => {
      listScroll.current = el.scrollTop
    }
    el.addEventListener('scroll', onScroll, { passive: true })
    return () => el.removeEventListener('scroll', onScroll)
  }, [paneRef, listScroll, focusCode, tab])

  if (focus && tab === 'about') return <CityAbout dest={focus} activities={model.activitiesByCity.get(focus.code) ?? []} />

  return (
    <div className="routes">
      {focus && focusStats && <CityStrip dest={focus} stats={focusStats} />}
      {groups.length === 0 && (
        <div className="card empty">
          <h3>No trips match</h3>
          <p className="muted">Loosen one of these:</p>
          <ul className="active-filters__list">
            {active.map((a) => (
              <li key={a.id}>
                <button type="button" className="filter-chip" onClick={() => setF(a.patch)} aria-label={`Remove filter: ${a.label}`}>
                  {a.label} ×
                </button>
              </li>
            ))}
          </ul>
          {active.length > 0 && (
            <button type="button" className="btn btn--ghost" onClick={clearAll}>
              Clear all filters
            </button>
          )}
        </div>
      )}
      <ol className="trip-list" onMouseLeave={() => setHoverKey(null)}>
        {groups.slice(0, limit).map((g, i) => (
          <li key={g.key}>
            <TripCard
              group={g}
              rank={i + 1}
              n={settings.n}
              carry={carry}
              focusCode={focusCode}
              onHover={setHoverKey}
              onFocusCity={focusCity}
              compareSlot={saved.includes(g.best.trip.id) ? saved.indexOf(g.best.trip.id) : null}
              compareFull={compareFull}
              onToggleCompare={toggleSaved}
            />
          </li>
        ))}
      </ol>
      {limit < groups.length && (
        <button type="button" className="btn btn--ghost btn--wide" onClick={() => setLimit((l) => l + PAGE)}>
          Show {Math.min(PAGE, groups.length - limit)} more of {groups.length - limit}
        </button>
      )}
      {groups.length > 0 && <CanonKey />}
      <p className="footnote small muted">
        Prices are per person in {meta.currency}, captured {shortDate(meta.capturedAt)}; check them at the booking links before paying. Stays are private
        rooms, never shared with strangers. The adjusted rating pulls each stay toward {meta.prior.mean.toFixed(1)} until it has about {meta.prior.reviews}{' '}
        reviews, so a 4.9 from 12 reviews ranks below a 4.6 from 1,240; a multi-city trip is judged by its weakest stay.
        {unpricedTrips > 0 && ` ${unpricedTrips.toLocaleString('en-GB')} trips are left out because no leg or stay on them fits your fare setting and leg or stay filters.`}
      </p>
    </div>
  )
}
