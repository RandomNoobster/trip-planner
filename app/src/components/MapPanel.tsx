import { setWorkerUrl } from 'maplibre-gl'
import workerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?url'
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import MapGL, { Layer, Marker, NavigationControl, Popup, Source, type MapLayerMouseEvent, type MapRef } from 'react-map-gl/maplibre'

// MapLibre 6 finds its worker next to its own file, which bundlers move; point it at the emitted worker asset instead.
setWorkerUrl(workerUrl)
import type { Model } from '../data/model'
import { eur } from '../lib/format'
import { compareColor, compareLetter, lift } from '../lib/canon'
import { TEMP_BANDS, tempBand } from '../lib/places'
import { INDEX_BANDS, indexBand, money } from '../lib/prices'
import type { TransferChoice } from '../lib/pricing'
import { homeEnd, type DestSummary, type EvalTrip } from '../lib/trips'
import { useTheme } from '../state/theme'
import { Icon } from './Icon'

// OpenFreeMap: free vector tiles without an API key, a light and a dark basemap. Both styles load glyphs from the
// same font server, which has the Noto Sans Bold used for the labels below.
const MAP_STYLE = { light: 'https://tiles.openfreemap.org/styles/positron', dark: 'https://tiles.openfreemap.org/styles/dark' }
/** The canon's colours on the map (teal cheap, amber middle, rust pricey), lighter in the dark theme to stay legible. */
const PALETTE = {
  light: { low: '#0E7C86', mid: '#A3620A', high: '#8E2A20', off: '#9AA5B4', route: '#1B4FD8', transfer: '#0B5E66', ring: '#FFFFFF', focusRing: '#141A24', text: '#141A24', halo: '#FFFFFF' },
  dark: { low: '#2FB3BA', mid: '#D9962F', high: '#E8695A', off: '#5C6676', route: '#82A6FF', transfer: '#3CC2C9', ring: '#10141B', focusRing: '#E8ECF2', text: '#E8ECF2', halo: '#10141B' },
}
const EUROPE: [[number, number], [number, number]] = [
  [-24, 33],
  [36, 68.5],
]

export type Tiers = { low: number; mid: number }
export type MapMode = 'price' | 'weather' | 'beer' | 'food'
export type MapView = 'europe' | 'world'

function inEurope(p: { lat: number; lon: number }): boolean {
  return p.lon >= EUROPE[0][0] && p.lon <= EUROPE[1][0] && p.lat >= EUROPE[0][1] && p.lat <= EUROPE[1][1]
}

/** One stop of the open route, zoomed in: the stay, the city centre and the airports with the transfer used. */
export type StopDetail = {
  name: string
  centre: { lat: number; lon: number }
  stay: { lat: number; lon: number; name: string; km: number | null } | null
  airports: { code: string; name: string; lat: number; lon: number; choice: TransferChoice }[]
}

type Props = {
  model: Model
  summary: Map<string, DestSummary>
  tiers: Tiers
  /** the route open in the side pane */
  trip: EvalTrip | null
  /** the route under the pointer in the list */
  preview: EvalTrip | null
  /** the city whose routes the list shows; other dots then show the cheapest route combining both */
  focus: string | null
  mode: MapMode
  /** Europe (default) or every destination, when the set reaches beyond Europe */
  view: MapView
  stopDetail: StopDetail | null
  /** the routes being compared, each drawn in the colour of its letter (its slot in the comparison) */
  compare: { e: EvalTrip; slot: number }[]
  onPickCity: (code: string) => void
  onPickStop: (index: number) => void
  /** the map's switches (area, what the dots show), drawn above the legend so the two read as one key */
  controls?: ReactNode
  /** the leg or stop of the open route being read in the pane: its line or number lights up */
  activePart?: { kind: 'leg' | 'stop'; index: number } | null
}

type Hover = { code: string; lon: number; lat: number }

/** Home, each stop, and the airport most of the group flies home to (Værnes unless they split off elsewhere). */
function routePoints(model: Model, t: EvalTrip): { lat: number; lon: number }[] {
  const end = model.airportPoints.get(homeEnd(t.mainHome)) ?? model.origin
  return [model.origin, ...t.cities.map((c) => model.destByCode.get(c)).filter((d) => !!d), end]
}

/** Dashed lines from the last stop to the airports the rest of the group flies home to. */
function splitLines(model: Model, t: EvalTrip | null) {
  const last = t ? model.destByCode.get(t.cities[t.cities.length - 1]) : undefined
  const ends = t && last ? t.homes.filter((h) => h !== t.mainHome).map((h) => model.airportPoints.get(homeEnd(h))).filter((a) => !!a) : []
  return {
    type: 'FeatureCollection' as const,
    features: ends.map((a) => ({
      type: 'Feature' as const,
      properties: {},
      geometry: { type: 'LineString' as const, coordinates: [[last!.lon, last!.lat], [a.lon, a.lat]] },
    })),
  }
}

function lineThrough(model: Model, t: EvalTrip | null) {
  if (!t) return { type: 'FeatureCollection' as const, features: [] }
  const pts = routePoints(model, t)
  return {
    type: 'FeatureCollection' as const,
    features: [{ type: 'Feature' as const, properties: {}, geometry: { type: 'LineString' as const, coordinates: pts.map((p) => [p.lon, p.lat]) } }],
  }
}

function transferLabel(c: TransferChoice): string {
  const pub = c.transfer.public
  if (c.how === 'public' && pub) return `${pub.line ?? pub.mode ?? 'Public transport'} · ${pub.min ? `${pub.min} min · ` : ''}${eur(c.eur)} each`
  if (c.how === 'taxi') return `Taxi · ${eur(c.eur)} each`
  return 'No price found'
}

export function MapPanel({ model, summary, tiers, trip, preview, focus, mode, view, stopDetail, compare, onPickCity, onPickStop, controls, activePart }: Props) {
  const mapRef = useRef<MapRef>(null)
  const [hover, setHover] = useState<Hover | null>(null)
  const { theme } = useTheme()
  const COLORS = PALETTE[theme]
  /** scale colours (temperature, price bands, compared routes) lifted for the dark basemap */
  const shade = useMemo(() => (theme === 'dark' ? (c: string) => lift(c) : (c: string) => c), [theme])
  const comparing = compare.length > 0
  const tripCities = useMemo(() => (comparing ? [...new Set(compare.flatMap((c) => c.e.cities))] : (trip?.cities ?? [])), [comparing, compare, trip])
  const highlight = !!trip || comparing

  const destinations = useMemo(() => {
    const features = model.set.destinations.map((d) => {
      const s = summary.get(d.code)
      const inTrip = tripCities.includes(d.code)
      const high = d.climate?.highC
      const p = d.prices
      const ix = mode === 'beer' ? p?.beerIndex : mode === 'food' ? p?.foodIndex : null
      const tier = !s ? 'off' : s.minPP <= tiers.low ? 'low' : s.minPP <= tiers.mid ? 'mid' : 'high'
      const color =
        !s && !inTrip
          ? COLORS.off
          : mode === 'weather'
            ? high != null
              ? shade(tempBand(high).color)
              : COLORS.off
            : mode === 'beer' || mode === 'food'
              ? ix != null
                ? shade(indexBand(ix).color)
                : COLORS.off
              : inTrip
                ? COLORS.route
                : COLORS[tier]
      const value =
        mode === 'weather'
          ? high != null
            ? `${Math.round(high)}°`
            : ''
          : mode === 'beer'
            ? p?.items.beerBar
              ? money(p.items.beerBar.eur)
              : ''
            : mode === 'food'
              ? p?.foodDayEUR != null
                ? `${money(p.foodDayEUR)}/day`
                : ''
              : s
                ? eur(s.minPP)
                : ''
      return {
        type: 'Feature' as const,
        geometry: { type: 'Point' as const, coordinates: [d.lon, d.lat] },
        properties: {
          code: d.code,
          visible: !!s || inTrip,
          dim: highlight && !inTrip,
          inTrip,
          focus: d.code === focus,
          price: s ? Math.round(s.minPP) : 999999,
          label: s && !highlight ? `${d.name}  ${value}` : d.name,
          color,
        },
      }
    })
    return { type: 'FeatureCollection' as const, features }
  }, [model, summary, tiers, tripCities, highlight, focus, mode, COLORS, shade])

  const route = useMemo(() => lineThrough(model, trip), [model, trip])
  const split = useMemo(() => splitLines(model, trip), [model, trip])
  const splitAirports = useMemo(
    () => (trip ? [...new Set(trip.homes.map((h) => homeEnd(h)))].filter((c) => c !== model.origin.code).flatMap((c) => model.airportPoints.get(c) ?? []) : []),
    [model, trip],
  )
  // the leg being read, drawn over the route: from the stop before it (or home) to the stop after it (or home)
  const activeLeg = useMemo(() => {
    const pts = trip ? routePoints(model, trip) : []
    const i = activePart?.kind === 'leg' ? activePart.index : -1
    const seg = i >= 0 && pts[i + 1] ? [pts[i], pts[i + 1]] : []
    return {
      type: 'FeatureCollection' as const,
      features: seg.length ? [{ type: 'Feature' as const, properties: {}, geometry: { type: 'LineString' as const, coordinates: seg.map((p) => [p.lon, p.lat]) } }] : [],
    }
  }, [model, trip, activePart])
  const compareLines = useMemo(
    () => ({
      type: 'FeatureCollection' as const,
      features: compare.flatMap((c, i) =>
        lineThrough(model, c.e).features.map((f) => ({ ...f, properties: { color: shade(compareColor(c.slot)), offset: (i - (compare.length - 1) / 2) * 3 } })),
      ),
    }),
    [model, compare, shade],
  )
  const previewLine = useMemo(() => lineThrough(model, preview), [model, preview])
  const transferLines = useMemo(() => {
    if (!stopDetail) return { type: 'FeatureCollection' as const, features: [] }
    const c = [stopDetail.centre.lon, stopDetail.centre.lat]
    const features = stopDetail.airports.map((a) => ({
      type: 'Feature' as const,
      properties: { kind: 'airport' },
      geometry: { type: 'LineString' as const, coordinates: [[a.lon, a.lat], c] },
    }))
    if (stopDetail.stay) {
      features.push({ type: 'Feature' as const, properties: { kind: 'stay' }, geometry: { type: 'LineString' as const, coordinates: [c, [stopDetail.stay.lon, stopDetail.stay.lat]] } })
    }
    return { type: 'FeatureCollection' as const, features }
  }, [stopDetail])

  // Frame the open route, a zoomed-in stop, the compared routes, or Europe again; only when that choice changes,
  // so re-pricing (travelers, bags) never moves the map under the user.
  const framed = useRef<string>('europe')
  // a shared link can open on a route or a comparison before the map exists; frame it once the map has loaded
  const [ready, setReady] = useState(false)
  const focusDest = focus ? model.destByCode.get(focus) : undefined
  const farFocus = focusDest && !inEurope(focusDest) ? focusDest : undefined
  const frameKey = stopDetail
    ? `stop:${stopDetail.name}:${stopDetail.stay?.lat ?? ''}`
    : trip
      ? `trip:${trip.trip.id}`
      : compare.length
        ? `compare:${compare.map((c) => c.e.trip.id).join(',')}`
        : farFocus
          ? `focus:${farFocus.code}`
          : view
  useEffect(() => {
    const map = mapRef.current
    if (!map || !ready || framed.current === frameKey) return
    framed.current = frameKey
    const pad = { top: 90, bottom: 60, left: 50, right: 50 }
    if (stopDetail) {
      const pts = [stopDetail.centre, ...(stopDetail.stay ? [stopDetail.stay] : []), ...stopDetail.airports]
      const lons = pts.map((p) => p.lon)
      const lats = pts.map((p) => p.lat)
      map.fitBounds(
        [
          [Math.min(...lons) - 0.01, Math.min(...lats) - 0.01],
          [Math.max(...lons) + 0.01, Math.max(...lats) + 0.01],
        ],
        { padding: pad, duration: 800, maxZoom: 14 },
      )
    } else if (trip || compare.length || farFocus) {
      const cities = trip ? trip.cities : compare.length ? compare.flatMap((c) => c.e.cities) : [farFocus!.code]
      // the airports a split group flies home to are part of the route too (Sola lies west of Værnes)
      const homes = trip ? trip.homes.flatMap((h) => model.airportPoints.get(homeEnd(h)) ?? []) : []
      const pts = [model.origin, ...homes, ...cities.map((c) => model.destByCode.get(c)).filter((d) => !!d)]
      const lons = pts.map((p) => p.lon)
      const lats = pts.map((p) => p.lat)
      map.fitBounds(
        [
          [Math.min(...lons), Math.min(...lats)],
          [Math.max(...lons), Math.max(...lats)],
        ],
        { padding: pad, duration: 700, maxZoom: 6 },
      )
    } else if (view === 'world') {
      const pts = [model.origin, ...model.set.destinations]
      map.fitBounds(
        [
          [Math.min(...pts.map((p) => p.lon)) - 3, Math.min(...pts.map((p) => p.lat)) - 3],
          [Math.max(...pts.map((p) => p.lon)) + 3, Math.max(...pts.map((p) => p.lat)) + 3],
        ],
        { padding: 16, duration: 700 },
      )
    } else {
      map.fitBounds(EUROPE, { padding: 16, duration: 700 })
    }
  }, [frameKey, model, trip, stopDetail, compare, farFocus, view, ready])

  const onClick = (e: MapLayerMouseEvent) => {
    const code = e.features?.[0]?.properties?.code as string | undefined
    if (!code) return
    const stop = trip ? trip.cities.indexOf(code) : -1
    if (stop >= 0) onPickStop(stop)
    else onPickCity(code)
  }
  const onMove = (e: MapLayerMouseEvent) => {
    const f = e.features?.[0]
    const code = f?.properties?.code as string | undefined
    if (!code) return setHover(null)
    const d = model.destByCode.get(code)
    if (d && hover?.code !== code) setHover({ code, lon: d.lon, lat: d.lat })
  }

  const hoverDest = hover ? model.destByCode.get(hover.code) : null
  const hoverSummary = hover ? summary.get(hover.code) : undefined
  const hoverStop = hover && trip ? trip.cities.indexOf(hover.code) : -1

  return (
    <div className={`map${ready ? ' map--ready' : ''}`} aria-label="Map of destinations. Every destination is also in the routes list and in All filters, Through city." role="region">
      <MapGL
        ref={mapRef}
        initialViewState={{ bounds: EUROPE, fitBoundsOptions: { padding: 16 } }}
        mapStyle={MAP_STYLE[theme]}
        interactiveLayerIds={['dest-dot', 'dest-label']}
        onClick={onClick}
        onMouseMove={onMove}
        onMouseLeave={() => setHover(null)}
        cursor={hover ? 'pointer' : 'grab'}
        dragRotate={false}
        style={{ width: '100%', height: '100%' }}
        onLoad={(e) => {
          setReady(true)
          // on a phone-sized map the credits start folded into their (i) button instead of covering the switches
          const box = e.target.getContainer()
          const attrib = box.querySelector('.maplibregl-ctrl-attrib')
          if (attrib && box.clientWidth < 640) {
            attrib.classList.remove('maplibregl-compact-show')
            attrib.removeAttribute('open')
          }
        }}
      >
        <NavigationControl position="bottom-right" showCompass={false} />
        <Source id="preview" type="geojson" data={previewLine}>
          <Layer id="preview-line" type="line" paint={{ 'line-color': COLORS.route, 'line-width': 2, 'line-opacity': 0.55, 'line-dasharray': [2, 2] }} />
        </Source>
        <Source id="compare" type="geojson" data={compareLines}>
          <Layer
            id="compare-line"
            type="line"
            paint={{ 'line-color': ['get', 'color'], 'line-width': 3, 'line-offset': ['get', 'offset'], 'line-opacity': 0.9 }}
            layout={{ 'line-cap': 'round', 'line-join': 'round' }}
          />
        </Source>
        <Source id="split" type="geojson" data={split}>
          <Layer id="split-line" type="line" paint={{ 'line-color': COLORS.route, 'line-width': 2, 'line-dasharray': [2, 2] }} layout={{ 'line-cap': 'round' }} />
        </Source>
        <Source id="route" type="geojson" data={route}>
          <Layer id="route-line" type="line" paint={{ 'line-color': COLORS.route, 'line-width': 3 }} layout={{ 'line-cap': 'round', 'line-join': 'round' }} />
        </Source>
        <Source id="active-leg" type="geojson" data={activeLeg}>
          <Layer id="active-leg-halo" type="line" paint={{ 'line-color': COLORS.route, 'line-width': 10, 'line-opacity': 0.25 }} layout={{ 'line-cap': 'round' }} />
          <Layer id="active-leg-line" type="line" paint={{ 'line-color': COLORS.route, 'line-width': 5 }} layout={{ 'line-cap': 'round' }} />
        </Source>
        <Source id="transfers" type="geojson" data={transferLines}>
          <Layer
            id="transfer-line"
            type="line"
            paint={{ 'line-color': COLORS.transfer, 'line-width': ['case', ['==', ['get', 'kind'], 'stay'], 2, 3], 'line-dasharray': [1.5, 1.5] }}
          />
        </Source>
        <Source id="dests" type="geojson" data={destinations}>
          <Layer
            id="dest-dot"
            type="circle"
            paint={{
              'circle-radius': ['case', ['get', 'focus'], 9, ['get', 'inTrip'], 7, ['get', 'visible'], 6, 3.5],
              'circle-color': ['get', 'color'],
              'circle-opacity': ['case', ['get', 'dim'], 0.35, 1],
              'circle-stroke-color': ['case', ['get', 'focus'], COLORS.focusRing, COLORS.ring],
              'circle-stroke-width': ['case', ['get', 'focus'], 3, ['get', 'visible'], 2, 1],
              'circle-stroke-opacity': ['case', ['get', 'dim'], 0.35, 1],
            }}
          />
          <Layer
            id="dest-label"
            type="symbol"
            filter={['all', ['any', ['==', ['get', 'visible'], true], ['==', ['get', 'focus'], true]], ['!=', ['get', 'dim'], true]]}
            layout={{
              'text-field': ['get', 'label'],
              'text-font': ['Noto Sans Bold'],
              'text-size': ['case', ['get', 'focus'], 13, 12],
              'text-anchor': 'top',
              'text-offset': [0, 0.85],
              'text-padding': 3,
              'symbol-sort-key': ['case', ['get', 'focus'], -2, ['get', 'inTrip'], -1, ['get', 'price']],
            }}
            paint={{
              'text-color': ['case', ['get', 'inTrip'], COLORS.route, COLORS.text],
              'text-halo-color': COLORS.halo,
              'text-halo-width': 1.6,
            }}
          />
        </Source>

        {trip &&
          !stopDetail &&
          trip.stops.map((st, i) => (
            <Marker key={st.stop.city + i} longitude={st.dest.lon} latitude={st.dest.lat} anchor="bottom" offset={[0, -8]}>
              <button
                type="button"
                className={`stop-marker${activePart?.kind === 'stop' && activePart.index === i ? ' is-active' : ''}`}
                onClick={() => onPickStop(i)}
                aria-label={`Stop ${i + 1}: ${st.dest.name}. Zoom in to the stay and the airport transfer`}
              >
                {i + 1}
              </button>
            </Marker>
          ))}

        {stopDetail && (
          <>
            <Marker longitude={stopDetail.centre.lon} latitude={stopDetail.centre.lat} anchor="center">
              <span className="place-marker place-marker--centre">
                <span className="place-marker__dot" aria-hidden="true" />
                {stopDetail.name} centre
              </span>
            </Marker>
            {stopDetail.stay && (
              <Marker longitude={stopDetail.stay.lon} latitude={stopDetail.stay.lat} anchor="center">
                <span className="place-marker place-marker--stay">
                  <Icon name="bed" size={13} />
                  Your stay{stopDetail.stay.km != null ? ` · ${stopDetail.stay.km.toFixed(1)} km from the centre` : ''}
                </span>
              </Marker>
            )}
            {stopDetail.airports.map((a) => (
              <Marker key={a.code} longitude={a.lon} latitude={a.lat} anchor="center">
                <span className="place-marker place-marker--airport">
                  <Icon name="plane" size={13} />
                  {a.code}: {transferLabel(a.choice)}
                </span>
              </Marker>
            ))}
          </>
        )}

        {hover && hoverDest && (
          <Popup longitude={hover.lon} latitude={hover.lat} closeButton={false} closeOnClick={false} offset={14} className="map-tip" anchor="bottom">
            <strong>{hoverDest.name}</strong>
            {hoverStop >= 0 ? (
              <span>Stop {hoverStop + 1} · click to see the stay and the airport transfer</span>
            ) : (
              <>
                {hoverSummary && <span>{focus && focus !== hover.code ? 'With ' + (model.destByCode.get(focus)?.name ?? focus) + ' from ' : 'Routes from '}{eur(hoverSummary.minPP)} per person</span>}
                {hoverDest.prices && (mode === 'beer' || mode === 'food') && (
                  <span>
                    {hoverDest.prices.items.beerBar && `Beer ${money(hoverDest.prices.items.beerBar.eur)}`}
                    {hoverDest.prices.items.beerBar && hoverDest.prices.foodDayEUR != null && ' · '}
                    {hoverDest.prices.foodDayEUR != null && `eating out ${money(hoverDest.prices.foodDayEUR)} a day`}
                  </span>
                )}
                <span className="muted">
                  {hover.code === focus && !trip ? 'Click to show all destinations again' : `Click to see every route through ${hoverDest.name}`}
                </span>
              </>
            )}
          </Popup>
        )}

        {!stopDetail &&
          splitAirports.map((a) => (
            <Marker key={a.code} longitude={a.lon} latitude={a.lat} anchor="center">
              <div className="origin-marker origin-marker--other" title={`Home for some of the group: ${a.name}`}>
                <span className="origin-marker__dot" aria-hidden="true" />
                <span className="origin-marker__label">
                  {a.name.split(' ').pop()} {a.code}
                </span>
              </div>
            </Marker>
          ))}
        <Marker longitude={model.origin.lon} latitude={model.origin.lat} anchor="center">
          <div className="origin-marker">
            <span className="origin-marker__dot" aria-hidden="true" />
            <span className="origin-marker__label">
              Home<span className="origin-marker__name"> · {model.origin.name}</span> {model.origin.code}
            </span>
          </div>
        </Marker>
      </MapGL>
      <div className="map-key">
        {controls}
        <ul className="map-legend" aria-label="Map legend">
          {comparing ? (
            <>
              <li className="map-legend__title">Routes being compared</li>
              {compare.map((c) => (
                <li key={c.e.trip.id}>
                  <span className="compare-badge" style={{ background: compareColor(c.slot) }} aria-hidden="true">
                    {compareLetter(c.slot)}
                  </span>
                  {c.e.title}
                </li>
              ))}
            </>
          ) : mode === 'weather' ? (
            <>
              <li className="map-legend__title">Typical daytime high</li>
              {TEMP_BANDS.map((b, i) => (
                <li key={b.word}>
                  <span className="swatch" style={{ background: shade(b.color) }} />
                  {i === 0 ? `under ${b.below}°C` : b.below === Infinity ? `${TEMP_BANDS[i - 1].below}°C and up` : `${TEMP_BANDS[i - 1].below}–${b.below}°C`}
                </li>
              ))}
            </>
          ) : mode === 'beer' || mode === 'food' ? (
            <>
              <li className="map-legend__title">{mode === 'beer' ? 'Beer in a bar, 0.5 l' : 'Eating out for a day'}</li>
              {INDEX_BANDS.map((b, i) => {
                const median = mode === 'beer' ? model.places?.prices?.beerMedianEUR : model.places?.prices?.foodDayMedianEUR
                const lo = i === 0 ? null : INDEX_BANDS[i - 1].below
                const range =
                  median == null
                    ? ''
                    : lo == null
                      ? ` · under ${money((median * b.below) / 100)}`
                      : b.below === Infinity
                        ? ` · over ${money((median * lo) / 100)}`
                        : ` · ${money((median * lo) / 100)}–${money((median * b.below) / 100)}`
                return (
                  <li key={b.word}>
                    <span className="swatch" style={{ background: shade(b.color) }} />
                    {b.word}
                    {range}
                  </li>
                )
              })}
            </>
          ) : (
            <>
              <li className="map-legend__title">{focus ? `Cheapest route with ${model.destByCode.get(focus)?.name ?? focus}` : 'Cheapest route, per person'}</li>
              <li>
                <span className="swatch" style={{ background: COLORS.low }} />≤ {eur(tiers.low)}
              </li>
              <li>
                <span className="swatch" style={{ background: COLORS.mid }} />
                {eur(tiers.low)}–{eur(tiers.mid)}
              </li>
              <li>
                <span className="swatch" style={{ background: COLORS.high }} />&gt; {eur(tiers.mid)}
              </li>
            </>
          )}
          <li>
            <span className="swatch swatch--small" style={{ background: COLORS.off }} />
            {focus ? 'no route with it' : 'filtered out'}
          </li>
          {trip && (
            <li>
              <span className="swatch swatch--route" />
              open route
            </li>
          )}
        </ul>
      </div>
    </div>
  )
}
