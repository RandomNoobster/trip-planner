import { Fragment, useEffect, useLayoutEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router'
import { Centrality, ChipRow, ExternalLink, Fact, HomePrices } from '../components/bits'
import { PriceStrip, ThingsToDo, WeatherStrip } from '../components/CityInfo'
import { CompareToggle, StayRating } from '../components/TripCard'
import { TripRail, type RailPart } from '../components/TripRail'
import { Icon, type IconName } from '../components/Icon'
import type { Model } from '../data/model'
import { useResearch } from '../data/researchContext'
import type { Leg } from '../data/schema'
import { HEADS_UP_ICON, ICON, MODE_ICON } from '../lib/canon'
import { dealApplies } from '../lib/deals'
import { dateRange, dayLabel, duration, eur, plural, shortDate } from '../lib/format'
import { label, labels, modeOf, operatorName, PLATFORM, ROOM_TYPE, SOURCE } from '../lib/labels'
import { priceLeg, type CostOptions, type TransferChoice, type TransferPref } from '../lib/pricing'
import { dailySpend, EAT_PLAN_LABEL, REFERENCE_PLAN } from '../lib/prices'
import { legsSummary } from '../lib/tripText'
import { cityName, evaluateTrip, homeEnd, homesInUse, type EvalLeg, type EvalStop, type EvalTrip, type HomeEval, type Overrides } from '../lib/trips'
import { useExplore } from '../state/explore'

/** One route in the side pane, next to the map: what it costs, each leg and stay, and what to do there. */
export function TripPane() {
  const { tripId = '' } = useParams()
  const { model } = useResearch()
  const { settings, update, carry, showStopOnMap, mapStop, paneRef, saved, toggleSaved, compareFull, groups, setTripPart } = useExplore()
  const navigate = useNavigate()
  const [choice, setChoice] = useState<{ tripId: string; ov: Overrides }>({ tripId, ov: {} })
  const ov = choice.tripId === tripId ? choice.ov : {}
  const setOv = (fn: (o: Overrides) => Overrides) => setChoice({ tripId, ov: fn(ov) })
  const trip = model.trips.find((t) => t.id === tripId)
  const e = trip ? evaluateTrip(model, trip, settings, ov) : null

  // A newly opened route starts at the top of the pane.
  useLayoutEffect(() => {
    if (paneRef.current) paneRef.current.scrollTop = 0
  }, [tripId, paneRef])

  // The part being read (rail at the top, timeline node) also lights up on the map: that leg's line or that stop's
  // number. The map never moves for it.
  const [part, setPart] = useState('part-overview')
  useEffect(() => {
    const m = part.match(/^part-(leg|stop)-(\d+)$/)
    setTripPart(m ? { kind: m[1] as 'leg' | 'stop', index: Number(m[2]) } : null)
  }, [part, setTripPart])
  useEffect(() => () => setTripPart(null), [setTripPart])

  // Step through the list in its current order without going back to it.
  const at = groups.findIndex((g) => g.variants.some((v) => v.trip.id === tripId))
  const prevId = at > 0 ? groups[at - 1].best.trip.id : null
  const nextId = at >= 0 && at < groups.length - 1 ? groups[at + 1].best.trip.id : null
  const back = (
    <div className="trip-nav">
      <button type="button" className="btn btn--ghost btn--small" onClick={() => navigate({ pathname: '/', search: carry })}>
        <Icon name="back" size={14} /> Back to the routes
      </button>
      {at >= 0 && (
        <span className="trip-nav__step">
          {prevId ? (
            <Link className="btn btn--ghost btn--small" to={{ pathname: `/trip/${encodeURIComponent(prevId)}`, search: carry }} aria-label="Previous route in the list">
              ‹ Previous
            </Link>
          ) : null}
          <span className="muted small">
            {at + 1} of {groups.length}
          </span>
          {nextId ? (
            <Link className="btn btn--ghost btn--small" to={{ pathname: `/trip/${encodeURIComponent(nextId)}`, search: carry }} aria-label="Next route in the list">
              Next ›
            </Link>
          ) : null}
        </span>
      )}
    </div>
  )
  if (!trip || !e) {
    const noHome = trip ? homesInUse(model, settings).find((h) => h.home.id !== model.homes[0].id && !trip.homes?.[h.home.id]) : undefined
    const last = trip?.stops[trip.stops.length - 1]
    return (
      <div className="trip-detail">
        {back}
        <div className="card empty">
          <h2>{noHome ? `No flight home to ${noHome.home.name}` : trip ? 'This route does not fit your filters' : 'Route not found'}</h2>
          <p className="muted">
            {noHome && last
              ? `No flight from ${cityName(model, last.city)} to ${noHome.home.airport} was found on ${shortDate(last.checkout)}, and ${plural(noHome.count, 'traveler')} in your group ${noHome.count === 1 ? 'flies' : 'fly'} home there. Change who flies home where under Flying home to see it.`
              : trip
              ? 'It may need a youth fare you switched off, or no flight, train or stay on it meets your leg and stay filters (rating, reviews, distance from the centre, leg length, transport, companies).'
              : 'It is not in the active research set. It may belong to another season.'}
          </p>
        </div>
      </div>
    )
  }

  const chooseLeg = (i: number, id: string | null) =>
    setOv((o) => {
      const legs = { ...o.legs }
      if (id) legs[i] = id
      else delete legs[i]
      return { ...o, legs }
    })
  const chooseHome = (home: string, id: string | null) =>
    setOv((o) => {
      const homes = { ...o.homes }
      if (id) homes[home] = id
      else delete homes[home]
      return { ...o, homes }
    })
  const chooseStay = (i: number, id: string | null) =>
    setOv((o) => {
      const stays = { ...o.stays }
      if (id) stays[i] = id
      else delete stays[i]
      return { ...o, stays }
    })

  const weakest = e.stops.reduce((a, b) => (b.chosen.adjusted < a.chosen.adjusted ? b : a))
  // how sure the weakest stay's own rating is, from its review count
  const conf = weakest.chosen.confidence
  const longest = e.legs.reduce((a, b) => (b.minutes > a.minutes ? b : a))
  const custom = Object.keys(ov.legs ?? {}).length + Object.keys(ov.stays ?? {}).length + Object.keys(ov.homes ?? {}).length > 0
  // the legs from here on are only for the travellers flying to the main home when the group splits up
  const split = e.split ? e.trip.legs.length - 1 : Infinity
  // legs that are the main home's own flight home (not the trip's), whose other options are other flights to that home
  const isOwn = (i: number) => e.mainHome.own.length > 0 && i >= e.trip.legs.length - 1
  const others = e.homes.filter((h) => h !== e.mainHome)
  const homeLabel = (h: HomeEval) => `${cityName(model, homeEnd(h))} ${homeEnd(h)}`
  const opts: CostOptions = { n: settings.n, bags: settings.bags, transfer: settings.transfer, rooms: settings.rooms }

  const parts: RailPart[] = [{ id: 'part-overview', kind: 'overview', label: 'Overview', title: 'Overview: price, key figures and heads-ups' }]
  e.legs.forEach((l, i) => {
    const from = cityName(model, l.leg.fromCity)
    const to = cityName(model, l.leg.toCity)
    parts.push({ id: `part-leg-${i}`, kind: 'leg', icon: MODE_ICON[modeOf(l.leg.kind)], label: String(i + 1), title: `Leg ${i + 1}: ${from} to ${to}` })
    const st = e.stops[i]
    if (st) parts.push({ id: `part-stop-${i}`, kind: 'stop', stop: i + 1, label: st.dest.name, title: `Stop ${i + 1}: ${st.dest.name}, ${plural(st.stop.nights, 'night')}` })
  })
  if (others.length) parts.push({ id: 'part-split', kind: 'leg', icon: ICON.home, label: 'Home', title: 'Flying home: the others\' flights' })
  parts.push({ id: 'part-checklist', kind: 'checklist', icon: ICON.included, label: 'Checklist', title: 'Checklist: what each stay and leg includes' })
  parts.push({ id: 'part-book', kind: 'book', icon: 'external', label: 'Book', title: 'Booking links and student deals' })

  return (
    <article className="trip-detail" aria-labelledby="trip-title">
      {back}
      <TripRail parts={parts} active={part} onActive={setPart} paneRef={paneRef} />
      <section className="summary" id="part-overview" aria-label="Trip summary">
        <div>
          <span className="eyebrow">{e.isMulti ? `Multi-city · ${e.stops.length} cities` : 'One city'}</span>
          <h2 id="trip-title">{e.title}</h2>
          <p className="muted">
            {dateRange(e.trip.start, e.trip.end)} · {e.stops.map((s) => s.stop.nights).join(' + ')} nights · {plural(settings.n, 'traveler')} ·{' '}
            {settings.rooms === 'own' ? 'own room each' : 'sharing rooms'} · from {model.origin.name}
          </p>
        </div>
        <div className="summary__price">
          <div className="price__pp price__pp--big">
            {eur(e.totalPP)} <span className="muted small">{e.split ? 'per person, average' : 'per person'}</span>
          </div>
          <div className="muted small">
            {eur(e.groupTotal)} for {settings.n} · captured {shortDate(model.set.meta.capturedAt)}
          </div>
          <HomePrices e={e} className="price__homes" />
          <CompareToggle slot={saved.includes(tripId) ? saved.indexOf(tripId) : null} full={compareFull} onToggle={() => toggleSaved(tripId)} />
          {custom && (
            <button type="button" className="btn btn--ghost btn--small" onClick={() => setOv(() => ({}))}>
              Reset to cheapest choices
            </button>
          )}
        </div>
      </section>

      <section className="kpis" aria-label="Key figures">
        <Kpi
          icon={ICON.transport}
          title="Transport, door to door"
          value={eur(e.transportPP)}
          sub={`fares ${eur(e.faresPP)}${e.bagsPP ? ` + bags ${eur(e.bagsPP)}` : ''} + transfers ${eur(e.transfersPP)} · ${legsSummary(e)}`}
        />
        <Kpi icon={ICON.stays} title="Stays" value={eur(e.staysPP)} sub={`per person · ${e.trip.nights} nights`} />
        {e.entryPP > 0 && (
          <Kpi icon={ICON.entry} title="Entry permits" value={eur(e.entryPP)} sub={`${e.entryNames.join(', ')}: paid before you travel; skip it if you already hold one`} tone="caution" />
        )}
        {e.foodPP > 0 && <Kpi icon={ICON.food} title="Food & drink" value={eur(e.foodPP)} sub={`${EAT_PLAN_LABEL[settings.eat].toLowerCase()}, at each city's prices`} />}
        <Kpi
          icon={ICON.rating}
          title="Weakest stay"
          value={`★ ${weakest.chosen.adjusted.toFixed(2)}`}
          sub={`${weakest.dest.name} · ${weakest.chosen.stay.reviews.toLocaleString('en-GB')} reviews · ${conf} confidence`}
          tone={conf === 'high' ? undefined : conf === 'medium' ? 'caution' : 'bad'}
        />
        <Kpi
          icon={ICON.time}
          title="Time travelling"
          value={duration(e.transitMin)}
          sub={`${plural(e.legs.length, 'leg')} · longest ${duration(longest.minutes)}`}
          tone={e.headsUp.some((h) => h.kind === 'long') ? 'caution' : undefined}
        />
      </section>

      {settings.eat === 'off' && e.foodEstPP != null && (
        <p className="food-note small">
          <Icon name="beer" size={14} />
          <span>
            Food and drink are not in the price. With {EAT_PLAN_LABEL[REFERENCE_PLAN].toLowerCase()} they add about <strong>{eur(e.foodEstPP)}</strong> per
            person ({e.stops.map((st) => `${st.dest.name} ${eur(dailySpend(st.dest.prices, REFERENCE_PLAN) ?? 0)} a day`).join(', ')}).
          </span>
          <button type="button" className="link-btn" onClick={() => update({ eat: REFERENCE_PLAN })}>
            Add it to every price
          </button>
        </p>
      )}

      <RouteChain model={model} e={e} onStop={showStopOnMap} activeStop={mapStop} ends={e.homes.map((h) => (e.split ? `${h.home.short ?? h.home.name} ${homeEnd(h)}` : homeLabel(h)))} />

      {e.headsUp.length > 0 && (
        <section className="card headsup" aria-label="Heads-ups">
          <h3>Heads-up</h3>
          <ul>
            {e.headsUp.map((h) => (
              <li key={h.text}>
                <Icon name={HEADS_UP_ICON[h.kind]} size={14} /> {h.text}
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="itinerary" aria-label="Legs and stops">
        <h3>Leg by leg</h3>
        {/* one line from home and back: each leg, then each stop with its stay and city guide grouped under it */}
        <ol className="timeline">
          {e.legs.map((l, i) => {
            const st = e.stops[i]
            return (
              <Fragment key={`leg-${i}`}>
                <li id={`part-leg-${i}`} className={`tl-item tl-item--leg${part === `part-leg-${i}` ? ' is-current' : ''}`}>
                  <span className="tl-node" aria-hidden="true">
                    <Icon name={MODE_ICON[modeOf(l.leg.kind)]} size={13} />
                  </span>
                  <LegCard
                    model={model}
                    l={l}
                    ends={{ from: i === 0 ? 'home' : i, to: i === e.legs.length - 1 ? 'home' : i + 1 }}
                    opts={i >= split ? { ...opts, n: e.mainHome.count } : opts}
                    who={i >= split ? e.mainHome : undefined}
                    chosenId={isOwn(i) ? ov.homes?.[e.mainHome.home.id] : ov.legs?.[i]}
                    onUse={(id) => (isOwn(i) ? chooseHome(e.mainHome.home.id, id) : chooseLeg(i, id))}
                  />
                </li>
                {st && (
                  <li id={`part-stop-${i}`} className={`tl-item tl-item--stop${part === `part-stop-${i}` ? ' is-current' : ''}`}>
                    <span className="tl-node tl-node--stop" aria-hidden="true">
                      {i + 1}
                    </span>
                    <section className="stop-chapter" aria-labelledby={`stop-${i}-title`}>
                      <header className="stop-chapter__head">
                        <h3 id={`stop-${i}-title`}>
                          <span className="sr-only">Stop {i + 1}: </span>
                          {st.dest.name}
                        </h3>
                        <span className="facts">
                          <Fact icon={ICON.nights}>{plural(st.stop.nights, 'night')}</Fact>
                          <Fact icon={ICON.dates}>
                            {shortDate(st.stop.checkin)} – {shortDate(st.stop.checkout)}
                          </Fact>
                        </span>
                      </header>
                      <StayCard
                        st={st}
                        index={i}
                        n={settings.n}
                        onUse={(id) => chooseStay(i, id)}
                        overridden={!!ov.stays?.[i]}
                        onMap={() => showStopOnMap(mapStop === i ? null : i)}
                        onMapNow={mapStop === i}
                      />
                      <CityCard model={model} st={st} carry={carry} />
                    </section>
                  </li>
                )}
              </Fragment>
            )
          })}
          {others.length > 0 && (
            <li id="part-split" className={`tl-item tl-item--split${part === 'part-split' ? ' is-current' : ''}`}>
              <span className="tl-node" aria-hidden="true">
                <Icon name={ICON.home} size={13} />
              </span>
              <section className="split" aria-labelledby="split-title">
                <header className="stop-chapter__head">
                  <h3 id="split-title">Flying home elsewhere</h3>
                </header>
                <p className="muted small">
                  Everyone flies home from {e.stops[e.stops.length - 1].dest.name} on {shortDate(e.trip.end)}. {plural(e.mainHome.count, 'traveler')} to{' '}
                  {e.mainHome.home.name} take{e.mainHome.count === 1 ? 's' : ''} leg {split + 1} above; the others fly these instead.
                </p>
                {model.set.meta.homesNote && <p className="muted small">{model.set.meta.homesNote}</p>}
                {others.map((h) => (
                  <div key={h.home.id} className="split__home">
                    <h4 className="split__title">
                      <span>
                        {plural(h.count, 'traveler')} to {h.home.name} <span className="muted small">· {h.home.airport}</span>
                      </span>
                      <span className="split__price">
                        {eur(h.totalPP)} <span className="muted small">each, whole trip</span>
                      </span>
                    </h4>
                    {h.own.length > 1 && (
                      <p className="muted small">The round trip cannot be split, so they fly out on a one-way ticket and home on another.</p>
                    )}
                    {h.own.map((l, k) => (
                      <LegCard
                        key={l.leg.id}
                        model={model}
                        l={l}
                        ends={{ from: l.index === 0 ? 'home' : l.index, to: k === h.own.length - 1 ? 'home' : l.index + 1 }}
                        opts={{ ...opts, n: h.count }}
                        who={h}
                        chosenId={k === h.own.length - 1 ? ov.homes?.[h.home.id] : undefined}
                        onUse={(id) => chooseHome(h.home.id, id)}
                      />
                    ))}
                  </div>
                ))}
              </section>
            </li>
          )}
          <li className="tl-item tl-item--home">
            <span className="tl-node tl-node--home" aria-hidden="true">
              <Icon name={ICON.city} size={12} />
            </span>
            <p className="tl-home">Home · {e.split ? e.homes.map((h) => homeLabel(h)).join(' · ') : homeLabel(e.mainHome)}</p>
          </li>
        </ol>
      </section>

      <div className="trip-part" id="part-checklist">
        <StayMatrix e={e} />
        <TransportMatrix e={e} />
      </div>
      <div className="trip-part" id="part-book">
        <BookingLinks model={model} e={e} />
        <TripDeals model={model} e={e} carry={carry} />
      </div>
    </article>
  )
}

/** Weather, prices and things to do where the trip stops, with events marked when they fall inside the stay. */
function CityCard({ model, st, carry }: { model: Model; st: EvalStop; carry: string }) {
  const { dest } = st
  const params = new URLSearchParams(carry)
  params.set('city', dest.code)
  return (
    <section className="card city-card" aria-label={`${dest.name}: weather, prices and things to do`}>
      <div className="city-card__head">
        <h3>In {dest.name}</h3>
        <Link to={{ pathname: '/', search: `?${params}` }} className="small">
          Other routes through {dest.name}
        </Link>
      </div>
      {dest.climate && <WeatherStrip climate={dest.climate} name={dest.name} />}
      <PriceStrip dest={dest} />
      <ThingsToDo items={model.activitiesByCity.get(dest.code) ?? []} cityName={dest.name} stay={{ start: st.stop.checkin, end: st.stop.checkout }} initial={4} wikivoyage={dest.wikivoyage} />
    </section>
  )
}

function Kpi({ icon, title, value, sub, tone }: { icon: IconName; title: string; value: string; sub: string; tone?: 'caution' | 'bad' }) {
  return (
    <div className="kpi card">
      <span className="kpi__title">
        <Icon name={icon} size={13} /> {title}
      </span>
      <span className={`kpi__value${tone ? ` tone-${tone}` : ''}`}>{value}</span>
      <span className="muted small">{sub}</span>
    </div>
  )
}

function RouteChain({ model, e, onStop, activeStop, ends }: { model: Model; e: EvalTrip; onStop: (i: number | null) => void; activeStop: number | null; ends: string[] }) {
  return (
    <section className="card route-chain" aria-label="Route">
      <ol>
        <li className="chain-node chain-node--origin">
          {model.origin.name} {model.origin.code}
        </li>
        {e.legs.map((l, i) => {
          const mode = modeOf(l.leg.kind)
          const st = e.stops[i]
          return (
            <Fragment key={l.leg.id + i}>
              <li className="chain-leg">
                <span className="chain-leg__line" aria-hidden="true" />
                <span className="chain-leg__text small">
                  <Icon name={MODE_ICON[mode]} size={14} />
                  {mode === 'flight' ? 'Flight' : mode === 'train' ? 'Train' : 'Bus'} · {duration(l.minutes)} · {eur(l.costPP)}
                </span>
              </li>
              {st ? (
                <li className="chain-node">
                  <button type="button" className={`chain-stop${activeStop === i ? ' is-active' : ''}`} onClick={() => onStop(activeStop === i ? null : i)} aria-pressed={activeStop === i}>
                    <span className="stop-marker stop-marker--inline" aria-hidden="true">
                      {i + 1}
                    </span>
                    {st.dest.name}
                  </button>
                  <span className="muted small">
                    {plural(st.stop.nights, 'night')} · {shortDate(st.stop.checkin)}–{shortDate(st.stop.checkout)}
                  </span>
                </li>
              ) : (
                <li className="chain-node chain-node--origin">{ends.join(' · ')}</li>
              )}
            </Fragment>
          )
        })}
      </ol>
      <p className="muted small">Click a stop to see the stay, the city centre and the airport transfer on the map.</p>
    </section>
  )
}

/** Where a leg starts or ends: home, or a stop by its number (as on the map, the rail and the timeline). */
type LegEnd = 'home' | number

function EndMark({ end }: { end: LegEnd }) {
  if (end === 'home') {
    return (
      <span className="end-mark end-mark--home" aria-hidden="true">
        <Icon name={ICON.city} size={10} />
      </span>
    )
  }
  return (
    <span className="stop-marker stop-marker--inline end-mark" aria-hidden="true">
      {end}
    </span>
  )
}

/** "[home] Trondheim Værnes → [1] Warsaw WAW": the leg between two numbered ends. */
function LegTitle({ model, leg, ends }: { model: Model; leg: Leg; ends: { from: LegEnd; to: LegEnd } }) {
  const from = `${cityName(model, leg.fromCity)}${leg.from && leg.from !== leg.fromCity ? ` ${leg.from}` : ''}`
  const to = `${cityName(model, leg.toCity)}${leg.to && leg.to !== leg.toCity ? ` ${leg.to}` : ''}`
  return (
    <>
      <EndMark end={ends.from} /> {from} → <EndMark end={ends.to} /> {to}
    </>
  )
}

function legFacts(leg: Leg): string {
  const parts: string[] = []
  parts.push(operatorName(leg))
  if (leg.stops === 0) parts.push('direct')
  else if (leg.stops) parts.push(`${plural(leg.stops, 'stop')}${leg.via?.length ? ` via ${leg.via.filter(Boolean).join(', ')}` : ''}`)
  if (leg.durationMin) parts.push(duration(leg.durationMin))
  if (leg.depTime) parts.push(`departs ${leg.depTime}${leg.arrTime ? `, arrives ${leg.arrTime}` : ''}`)
  if (leg.roundTrip) parts.push('round-trip fare, return included')
  return parts.join(' · ')
}

const capital = (s: string) => (s ? s[0].toUpperCase() + s.slice(1) : s)

function whyText(t: TransferChoice, pref: TransferPref, n: number): string {
  const both = !!t.transfer.public && !!t.transfer.taxi
  if (!t.how) return 'No price found for this transfer; budget for a local bus or a taxi.'
  if (!both) return `The only option with a price${t.how === 'taxi' ? ', shared per car' : ''}.`
  if (pref === 'public') return 'Public transport, as set under Airport transfers.'
  if (pref === 'taxi') return 'Taxi, as set under Airport transfers; one car per 4 people.'
  return `Cheapest for ${plural(n, 'traveler')}: ${t.how === 'taxi' ? 'sharing a taxi beats the bus or train' : 'public transport beats sharing a taxi'}.`
}

/**
 * One airport or station transfer, spelled out: the exact service, where it runs, what it costs and why it was picked.
 * A leg lists its transfers in travel order: at the departure city (to the airport or station), then at the arrival
 * city (from it); round trips repeat both on the way home.
 */
function TransferItem({ model, t, opts, arriving }: { model: Model; t: TransferChoice; opts: CostOptions; arriving: boolean }) {
  const tr = t.transfer
  const city = cityName(model, tr.where)
  const homeAirport = tr.where !== model.origin.code && model.airportNames.has(tr.where)
  if (tr.where === model.origin.code || (homeAirport && !tr.public?.eur)) {
    return (
      <li className="transfer">
        <div className="transfer__head">
          <Icon name="walk" size={14} />
          <strong>{arriving ? `${city} → home` : `Home → ${city}`}</strong>
          <span className="transfer__price">free</span>
        </div>
        <p className="muted small">Getting to and from {tr.where === model.origin.code ? 'your home airport' : city} costs nothing, as you said.</p>
      </li>
    )
  }
  const pub = tr.public
  const taxi = tr.taxi
  const place = tr.kind === 'airport' ? `${tr.place ?? city} airport` : (tr.place ?? `${city} station`)
  const head = homeAirport ? `${city} → ${pub?.to ?? 'home'}` : arriving ? `${place} → ${city} centre` : `${city} centre → ${place}`
  const taxiEach = taxi ? (Math.ceil(opts.n / Math.max(1, taxi.capacity)) * taxi.eurPerCar) / opts.n : null
  return (
    <li className="transfer">
      <div className="transfer__head">
        <Icon name={tr.kind === 'airport' ? 'plane' : pub?.mode === 'walk' ? 'walk' : 'train'} size={14} />
        <strong>{head}</strong>
        <span className="transfer__price">{t.how ? `${eur(t.eur)} each` : 'no price'}</span>
      </div>
      {pub && (
        <p className={`transfer__opt${t.how === 'public' ? ' is-used' : ''}`}>
          {t.how === 'public' && <span className="tag tag--used">Used</span>}
          {pub.mode === 'walk' ? (
            <>
              <strong>Walk</strong>
              {pub.to && ` · ${pub.to}`}
              {pub.min ? ` · about ${pub.min} min` : ''} · free
            </>
          ) : (
            <>
              <strong>{pub.line ?? capital(pub.mode ?? 'public transport')}</strong>
              {pub.from && ` · ${pub.from}`}
              {pub.to && ` → ${pub.to}`}
              {' · '}
              {pub.min ? `${pub.min} min · ` : ''}
              {pub.estimate ? 'about ' : ''}
              {eur(pub.eur)} per person{' '}
              {pub.estimate && (
                <span className="tag tag--warn" title="The service is researched, but this fare is an earlier rough figure; check the operator">
                  estimate
                </span>
              )}
            </>
          )}
        </p>
      )}
      {pub && (pub.fareText || pub.freq || pub.hours || pub.url || pub.note) && (
        <div className="transfer__more muted small">
          {[pub.fareText && `Ticket: ${pub.fareText}`, pub.freq, pub.hours && `runs ${pub.hours}`].filter(Boolean).join(' · ')}
          {pub.url && (
            <>
              {' · '}
              <ExternalLink href={pub.url}>source</ExternalLink>
            </>
          )}
          {pub.note && (
            <details className="transfer__notes">
              <summary>Notes</summary>
              {pub.note}
            </details>
          )}
        </div>
      )}
      {taxi && taxiEach != null && (
        <p className={`transfer__opt${t.how === 'taxi' ? ' is-used' : ''}`}>
          {t.how === 'taxi' && <span className="tag tag--used">Used</span>}
          <strong>Taxi or ride-hailing</strong> · about {eur(taxi.eurPerCar)} per car{taxi.min ? `, ${taxi.min} min` : ''}, so {eur(taxiEach)} each for {opts.n}
          {taxi.basis && <span className="muted"> · {taxi.basis}</span>}
          {taxi.url && (
            <>
              {' · '}
              <ExternalLink href={taxi.url}>source</ExternalLink>
            </>
          )}
        </p>
      )}
      <p className="muted small">{whyText(t, opts.transfer, opts.n)}</p>
    </li>
  )
}

function LegCard({
  model,
  l,
  ends,
  opts,
  who,
  chosenId,
  onUse,
}: {
  model: Model
  l: EvalLeg
  ends: { from: LegEnd; to: LegEnd }
  opts: CostOptions
  /** set when only some of the group take this leg: the ones flying home to that place */
  who?: HomeEval
  chosenId?: string
  onUse: (id: string | null) => void
}) {
  const mode = modeOf(l.leg.kind)
  const source = SOURCE[l.leg.source ?? ''] ?? l.leg.source ?? 'source'
  const n = opts.n
  const wantsBags = opts.bags.cabin || opts.bags.checked
  return (
    <article className="card step">
      <div className="step__when">
        <span className="step__date">{l.travelDate ? dayLabel(l.travelDate) : 'Date flexible'}</span>
        <span className="step__kind">
          <Icon name={MODE_ICON[mode]} size={14} /> Leg {l.index + 1}
        </span>
        {who && (
          <span className="step__who" title={`Only the ${plural(who.count, 'traveler')} flying home to ${who.home.name} take this leg`}>
            <Icon name={ICON.home} size={12} /> {who.count} to {who.home.short ?? who.home.name}
          </span>
        )}
      </div>
      <div className="step__body">
        <div className="step__head">
          <h4>
            <LegTitle model={model} leg={l.leg} ends={ends} /> <span className="muted">· {legFacts(l.leg)}</span>
          </h4>
          <span className="step__price">
            {eur(l.costPP)} <span className="muted small">pp · {eur(l.costPP * n)} for {n}</span>
          </span>
        </div>
        <div className="facts">
          <Fact icon={ICON.fares} label={l.price.fareNote ? `fare · ${l.price.fareNote}` : 'fare'}>
            {eur(l.price.fare)}
          </Fact>
          {wantsBags && (
            <Fact
              icon={ICON.bags}
              tone={l.price.bags.eur > 0 ? null : 'good'}
              label={l.price.bags.eur > 0 ? `bags · ${l.price.bags.basis}${l.price.bags.estimate ? ' (typical price)' : ''}` : 'bags'}
            >
              {l.price.bags.eur > 0 ? eur(l.price.bags.eur) : 'included'}
            </Fact>
          )}
          <Fact icon={ICON.transfers} label="transfers">
            {eur(l.price.transferEUR)}
          </Fact>
        </div>
        {l.price.transfers.length > 0 && (
          <ul className="transfer-list small">
            {l.price.transfers.map((t, i) => (
              <TransferItem key={i} model={model} t={t} opts={opts} arriving={i % 2 === 1} />
            ))}
          </ul>
        )}
        {l.leg.fareType === 'youth' && <p className="tag tag--youth">Youth fare{l.leg.fareFamily ? ` · ${l.leg.fareFamily}` : ''}</p>}
        <ChipRow title="Included" tone="included" items={labels(l.leg.includes)} />
        <ChipRow title="Missing" tone="missing" items={labels(l.leg.missing)} />
        <p className="links small">
          <ExternalLink href={l.leg.url}>Open on {source}</ExternalLink>
          {l.leg.notes && <span className="muted">{l.leg.notes}</span>}
        </p>
        {l.alternatives.length > 0 && (
          <details className="alts">
            <summary>
              {plural(l.alternatives.length, 'other option')} on this route
              {chosenId && (
                <button type="button" className="link-btn" onClick={() => onUse(null)}>
                  back to cheapest
                </button>
              )}
            </summary>
            <ul>
              {l.alternatives.slice(0, 8).map((a) => (
                <li key={a.id} className="alt">
                  <span>
                    <strong>{operatorName(a)}</strong> <span className="muted small">{legFacts(a)}</span>
                    {a.fareType === 'youth' && <span className="tag tag--youth">Youth fare</span>}
                  </span>
                  <span className="alt__price">{eur(priceLeg(a, opts).total)}</span>
                  <span className="muted small">{duration(priceLeg(a, opts).minutes)}</span>
                  <button type="button" className="btn btn--ghost btn--small" onClick={() => onUse(a.id)}>
                    Use this
                  </button>
                </li>
              ))}
            </ul>
          </details>
        )}
      </div>
    </article>
  )
}

type StayCardProps = {
  st: EvalStop
  index: number
  n: number
  onUse: (id: string | null) => void
  overridden: boolean
  onMap: () => void
  onMapNow: boolean
}

function StayCard({ st, index, n, onUse, overridden, onMap, onMapNow }: StayCardProps) {
  const { stay } = st.chosen
  const others = st.options.filter((o) => o.stay.id !== stay.id)
  return (
    <article className="card step">
      <div className="step__when">
        <span className="step__date">
          {shortDate(st.stop.checkin)}–{shortDate(st.stop.checkout)}
        </span>
        <span className="step__kind">
          <Icon name={ICON.stays} size={14} /> Stay {index + 1}
        </span>
      </div>
      <div className="step__body">
        <div className="step__head">
          <h4>{stay.name}</h4>
          <span className="step__price">
            {eur(st.totalPP)} <span className="muted small">pp · {st.chosen.note} · {eur(st.chosen.nightPP * n)} a night for {n}</span>
          </span>
        </div>
        <div className="facts">
          <StayRating st={st} />
          <span className="fact__label">
            {ROOM_TYPE[stay.roomType] ?? stay.roomType} on {PLATFORM[stay.platform] ?? stay.platform}
            {stay.bedrooms != null && ` · ${plural(stay.bedrooms, 'bedroom')}`}
            {stay.beds != null && ` · ${plural(stay.beds, 'bed')}`}
          </span>
        </div>
        <p className="stay-where small">
          <Centrality stay={stay} showUnknown />
          {stay.address && <span className="muted">{stay.address}</span>}
          <button type="button" className="link-btn" onClick={onMap} aria-pressed={onMapNow}>
            <Icon name="map" size={13} /> {onMapNow ? 'Back to the whole route' : 'Show the stay and transfers on the map'}
          </button>
        </p>
        <ChipRow title="Included" tone="included" items={labels(stay.includes)} />
        <ChipRow title="Missing" tone="missing" items={labels(stay.missing)} />
        {st.dest.entryInfo?.level && st.dest.entryInfo.level !== 'id' ? (
          <p className="tag tag--warn">
            <Icon name={ICON.entry} size={12} /> Entry: {st.dest.entryInfo.paperwork ?? st.dest.entry}
          </p>
        ) : (
          st.dest.schengen === false &&
          st.dest.entry && (
            <p className="tag tag--warn">
              <Icon name={ICON.entry} size={12} /> Outside Schengen: {st.dest.entry}
            </p>
          )
        )}
        <p className="links small">
          <ExternalLink href={stay.url}>Open on {PLATFORM[stay.platform] ?? stay.platform}</ExternalLink>
          <span className="muted">Nightly price from an 8-night search for these dates; shorter stays can cost a little more per night.</span>
        </p>
        {others.length > 0 && (
          <details className="alts">
            <summary>
              {plural(others.length, 'other stay')} in {st.dest.name}
              {overridden && (
                <button type="button" className="link-btn" onClick={() => onUse(null)}>
                  back to cheapest
                </button>
              )}
            </summary>
            <ul>
              {others.map((o) => (
                <li key={o.stay.id} className="alt">
                  <span>
                    <strong>{o.stay.name}</strong>{' '}
                    <span className="muted small">
                      {ROOM_TYPE[o.stay.roomType] ?? o.stay.roomType} · {o.stay.rating ?? '–'}/{o.stay.ratingScale ?? 5} · {o.stay.reviews} reviews · adj{' '}
                      {o.adjusted.toFixed(2)}
                      {o.stay.centerKm != null && ` · ${o.stay.centerKm.toFixed(1)} km from the centre`}
                    </span>
                  </span>
                  <span className="alt__price">{eur(o.nightPP)}</span>
                  <span className="muted small">pp/night</span>
                  <button type="button" className="btn btn--ghost btn--small" onClick={() => onUse(o.stay.id)}>
                    Use this
                  </button>
                </li>
              ))}
            </ul>
          </details>
        )}
      </div>
    </article>
  )
}

type Cell = 'yes' | 'no' | 'unknown'

function has(list: string[], name: string): boolean {
  return list.some((x) => label(x) === name)
}

function cell(includes: string[], missing: string[], name: string): Cell {
  if (has(missing, name)) return 'no'
  if (has(includes, name)) return 'yes'
  return 'unknown'
}

function CellMark({ c }: { c: Cell }) {
  if (c === 'yes') return <Icon name="check" size={16} label="Included" />
  if (c === 'no') return <Icon name="x" size={16} label="Missing" />
  return (
    <span className="muted" aria-label="Not stated">
      –
    </span>
  )
}

function StayMatrix({ e }: { e: EvalTrip }) {
  const rows: [string, (st: EvalStop) => Cell][] = [
    ['Whole place', (st) => (st.chosen.stay.roomType === 'entire_home' ? 'yes' : 'no')],
    ['Private room', () => 'yes'],
    ['Private bathroom', (st) => cell(st.chosen.stay.includes, st.chosen.stay.missing, 'Private bathroom')],
    ['Kitchen', (st) => cell(st.chosen.stay.includes, st.chosen.stay.missing, 'Kitchen')],
    ['Breakfast', (st) => cell(st.chosen.stay.includes, st.chosen.stay.missing, 'Breakfast')],
    ['Wi-Fi', (st) => cell(st.chosen.stay.includes, st.chosen.stay.missing, 'Wi-Fi')],
  ]
  return (
    <section className="card side-card">
      <h3>What each stay gives you</h3>
      <div className="table-scroll">
        <table className="matrix">
          <thead>
            <tr>
              <th scope="col">
                <span className="sr-only">Feature</span>
              </th>
              {e.stops.map((st, i) => (
                <th key={i} scope="col">
                  {st.dest.code}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map(([name, fn]) => (
              <tr key={name}>
                <th scope="row">{name}</th>
                {e.stops.map((st, i) => (
                  <td key={i} className={`cell--${fn(st)}`}>
                    <CellMark c={fn(st)} />
                  </td>
                ))}
              </tr>
            ))}
            <tr>
              <th scope="row">From the centre</th>
              {e.stops.map((st, i) => (
                <td key={i}>{st.chosen.stay.centerKm != null ? `${st.chosen.stay.centerKm.toFixed(1)} km` : '–'}</td>
              ))}
            </tr>
            <tr>
              <th scope="row">Adjusted rating</th>
              {e.stops.map((st, i) => (
                <td key={i}>
                  <strong>{st.chosen.adjusted.toFixed(2)}</strong>
                </td>
              ))}
            </tr>
          </tbody>
        </table>
      </div>
    </section>
  )
}

function TransportMatrix({ e }: { e: EvalTrip }) {
  const bag = (l: EvalLeg, which: 'cabin' | 'checked'): Cell | string => {
    const b = l.leg.bags?.[which]
    if (!b) return 'unknown'
    if (b.included) return 'yes'
    return b.addEUR != null ? `${b.estimate ? '~' : ''}+${eur(b.addEUR)}` : 'no'
  }
  const rows: [string, (l: EvalLeg) => Cell | string][] = [
    ['Cabin bag (overhead bin)', (l) => bag(l, 'cabin')],
    ['Checked bag', (l) => bag(l, 'checked')],
    ['Seat reservation', (l) => cell(l.leg.includes, l.leg.missing, 'Seat reservation')],
    ['Longest layover', (l) => (l.leg.stops ? duration(l.leg.layoverMin) : 'direct')],
  ]
  return (
    <section className="card side-card">
      <h3>Transport extras</h3>
      <div className="table-scroll">
        <table className="matrix">
          <thead>
            <tr>
              <th scope="col">
                <span className="sr-only">Feature</span>
              </th>
              {e.legs.map((l) => (
                <th key={l.index} scope="col">
                  Leg {l.index + 1}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map(([name, fn]) => (
              <tr key={name}>
                <th scope="row">{name}</th>
                {e.legs.map((l) => {
                  const v = fn(l)
                  return (
                    <td key={l.index} className={v === 'yes' || v === 'no' || v === 'unknown' ? `cell--${v}` : undefined}>
                      {v === 'yes' || v === 'no' || v === 'unknown' ? <CellMark c={v} /> : <span className="muted small">{v}</span>}
                    </td>
                  )
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="muted small">
        A tick means the fare or mode includes it; +€ is what adding it costs per person on that leg (~ marks a typical price, not a quote). A dash means the source did not say.
      </p>
    </section>
  )
}

function BookingLinks({ model, e }: { model: Model; e: EvalTrip }) {
  const [copied, setCopied] = useState(false)
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
    <section className="card side-card">
      <h3>Booking links</h3>
      <p className="muted small">Every price links to where it was found. You book each piece yourself.</p>
      <ul className="booking-list">
        {/* the legs everyone takes, then each home's own flights when the group splits up at the end */}
        {[...e.legs.map((l) => ({ l, who: e.split && l.index >= e.trip.legs.length - 1 ? e.mainHome : null })),
          ...e.homes.filter((h) => h !== e.mainHome).flatMap((h) => h.own.map((l) => ({ l, who: h })))].map(({ l, who }) => (
          <li key={`${who?.home.id ?? ''}${l.leg.id}`}>
            <span>
              <Icon name={MODE_ICON[modeOf(l.leg.kind)]} size={13} /> {modeOf(l.leg.kind) === 'flight' ? 'Flight' : modeOf(l.leg.kind) === 'train' ? 'Train' : 'Bus'}{' '}
              {cityName(model, l.leg.fromCity)} → {cityName(model, l.leg.toCity)} · {operatorName(l.leg)} · {eur(l.costPP)} pp
              {who && (
                <span className="muted">
                  {' '}
                  · {who.count} to {who.home.short ?? who.home.name}
                </span>
              )}
            </span>
            <ExternalLink href={l.leg.url}>Open</ExternalLink>
          </li>
        ))}
        {e.stops.map((st) => (
          <li key={st.chosen.stay.id}>
            <span>
              <Icon name={ICON.stays} size={13} /> {st.chosen.stay.name}, {st.dest.name} · {eur(st.chosen.nightPP)} pp/night
            </span>
            <ExternalLink href={st.chosen.stay.url}>Open</ExternalLink>
          </li>
        ))}
      </ul>
      <button type="button" className="btn btn--ghost" onClick={copy}>
        <Icon name="copy" size={14} /> {copied ? 'Link copied' : 'Copy link for the group'}
      </button>
    </section>
  )
}

function TripDeals({ model, e, carry }: { model: Model; e: EvalTrip; carry: string }) {
  const deals = (model.set.discounts ?? []).filter((d) => dealApplies(d, e)).slice(0, 6)
  if (!deals.length) return null
  return (
    <section className="card side-card">
      <h3>Student deals on this trip</h3>
      <ul className="deal-mini">
        {deals.map((d) => (
          <li key={`${d.provider}-${d.country ?? ''}`}>
            <strong>{d.provider}</strong>
            {d.country && d.country !== 'Europe' && <span className="muted small"> · {d.country}</span>}
            <div className="small">{d.benefit}</div>
          </li>
        ))}
      </ul>
      <Link to={{ pathname: '/deals', search: carry }} className="small">
        All student and youth deals
      </Link>
    </section>
  )
}
