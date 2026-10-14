import { useEffect, useId, useRef } from 'react'
import type { Model } from '../data/model'
import { useResearch } from '../data/researchContext'
import type { Home } from '../data/schema'
import { ICON } from '../lib/canon'
import { shortDate } from '../lib/format'
import { EAT_PLAN_SHORT, EAT_PLANS, type EatPlan } from '../lib/prices'
import { homesInUse, type Settings } from '../lib/trips'
import type { SettingsPatch } from '../state/settings'
import { Field, Segmented } from './bits'
import { Icon } from './Icon'

type SetupProps = { settings: Settings; update: (p: SettingsPatch) => void; hasYouthFares: boolean }

/** Where from and when: fixed by the research set, so it is shown, not edited. One line in the band, two in the sheet. */
function TripWhen({ inline = false }: { inline?: boolean }) {
  const { model } = useResearch()
  const meta = model.set.meta
  const when = `${shortDate(meta.window.start)} – ${shortDate(meta.window.end)}${meta.window.flexDays > 0 ? ` ±${meta.window.flexDays} days` : ''}`
  if (inline) {
    return (
      <span className="muted">
        from{' '}
        <strong className="setup__origin">
          {model.origin.name} ({model.origin.code})
        </strong>
        , around {when}
      </span>
    )
  }
  return (
    <>
      <strong>
        {model.origin.name} ({model.origin.code})
      </strong>
      <span className="muted">Around {when}</span>
    </>
  )
}

const shortName = (h: Home) => h.short ?? h.name

/** "All to Værnes", or "2 Værnes · 1 Sola": where the group flies home. */
export function homeSummary(model: Model, s: Settings): string {
  const inUse = homesInUse(model, s)
  if (inUse.length === 1 && inUse[0].home.id === model.homes[0].id) return `All to ${shortName(model.homes[0])}`
  return inUse.map((h) => `${h.count} ${shortName(h.home)}`).join(' · ')
}

/**
 * How many travellers fly home where. The origin takes everyone not sent elsewhere. Everyone flies home from the last
 * city on the last day, so a route hides while someone is going to a home it has no flight to that day.
 */
function HomePicker({ settings, update }: Pick<SetupProps, 'settings' | 'update'>) {
  const { model } = useResearch()
  const ref = useRef<HTMLDetailsElement>(null)
  // closes like a menu: a click outside or Esc
  useEffect(() => {
    const close = (ev: Event) => {
      const d = ref.current
      if (!d?.open) return
      if (ev instanceof KeyboardEvent ? ev.key === 'Escape' : !d.contains(ev.target as Node)) d.open = false
    }
    document.addEventListener('pointerdown', close)
    document.addEventListener('keydown', close)
    return () => {
      document.removeEventListener('pointerdown', close)
      document.removeEventListener('keydown', close)
    }
  }, [])
  const others = model.homes.slice(1)
  const atOrigin = settings.n - others.reduce((a, h) => a + (settings.home[h.id] ?? 0), 0)
  const set = (id: string, count: number) => update({ home: { ...settings.home, [id]: count } })
  const origin = model.homes[0]
  return (
    <details className="home-picker" ref={ref}>
      <summary className="select home-picker__button" title="Where each traveller flies home at the end of the trip">
        <Icon name={ICON.home} size={14} /> {homeSummary(model, settings)}
      </summary>
      <div className="home-picker__panel" role="group" aria-label="Where each traveller flies home">
        <ul>
          <li>
            <span className="home-picker__place">
              <strong>{origin.name}</strong> <span className="muted small">{origin.airport}</span>
            </span>
            <output className="home-picker__rest" aria-label={`Travelers to ${origin.name}`}>
              {atOrigin}
            </output>
          </li>
          {others.map((h) => {
            const c = settings.home[h.id] ?? 0
            return (
              <li key={h.id}>
                <span className="home-picker__place">
                  <strong>{h.name}</strong> <span className="muted small">{h.airport}</span>
                </span>
                <span className="stepper stepper--small">
                  <button type="button" aria-label={`One fewer to ${h.name}`} disabled={c <= 0} onClick={() => set(h.id, c - 1)}>
                    <Icon name="minus" size={14} />
                  </button>
                  <output aria-live="polite" aria-label={`Travelers to ${h.name}`}>
                    {c}
                  </output>
                  <button type="button" aria-label={`One more to ${h.name}`} disabled={atOrigin <= 0} onClick={() => set(h.id, c + 1)}>
                    <Icon name="plus" size={14} />
                  </button>
                </span>
              </li>
            )
          })}
        </ul>
        <p className="muted small">
          Everyone flies home from the last city on the last day. Prices are the group's average, and a route only shows when everyone has a flight home that day.
        </p>
        {model.set.meta.homesNote && <p className="muted small home-picker__note">{model.set.meta.homesNote}</p>}
      </div>
    </details>
  )
}

/** The inputs that change every price. The band and the sheet show the same fields. */
function SetupFields({ settings, update, hasYouthFares }: SetupProps) {
  const { model } = useResearch()
  const meta = model.set.meta
  const id = useId()
  return (
    <>
      <Field label="Travelers">
        <div className="stepper">
          <button type="button" aria-label="Fewer travelers" disabled={settings.n <= meta.party.min} onClick={() => update({ n: settings.n - 1 })}>
            <Icon name="minus" />
          </button>
          <output aria-live="polite" aria-label="Travelers">
            {settings.n}
          </output>
          <button type="button" aria-label="More travelers" disabled={settings.n >= meta.party.max} onClick={() => update({ n: settings.n + 1 })}>
            <Icon name="plus" />
          </button>
        </div>
      </Field>
      {model.homes.length > 1 && (
        <Field label="Flying home">
          <HomePicker settings={settings} update={update} />
        </Field>
      )}
      <Field label="Rooms" htmlFor={`${id}rooms`}>
        <select id={`${id}rooms`} className="select" title="Share rooms within the group, or book a room for each traveler" value={settings.rooms} onChange={(e) => update({ rooms: e.target.value === 'own' ? 'own' : 'share' })}>
          <option value="share">Share rooms</option>
          <option value="own">Own room each</option>
        </select>
      </Field>
      <Field label="Bags on every leg">
        <fieldset className="bag-toggles">
          <legend className="sr-only">Luggage each traveler brings on every flight, train and bus</legend>
          <button type="button" className="toggle-chip" aria-pressed="true" disabled title="Every fare includes a small personal item under the seat">
            <Icon name="check" size={13} /> Personal item
          </button>
          <button type="button" className="toggle-chip" aria-pressed={settings.bags.cabin} onClick={() => update({ bags: { ...settings.bags, cabin: !settings.bags.cabin } })}>
            {settings.bags.cabin && <Icon name="check" size={13} />} Cabin bag
          </button>
          <button type="button" className="toggle-chip" aria-pressed={settings.bags.checked} onClick={() => update({ bags: { ...settings.bags, checked: !settings.bags.checked } })}>
            {settings.bags.checked && <Icon name="check" size={13} />} Checked bag
          </button>
        </fieldset>
      </Field>
      <Field label="Airport transfers" htmlFor={`${id}transfer`}>
        <select id={`${id}transfer`} className="select" title="Airport or station to the centre: the cheaper of public transport and a shared taxi, or always one of them" value={settings.transfer} onChange={(e) => update({ transfer: e.target.value as Settings['transfer'] })}>
          <option value="cheapest">Cheapest</option>
          <option value="public">Public transport</option>
          <option value="taxi">Taxi or Uber</option>
        </select>
      </Field>
      <Field label="Food & drink" htmlFor={`${id}eat`}>
        <select
          id={`${id}eat`}
          className="select"
          value={settings.eat}
          onChange={(e) => update({ eat: e.target.value as EatPlan })}
          title="Add eating and drinking out to every price: per person per day at each city's typical prices (cheap meals out, 0.5 l beers in a bar)"
        >
          {EAT_PLANS.map((p) => (
            <option key={p} value={p}>
              {EAT_PLAN_SHORT[p]}
            </option>
          ))}
        </select>
      </Field>
      {hasYouthFares && (
        <Field label="Fares">
          <Segmented
            legend="Youth fares"
            value={settings.youth ? 'on' : 'off'}
            onChange={(v) => update({ youth: v === 'on' })}
            options={[
              { value: 'on', label: meta.travelers?.age ? `Youth (${meta.travelers.age})` : 'Youth' },
              { value: 'off', label: 'Adult' },
            ]}
          />
        </Field>
      )}
    </>
  )
}

/** One line for the "Your trip" button on narrower screens: what the prices assume. */
export function setupSummary(s: Settings, model: Model): string {
  const parts = [`${s.n} traveler${s.n === 1 ? '' : 's'}`]
  if (Object.values(s.home).some((c) => c > 0)) parts.push(homeSummary(model, s))
  if (s.rooms === 'own') parts.push('own rooms')
  const bags = [s.bags.cabin && 'cabin', s.bags.checked && 'checked'].filter(Boolean)
  parts.push(bags.length ? `${bags.join(' + ')} bag${bags.length > 1 ? 's' : ''}` : 'no bags')
  if (s.eat !== 'off') parts.push('food')
  return parts.join(' · ')
}

/**
 * Who is going and what they bring: inputs that change every price, in one compact band so the map gets the height.
 * Narrowing the results is the filter bar's job. Below 1200 px a button in the filter bar opens SetupSheet instead.
 */
export function SetupBar(props: SetupProps) {
  return (
    <section className="setup" aria-label="Your trip">
      <p className="setup__head">
        <span className="field__label">Your trip</span> <TripWhen inline />
      </p>
      <div className="setup__fields">
        <SetupFields {...props} />
      </div>
    </section>
  )
}

/** The same inputs as SetupBar in a sheet, for narrower screens. A native modal dialog: Esc and the backdrop close it. */
export function SetupSheet({ open, onClose, shownRoutes, ...props }: SetupProps & { open: boolean; onClose: () => void; shownRoutes: number }) {
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
      aria-labelledby="setup-title"
      onClose={onClose}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose()
      }}
    >
      <div className="drawer__panel">
        <header className="drawer__head">
          <h2 id="setup-title">Your trip</h2>
          <button type="button" className="icon-btn" onClick={onClose} aria-label="Close your trip">
            <Icon name="x" />
          </button>
        </header>
        <div className="drawer__body">
          <p className="setup-sheet__when">
            <TripWhen />
          </p>
          <p className="muted small">All of these go into every price: fares, bag fees, rooms, airport transfers and, if you choose, eating out.</p>
          <div className="setup-sheet">
            <SetupFields {...props} />
          </div>
        </div>
        <footer className="drawer__foot drawer__foot--end">
          <button type="button" className="btn btn--primary" onClick={onClose}>
            Show {shownRoutes} route{shownRoutes === 1 ? '' : 's'}
          </button>
        </footer>
      </div>
    </dialog>
  )
}
