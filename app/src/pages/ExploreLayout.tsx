import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, Outlet, useMatch, useNavigate, useSearchParams } from 'react-router'
import { Segmented } from '../components/bits'
import { CompareTray } from '../components/CompareTray'
import { FilterBar } from '../components/FilterBar'
import { FilterDrawer } from '../components/FilterDrawer'
import { Icon } from '../components/Icon'
import { MapPanel, type MapMode, type MapView, type StopDetail, type Tiers } from '../components/MapPanel'
import { SetupBar, SetupSheet, setupSummary } from '../components/SetupBar'
import { useResearch } from '../data/researchContext'
import { COMPARE_MAX, ICON } from '../lib/canon'
import {
  carriers,
  describeFilters,
  evalKey,
  facetCounts,
  fromKey,
  NO_FILTERS,
  BEER_STEPS,
  FOOD_STEPS,
  PAPER_STEPS,
  paperRank,
  routeMinimums,
  tripBeer,
  tripEventKinds,
  tripFoodIx,
  tripPaper,
  tripKey,
  tripPasses,
  writeFilters,
  type Filters,
} from '../lib/filters'
import { plural } from '../lib/format'
import { degrees } from '../lib/places'
import { money } from '../lib/prices'
import { cityName, evaluateTrip, groupTrips, homesInUse, quantile, summarizeDestinations, type EvalTrip, type Settings } from '../lib/trips'
import type { ExploreCtx, TripPart } from '../state/explore'
import { useCarrySearch, useSettings } from '../state/settings'

const PAGE = 30
/** companies offered under "Skip companies": the most common ones in the set */
const CARRIER_CHOICES = 14
const NONE: { e: EvalTrip; slot: number }[] = []

/**
 * The explore screen fills the window without page scroll: setup and filters on top, the map on the left and a
 * side pane on the right that scrolls on its own. The pane shows the ranked routes (index route) or one route's
 * details (/trip/:id), so the map stays in view while comparing.
 */
export function ExploreLayout() {
  const { model } = useResearch()
  const [settings, update] = useSettings()
  const [params, setParams] = useSearchParams()
  const navigate = useNavigate()
  const carry = useCarrySearch()
  const tripId = useMatch('/trip/:tripId')?.params.tripId ?? null
  const comparing = !!useMatch('/compare')
  const [limit, setLimit] = useState(PAGE)
  const [drawer, setDrawer] = useState(false)
  const [setupOpen, setSetupOpen] = useState(false)
  const [hoverKey, setHoverKey] = useState<string | null>(null)
  const [stopView, setStopView] = useState<{ tripId: string; stop: number } | null>(null)
  const [tripPart, setTripPart] = useState<TripPart | null>(null)
  const paneRef = useRef<HTMLDivElement>(null)
  const listScroll = useRef(0)
  const meta = model.set.meta
  const f = settings.f
  const mapParam = params.get('map')
  const mapMode: MapMode = mapParam === 'weather' || mapParam === 'beer' || mapParam === 'food' ? mapParam : 'price'
  const mapView: MapView = params.get('view') === 'world' ? 'world' : 'europe'
  // destinations outside the Europe frame (lon -24..36, lat 33..68.5) make the World switch worth showing
  const hasWorld = useMemo(() => model.set.destinations.some((d) => d.lon < -24 || d.lon > 36 || d.lat < 33 || d.lat > 68.5), [model])

  // Re-price trips only when a pricing input or a leg or stay filter changes; the rest just filters.
  const { n, rooms, youth, transfer, eat } = settings
  const { cabin, checked } = settings.bags
  const ek = evalKey(f)
  const tk = tripKey(f)
  const hk = JSON.stringify(settings.home)
  const pricing: Settings = useMemo(
    () => ({ n, rooms, youth, transfer, eat, sort: 'price', bags: { cabin, checked }, home: JSON.parse(hk) as Settings['home'], f: fromKey(ek) }),
    [n, rooms, youth, transfer, eat, cabin, checked, hk, ek],
  )
  const tf = useMemo(() => fromKey(tk), [tk])

  const evals = useMemo(() => {
    const out: EvalTrip[] = []
    for (const t of model.trips) {
      const e = evaluateTrip(model, t, pricing)
      if (e) out.push(e)
    }
    return out
  }, [model, pricing])
  const visible = useMemo(() => evals.filter((e) => tripPasses(e, tf)), [evals, tf])
  // trips that drop out because someone flies home where the trip's last day has no flight found
  const noHomeTrips = useMemo(() => {
    const away = homesInUse(model, pricing).filter((h) => h.home.id !== model.homes[0].id)
    return away.length ? model.trips.filter((t) => away.some((h) => !t.homes?.[h.home.id])).length : 0
  }, [model, pricing])
  const groups = useMemo(() => groupTrips(visible, settings.sort, meta.window), [visible, settings.sort, meta.window])
  const summary = useMemo(() => summarizeDestinations(groups), [groups])
  const tiers: Tiers = useMemo(() => {
    const mins = [...summary.values()].map((s) => s.minPP)
    return { low: Math.round(quantile(mins, 0.33) / 10) * 10, mid: Math.round(quantile(mins, 0.66) / 10) * 10 }
  }, [summary])

  const routeMins = useMemo(() => routeMinimums(evals, tf), [evals, tf])
  const counts = useMemo(
    () => ({
      cities: facetCounts(evals, tf, 'cities', (e) => [e.cities.length]),
      nights: facetCounts(evals, tf, 'nights', (e) => [e.trip.nights]),
      starts: facetCounts(evals, tf, 'starts', (e) => [e.trip.start]),
      countries: facetCounts(evals, tf, 'place', (e) => [...new Set(e.stops.map((st) => st.dest.cc ?? ''))]),
      whatsOn: facetCounts(evals, tf, 'whatsOn', (e) => [...tripEventKinds(e)]),
      beer: facetCounts(evals, tf, 'beer', (e) => BEER_STEPS.filter((s) => tripBeer(e) <= s)),
      food: facetCounts(evals, tf, 'food', (e) => FOOD_STEPS.filter((s) => tripFoodIx(e) <= s)),
      paper: facetCounts(evals, tf, 'paper', (e) => PAPER_STEPS.filter((s) => paperRank(tripPaper(e)) <= paperRank(s))),
    }),
    [evals, tf],
  )
  const options = useMemo(() => {
    const byCountry = new Map<string, string>()
    for (const d of model.set.destinations) if (d.cc) byCountry.set(d.cc, d.country ?? d.cc)
    const carrierCount = new Map<string, number>()
    for (const l of model.set.legs) for (const c of carriers(l)) carrierCount.set(c, (carrierCount.get(c) ?? 0) + 1)
    return {
      cities: [...new Set(model.trips.map((t) => t.stops.length))].sort((a, b) => a - b),
      nights: [...new Set(model.trips.map((t) => t.nights))].sort((a, b) => a - b),
      starts: [...new Set(model.trips.map((t) => t.start))].sort(),
      countries: [...byCountry].map(([cc, name]) => ({ cc, name })).sort((a, b) => a.name.localeCompare(b.name)),
      carriers: [...carrierCount].sort((a, b) => b[1] - a[1]).slice(0, CARRIER_CHOICES).map(([c]) => c),
      // only cities some trip goes through, so the list offers no dead ends
      places: model.set.destinations
        .filter((d) => model.trips.some((t) => t.stops.some((s) => s.city === d.code)))
        .map((d) => ({ code: d.code, name: d.name }))
        .sort((a, b) => a.name.localeCompare(b.name)),
    }
  }, [model])
  const drawerOptions = useMemo(() => ({ ...options, carriers: [...new Set([...options.carriers, ...f.avoidOps])] }), [options, f.avoidOps])
  const countryName = (cc: string) => options.countries.find((c) => c.cc === cc)?.name ?? cc
  const active = describeFilters(f, { city: (c) => cityName(model, c), country: countryName })
  const hasYouthFares = useMemo(() => model.set.legs.some((l) => l.fareType === 'youth'), [model])

  const focus = f.city ? (model.destByCode.get(f.city) ?? null) : null
  const focusStats = useMemo(() => {
    if (!f.city) return null
    const through = new Set(evals.filter((e) => e.cities.includes(f.city!)).map((e) => e.key))
    const single = groups.filter((g) => g.cities.length === 1).length
    const minPP = groups.length ? Math.min(...groups.map((g) => g.minPP)) : null
    return { routes: groups.length, single, multi: groups.length - single, minPP, hidden: Math.max(0, through.size - groups.length) }
  }, [f.city, evals, groups])
  const tab = focus && params.get('tab') === 'about' ? 'about' : 'routes'

  // The open route, priced with the same settings, for the map. Its own page applies any flight or stay swaps.
  const openTrip = useMemo(() => {
    const t = tripId ? model.trips.find((x) => x.id === tripId) : undefined
    return t ? evaluateTrip(model, t, pricing) : null
  }, [model, tripId, pricing])
  const preview = !tripId && !comparing && hoverKey ? (groups.find((g) => g.key === hoverKey)?.best ?? null) : null
  const mapStop = stopView && stopView.tripId === tripId ? stopView.stop : null

  // Routes saved for comparison live in the URL (?saved=id,id), so the group can open the same shortlist.
  const savedParam = params.get('saved') ?? ''
  const saved = useMemo(() => savedParam.split(',').filter(Boolean), [savedParam])
  const savedTrips = useMemo(
    () =>
      saved.map((id) => {
        const t = model.trips.find((x) => x.id === id)
        return { id, e: t ? evaluateTrip(model, t, pricing) : null, title: t ? t.stops.map((s) => cityName(model, s.city)).join(' → ') : id }
      }),
    [saved, model, pricing],
  )
  // each compared route keeps its place in the list as its letter and colour, also when another one no longer fits
  const compareTrips = useMemo(
    () => (comparing ? savedTrips.flatMap((s, slot) => (s.e ? [{ e: s.e, slot }] : [])) : NONE),
    [comparing, savedTrips],
  )
  const setSaved = (fn: (cur: string[]) => string[]) =>
    setParams(
      (prev) => {
        const p = new URLSearchParams(prev)
        const next = fn((p.get('saved') ?? '').split(',').filter(Boolean))
        if (next.length) p.set('saved', next.join(','))
        else p.delete('saved')
        return p
      },
      { replace: true },
    )
  /** Adds a route to the comparison or takes it out; a full comparison takes no more (the buttons say so). */
  const toggleSaved = (id: string) => setSaved((cur) => (cur.includes(id) ? cur.filter((x) => x !== id) : cur.length < COMPARE_MAX ? [...cur, id] : cur))
  const clearSaved = () => setSaved(() => [])

  const stopDetail: StopDetail | null = useMemo(() => {
    if (!openTrip || mapStop == null) return null
    const st = openTrip.stops[mapStop]
    if (!st) return null
    const touching = [openTrip.legs[mapStop], openTrip.legs[mapStop + 1]].filter(Boolean)
    const airports: StopDetail['airports'] = []
    for (const l of touching) {
      for (const t of l.price.transfers) {
        if (t.transfer.where !== st.dest.code || t.transfer.kind !== 'airport') continue
        const a = st.dest.airports.find((x) => x.code === t.transfer.place)
        if (a?.lat != null && a.lon != null && !airports.some((x) => x.code === a.code)) {
          airports.push({ code: a.code, name: a.name ?? a.code, lat: a.lat, lon: a.lon, choice: t })
        }
      }
    }
    const s = st.chosen.stay
    return {
      name: st.dest.name,
      centre: { lat: st.dest.lat, lon: st.dest.lon },
      stay: s.lat != null && s.lon != null ? { lat: s.lat, lon: s.lon, name: s.name, km: s.centerKm ?? null } : null,
      airports,
    }
  }, [openTrip, mapStop])

  const setF = (patch: Partial<Filters>) => update({ f: patch })
  const clearAll = () => update({ f: NO_FILTERS }, { drop: ['tab'] })
  const listSearch = (city: string | null) => {
    const next = new URLSearchParams(params)
    writeFilters(next, { ...f, city })
    next.delete('tab')
    next.delete('sel')
    const s = next.toString()
    return s ? `?${s}` : ''
  }
  /** Show only routes through a city (null: all routes again). Always lands on the list. */
  const focusCity = (code: string | null) => {
    listScroll.current = 0
    setLimit(PAGE)
    navigate({ pathname: '/', search: listSearch(code) })
  }
  const closeTrip = () => navigate({ pathname: '/', search: carry })
  const setTab = (next: 'routes' | 'about') =>
    setParams(
      (prev) => {
        const p = new URLSearchParams(prev)
        if (next === 'about') p.set('tab', 'about')
        else p.delete('tab')
        return p
      },
      { replace: true },
    )
  const setMapView = (v: MapView) =>
    setParams(
      (prev) => {
        const p = new URLSearchParams(prev)
        if (v === 'world') p.set('view', 'world')
        else p.delete('view')
        return p
      },
      { replace: true },
    )
  const setMapMode = (mode: MapMode) =>
    setParams(
      (prev) => {
        const p = new URLSearchParams(prev)
        if (mode === 'price') p.delete('map')
        else p.set('map', mode)
        return p
      },
      { replace: true },
    )

  // Esc steps back out: from a route to the list, then out of a focused city.
  const escRef = useRef<() => void>(() => {})
  useEffect(() => {
    escRef.current = () => {
      if (tripId || comparing) closeTrip()
      else if (f.city) focusCity(null)
    }
  })
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape' || e.defaultPrevented || document.querySelector('dialog[open]')) return
      if ((e.target as HTMLElement | null)?.closest('input, select, textarea')) return
      escRef.current()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  const ctx: ExploreCtx = {
    settings,
    update,
    setF,
    clearAll,
    evals,
    visible,
    groups,
    active,
    unpricedTrips: model.trips.length - evals.length,
    focus,
    focusStats,
    tab,
    carry,
    limit,
    setLimit,
    setHoverKey,
    focusCity,
    showStopOnMap: (stop) => setStopView(stop == null || !tripId ? null : { tripId, stop }),
    mapStop,
    paneRef,
    listScroll,
    saved,
    savedTrips,
    toggleSaved,
    clearSaved,
    compareFull: saved.length >= COMPARE_MAX,
    setTripPart,
  }

  const chips = active.filter((a) => a.id !== 'city')
  const tripTitle = openTrip?.title ?? model.trips.find((t) => t.id === tripId)?.stops.map((s) => cityName(model, s.city)).join(' → ')

  return (
    <div className="explore">
      <SetupBar settings={settings} update={update} hasYouthFares={hasYouthFares} />
      <FilterBar
        f={f}
        setF={setF}
        routeMins={routeMins}
        cityCounts={counts.cities}
        cityOptions={options.cities}
        chips={chips}
        onClear={() => setF({ ...NO_FILTERS, city: f.city })}
        onOpenAll={() => setDrawer(true)}
        setup={{ summary: setupSummary(settings, model), onOpen: () => setSetupOpen(true) }}
      />
      <main className="workspace" id="main">
        <section className="workspace__map" aria-label="Map">
          <MapPanel
            model={model}
            summary={summary}
            tiers={tiers}
            trip={openTrip}
            preview={preview}
            focus={f.city}
            mode={mapMode}
            view={mapView}
            stopDetail={stopDetail}
            activePart={tripId && !comparing ? tripPart : null}
            compare={compareTrips}
            onPickCity={(code) => focusCity(code === f.city && !tripId ? null : code)}
            onPickStop={(i) => ctx.showStopOnMap(i)}
            controls={
              <>
                {hasWorld && (
                  <div className="map-switch map-switch--area">
                    <span className="map-switch__label" aria-hidden="true">
                      View
                    </span>
                    <Segmented
                      legend="Map area"
                      value={mapView}
                      onChange={setMapView}
                      options={[
                        { value: 'europe', label: 'Europe' },
                        { value: 'world', label: 'World' },
                      ]}
                    />
                  </div>
                )}
                <div className="map-switch">
                  <span className="map-switch__label" aria-hidden="true">
                    Dots show
                  </span>
                  <Segmented
                    legend="Dots on the map show"
                    value={mapMode}
                    onChange={setMapMode}
                    options={[
                      { value: 'price', label: 'Price', title: 'Cheapest route through each city, per person' },
                      { value: 'weather', label: 'Weather', title: 'Typical daytime high in December' },
                      { value: 'beer', label: 'Beer', title: 'A 0.5 l draught beer in a bar' },
                      { value: 'food', label: 'Food', title: 'A day of eating out' },
                    ]}
                  />
                </div>
              </>
            }
          />
          <div className={`map-guide${tripId && stopDetail && !comparing ? ' map-guide--stop' : ''}`} role="status">
            {comparing ? (
              <>
                <p>
                  <strong>Comparing {plural(saved.length, 'route')}</strong>
                  <span className="map-guide__more"> · each in its own colour, as in the table</span>
                </p>
                <button type="button" className="link-btn" onClick={closeTrip}>
                  <Icon name="back" size={13} /> Back to the routes
                </button>
              </>
            ) : tripId ? (
              <>
                <p>
                  <strong>{tripTitle ?? 'This route'}</strong>
                  <span className="map-guide__more">
                    {stopDetail ? ` · ${stopDetail.name}: your stay, the centre and the airport transfer` : ' · numbered stops in travel order; click a number to zoom in'}
                  </span>
                </p>
                {stopDetail ? (
                  <button type="button" className="link-btn" onClick={() => ctx.showStopOnMap(null)}>
                    Show the whole route
                  </button>
                ) : (
                  <button type="button" className="link-btn" onClick={closeTrip}>
                    <Icon name="back" size={13} /> Back to the routes
                  </button>
                )}
              </>
            ) : focus ? (
              <>
                <p>
                  <strong>
                    <Icon name="pin" size={13} /> {focus.name}
                  </strong>
                  <span className="map-guide__more"> · other dots show the cheapest route that includes both. Click another city to switch.</span>
                </p>
                <button type="button" className="link-btn" onClick={() => focusCity(null)}>
                  Show all destinations
                </button>
              </>
            ) : (
              <p>
                <strong>Click a city</strong> to see every route through it<span className="map-guide__more">, or <strong>click a route</strong> in the list to open it here</span>.
              </p>
            )}
          </div>
        </section>

        <section className="workspace__pane pane" aria-label={tripId ? 'Route details' : comparing ? 'Compare saved routes' : 'Routes'}>
          <div className="pane__head">
            <div className="pane__crumbrow">
            <nav className="crumbs" aria-label="You are here">
              <ol>
                <li>
                  {focus || tripId || comparing ? (
                    <Link to={{ pathname: '/', search: listSearch(null) }}>All routes</Link>
                  ) : (
                    <span aria-current="page">All routes</span>
                  )}
                </li>
                {focus && (
                  <li>
                    <span className="crumb crumb--city">
                      {tripId ? (
                        <Link to={{ pathname: '/', search: carry }}>
                          <Icon name="pin" size={13} /> {focus.name}
                        </Link>
                      ) : (
                        <span aria-current="page">
                          <Icon name="pin" size={13} /> {focus.name}
                        </span>
                      )}
                      <button type="button" className="crumb__x" onClick={() => focusCity(null)} aria-label={`Show all routes, not only through ${focus.name}`}>
                        <Icon name="x" size={12} />
                      </button>
                    </span>
                  </li>
                )}
                {tripId && (
                  <li>
                    <span className="crumb crumb--trip">
                      <span aria-current="page">
                        <Icon name="route" size={13} /> {tripTitle ?? 'Route'}
                      </span>
                      <button type="button" className="crumb__x" onClick={closeTrip} aria-label="Close this route and go back to the list">
                        <Icon name="x" size={12} />
                      </button>
                    </span>
                  </li>
                )}
                {comparing && (
                  <li>
                    <span className="crumb crumb--trip">
                      <span aria-current="page">
                        <Icon name="compare" size={13} /> Compare {saved.length}
                      </span>
                      <button type="button" className="crumb__x" onClick={closeTrip} aria-label="Close the comparison and go back to the list">
                        <Icon name="x" size={12} />
                      </button>
                    </span>
                  </li>
                )}
              </ol>
            </nav>
            </div>
            {!tripId && !comparing && (
              <div className="pane__tools">
                {focus ? (
                  <div className="tabs" role="tablist" aria-label={focus.name}>
                    <button type="button" role="tab" aria-selected={tab === 'routes'} onClick={() => setTab('routes')}>
                      Routes <span className="count">{groups.length}</span>
                    </button>
                    <button type="button" role="tab" aria-selected={tab === 'about'} onClick={() => setTab('about')}>
                      City guide
                      {(focus.climate || focus.prices?.items.beerBar) && (
                        <span className="tabs__hint">
                          {focus.climate && degrees(focus.climate.highC)}
                          {focus.climate && focus.prices?.items.beerBar && ' · '}
                          {focus.prices?.items.beerBar && `beer ${money(focus.prices.items.beerBar.eur)}`}
                        </span>
                      )}
                    </button>
                  </div>
                ) : (
                  <div>
                    <h2 className="pane__count">
                      {groups.length.toLocaleString('en-GB')} routes <span className="muted">· {visible.length.toLocaleString('en-GB')} priced trips</span>
                    </h2>
                    {noHomeTrips > 0 && (
                      <p className="pane__note muted small">
                        <Icon name={ICON.home} size={12} /> {noHomeTrips.toLocaleString('en-GB')} of {model.trips.length.toLocaleString('en-GB')} trips hidden: no flight home found that day for everyone
                      </p>
                    )}
                  </div>
                )}
                {tab === 'routes' && (
                  <div className="sort">
                    <span className="sort__label" aria-hidden="true">
                      <Icon name="sort" size={14} /> Sort by
                    </span>
                    <Segmented
                      legend="Sort routes by"
                      value={settings.sort}
                      onChange={(sort) => update({ sort })}
                      options={[
                        { value: 'price', label: 'Cheapest', title: 'Lowest total per person, door to door' },
                        { value: 'rating', label: 'Best stays', title: 'Best-rated stays first; a multi-city trip counts its weakest stay' },
                        { value: 'time', label: 'Least travel', title: 'Fewest hours on planes, trains and buses' },
                      ]}
                    />
                  </div>
                )}
              </div>
            )}
          </div>
          <div className="pane__body" ref={paneRef}>
            <Outlet context={ctx} />
          </div>
          {saved.length > 0 && !comparing && <CompareTray items={savedTrips} carry={carry} onRemove={toggleSaved} onClear={clearSaved} />}
        </section>
      </main>
      <SetupSheet open={setupOpen} onClose={() => setSetupOpen(false)} settings={settings} update={update} hasYouthFares={hasYouthFares} shownRoutes={groups.length} />
      <FilterDrawer
        open={drawer}
        onClose={() => setDrawer(false)}
        f={f}
        setF={setF}
        onClearAll={clearAll}
        routeMins={routeMins}
        counts={counts}
        options={drawerOptions}
        shownRoutes={groups.length}
      />
    </div>
  )
}
