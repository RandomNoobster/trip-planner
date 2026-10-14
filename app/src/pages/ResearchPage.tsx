import { useState, type ChangeEvent } from 'react'
import { useResearch } from '../data/researchContext'
import { addLocalModel, readSetFile } from '../data/model'
import { daysAgo, dateRange, shortDate } from '../lib/format'
import { PLATFORM, SOURCE } from '../lib/labels'
import { money } from '../lib/prices'
import { ExternalLink } from '../components/bits'
import { Icon } from '../components/Icon'

export function ResearchPage() {
  const { index, locals, model, setActive } = useResearch()
  const [error, setError] = useState<string | null>(null)
  const meta = model.set.meta
  const counts = meta.counts ?? {}
  const kinds = (counts.tripsByKind ?? {}) as Record<string, number>
  const age = daysAgo(meta.capturedAt)

  const onFile = async (ev: ChangeEvent<HTMLInputElement>) => {
    const file = ev.target.files?.[0]
    ev.target.value = ''
    if (!file) return
    setError(null)
    try {
      const m = await readSetFile(file)
      addLocalModel(m)
      setActive(m.id)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    }
  }

  return (
    <main className="page" id="main">
      <header className="page-head">
        <h1>Research sets</h1>
        <p className="muted">
          One JSON file per trip season. The map, ranking and trip pages render whichever set is active, so next year's holiday is a new file,
          not a new app.
        </p>
      </header>

      <section className="card set-card" aria-label="Active set">
        <div className="set-card__head">
          <div>
            <h2>
              {meta.title} <span className="badge badge--high">Active</span>
              {model.source === 'file' && <span className="badge badge--medium">From a local file</span>}
            </h2>
            <code className="muted small">
              {model.fileName} · schema v1 · generated {meta.generatedAt ? shortDate(meta.generatedAt) : 'unknown'}
            </code>
          </div>
        </div>
        <dl className="facts">
          <div>
            <dt>Travel window</dt>
            <dd>
              {dateRange(meta.window.start, meta.window.end)}
              {meta.window.flexDays ? ` ±${meta.window.flexDays} days` : ''}
            </dd>
          </div>
          <div>
            <dt>Origin</dt>
            <dd>
              {model.origin.name} ({model.origin.code})
            </dd>
          </div>
          <div>
            <dt>Prices captured</dt>
            <dd>
              {shortDate(meta.capturedAt)} <span className="muted">· {age} days ago</span>
            </dd>
          </div>
          <div>
            <dt>Party</dt>
            <dd>
              {meta.party.min}–{meta.party.max} travelers
              {meta.travelers?.age ? `, age ${meta.travelers.age}` : ''}
              {meta.travelers?.students ? ', students' : ''}
            </dd>
          </div>
        </dl>
        <p className="small">
          <strong>{model.set.destinations.length}</strong> destinations · <strong>{model.trips.length.toLocaleString('en-GB')}</strong> trips (
          {kinds.single ?? 0} one-city, {kinds.two ?? 0} two-city, {kinds.three ?? 0} three-city) · <strong>{model.set.legs.length.toLocaleString('en-GB')}</strong>{' '}
          transport legs · <strong>{model.set.stays.length.toLocaleString('en-GB')}</strong> stays · <strong>{(model.set.discounts ?? []).length}</strong>{' '}
          discounts checked
        </p>
        <p className="small muted">Sources: {meta.sources.map((s) => SOURCE[s] ?? PLATFORM[s] ?? s).join(', ')}</p>
        <div className={`validation ${model.issues.length ? 'validation--warn' : ''}`}>
          <Icon name={model.issues.length ? 'warn' : 'check'} size={16} />
          {model.issues.length
            ? `Validation passed with ${model.issues.length} skipped trip(s): ${model.issues.slice(0, 2).join('; ')}`
            : 'Validation passed: every trip resolves to real legs, stays and destinations.'}
        </div>
      </section>

      {model.places && <PlacesCard />}

      <section className="card" aria-label="All sets">
        <h2>All sets</h2>
        <div className="table-scroll">
          <table className="sets-table">
            <thead>
              <tr>
                <th scope="col">Set</th>
                <th scope="col">Window</th>
                <th scope="col">Captured</th>
                <th scope="col">Trips</th>
                <th scope="col">
                  <span className="sr-only">Action</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {index.map((e) => (
                <tr key={e.id}>
                  <td>
                    <strong>{e.title}</strong> <span className="muted small">{e.file}</span>
                  </td>
                  <td>{dateRange(e.window.start, e.window.end)}</td>
                  <td>{shortDate(e.capturedAt)}</td>
                  <td>{String((e.counts as Record<string, unknown> | undefined)?.trips ?? '–')}</td>
                  <td>
                    {e.id === model.id ? (
                      <span className="badge badge--high">Active</span>
                    ) : (
                      <button type="button" className="btn btn--ghost btn--small" onClick={() => setActive(e.id)}>
                        Use this set
                      </button>
                    )}
                  </td>
                </tr>
              ))}
              {locals.map((m) => (
                <tr key={m.id}>
                  <td>
                    <strong>{m.set.meta.title}</strong> <span className="muted small">{m.fileName} (local file)</span>
                  </td>
                  <td>{dateRange(m.set.meta.window.start, m.set.meta.window.end)}</td>
                  <td>{shortDate(m.set.meta.capturedAt)}</td>
                  <td>{m.trips.length}</td>
                  <td>
                    {m.id === model.id ? (
                      <span className="badge badge--high">Active</span>
                    ) : (
                      <button type="button" className="btn btn--ghost btn--small" onClick={() => setActive(m.id)}>
                        Use this set
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="file-load">
          <label htmlFor="setfile" className="btn btn--ghost">
            <Icon name="upload" size={14} /> Open a research set from a file
          </label>
          <input id="setfile" type="file" accept=".json,application/json" onChange={onFile} className="sr-only" />
          <span className="muted small">Schema v1 JSON. It stays in this browser tab only.</span>
        </div>
        {error && (
          <p className="tag tag--warn" role="alert">
            {error}
          </p>
        )}
      </section>

      <section className="card" aria-label="Next year">
        <h2>Next year, in three steps</h2>
        <ol className="steps">
          <li>
            <strong>Ask for new research.</strong> Give Claude the dates, how flexible they are, the party size and anything that changed. It
            reruns the scripts in research/scripts and the browser scouts for the airlines that block scripts.
          </li>
          <li>
            <strong>Compose the set.</strong> research/compose.py validates every record and writes research/&lt;set&gt;.json with trips, legs,
            stays, destinations and discounts.
          </li>
          <li>
            <strong>Open it here.</strong> npm run dev syncs every composed set into the app; pick it in the table above.
          </li>
        </ol>
      </section>
    </main>
  )
}

/** Weather through the year and everyday prices: kept outside the sets because they barely change between seasons. */
function PlacesCard() {
  const { model } = useResearch()
  const places = model.places
  if (!places) return null
  const cities = Object.values(places.cities)
  const withClimate = cities.filter((c) => c.climate).length
  const withPrices = cities.filter((c) => c.prices).length
  const withTips = cities.filter((c) => c.tips).length
  const pr = places.prices
  const cl = places.climate
  return (
    <section className="card" aria-label="City facts shared by every set">
      <h2>City facts shared by every set</h2>
      <p className="muted small">
        Weather follows the same yearly cycle and everyday prices move slowly, so they live in research/places/places.json instead of a set.
        Every set, including next year's, reuses them; generated {shortDate(places.generated)}.
      </p>
      <dl className="facts">
        <div>
          <dt>Typical weather</dt>
          <dd>
            {withClimate} cities, every half month of the year
            <span className="muted small">
              {' '}
              · {cl?.sourceUrl ? <ExternalLink href={cl.sourceUrl}>{cl.source ?? 'Open-Meteo'}</ExternalLink> : (cl?.source ?? 'Open-Meteo')}, daily records{' '}
              {cl?.years ?? ''}
            </span>
          </dd>
        </div>
        <div>
          <dt>Everyday prices</dt>
          <dd>
            {withPrices} cities: beer, meals, coffee, local transport
            <span className="muted small">
              {' '}
              · Numbeo and LivingCost.org{pr?.fetched ? `, read ${shortDate(pr.fetched)}` : ''}
            </span>
          </dd>
        </div>
        <div>
          <dt>Indices</dt>
          <dd>
            100 = the median destination
            {pr?.beerMedianEUR != null && pr.foodDayMedianEUR != null && (
              <span className="muted small">
                {' '}
                · beer {money(pr.beerMedianEUR)}, a day of eating out {money(pr.foodDayMedianEUR)}
              </span>
            )}
          </dd>
        </div>
        <div>
          <dt>Local tips</dt>
          <dd>
            {withTips} cities <span className="muted small">· local beer, a cheap dish, a money-saving tip</span>
          </dd>
        </div>
      </dl>
    </section>
  )
}
