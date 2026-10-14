import type { ReactNode } from 'react'
import type { Stay } from '../data/schema'
import { compareColor, compareLetter, ICON, type Tone } from '../lib/canon'
import { eur } from '../lib/format'
import type { EvalTrip } from '../lib/trips'
import { Icon, type IconName } from './Icon'

/**
 * An icon from the canon, a value and a quiet label: "[ticket] €196 fares". A tone (good, caution, bad) colours the
 * icon and the value; `iconColor` paints only the icon, for scales such as temperature.
 */
export function Fact({
  icon,
  children,
  label,
  tone,
  title,
  iconColor,
  filled,
}: {
  icon: IconName
  children: ReactNode
  label?: ReactNode
  tone?: Tone | null
  title?: string
  iconColor?: string
  /** a solid icon, for the rating star */
  filled?: boolean
}) {
  return (
    <span className={`fact${tone ? ` tone-${tone}` : ''}`} title={title}>
      <span className="fact__icon" style={iconColor ? { color: iconColor } : undefined}>
        <Icon name={icon} size={13} filled={filled} />
      </span>
      <strong>{children}</strong>
      {label != null && <span className="fact__label">{label}</span>}
    </span>
  )
}

/**
 * "[home] 2× Værnes €418 · Sola €400": what the trip costs each traveller by where they fly home. Only when the group
 * splits up at the end; otherwise everyone pays the one price shown.
 */
export function HomePrices({ e, className = '' }: { e: EvalTrip; className?: string }) {
  if (!e.split) return null
  return (
    <p className={`home-prices small ${className}`.trim()}>
      <span className="home-prices__icon">
        <Icon name={ICON.home} size={12} label="Each traveller by where they fly home:" />
      </span>
      {e.homes.map((h) => (
        <span key={h.home.id} className="home-prices__item">
          {h.count > 1 && <span className="muted">{h.count}× </span>}
          {h.home.short ?? h.home.name} <strong>{eur(h.totalPP)}</strong>
        </span>
      ))}
    </p>
  )
}

/** A compared route's letter in its colour: the same mark on the card, the tray, the table and the map. */
export function CompareBadge({ slot }: { slot: number }) {
  return (
    <span className="compare-badge" style={{ background: compareColor(slot) }} aria-hidden="true">
      {compareLetter(slot)}
    </span>
  )
}

/** A chip's text, with an icon saying what it is about; the row's tone gives the colour and the default icon. */
type ChipItem = string | { text: string; icon?: IconName }

export function ChipRow({ title, tone, items, empty }: { title: string; tone: 'missing' | 'included' | 'warn'; items: ChipItem[]; empty?: string }) {
  if (!items.length && !empty) return null
  const fallback = tone === 'missing' ? 'x' : tone === 'included' ? 'check' : 'warn'
  return (
    <div className={`chip-row chip-row--${tone}`}>
      <span className="chip-row__title">{title}</span>
      {items.length ? (
        <ul className="chips">
          {items.map((item) => {
            const { text, icon } = typeof item === 'string' ? { text: item, icon: undefined } : item
            return (
              <li key={text} className={`chip chip--${tone}`}>
                <Icon name={icon ?? fallback} size={11} />
                {text}
              </li>
            )
          })}
        </ul>
      ) : (
        <span className="muted small">{empty}</span>
      )}
    </div>
  )
}

/**
 * How central a stay is: straight-line distance to the city centre, with a rough walking time
 * (streets add about 30% to the straight line; 4.8 km/h). Airbnb shows locations to within a few hundred metres.
 */
export function Centrality({ stay, showUnknown = false }: { stay: Stay; showUnknown?: boolean }) {
  const km = stay.centerKm
  if (km == null) return showUnknown ? <span className="centre centre--unknown">Distance to the centre not known</span> : null
  const band = km <= 1.5 ? 'near' : km <= 3.5 ? 'mid' : 'far'
  const walk = Math.round(((km * 1.3) / 4.8) * 60)
  const dist = km < 1 ? `${Math.max(100, Math.round((km * 1000) / 50) * 50)} m` : `${km.toFixed(1)} km`
  const word = band === 'near' ? 'Central' : band === 'mid' ? 'Close to the centre' : 'Outside the centre'
  return (
    <span
      className={`centre centre--${band}`}
      title={`${dist} in a straight line from the city centre${stay.platform === 'airbnb' ? '; Airbnb shows the location to within a few hundred metres' : ''}`}
    >
      <Icon name="walk" size={12} />
      {word} · {dist}
      {walk <= 30 ? ` · ${walk} min walk` : ''}
    </span>
  )
}

export function ExternalLink({ href, children }: { href: string | null | undefined; children: ReactNode }) {
  if (!href) return <span className="muted">{children}</span>
  return (
    <a href={href} target="_blank" rel="noreferrer" className="ext-link">
      {children}
      <Icon name="external" size={12} />
      <span className="sr-only">(opens in a new tab)</span>
    </a>
  )
}

export function Segmented<T extends string>({
  legend,
  value,
  options,
  onChange,
}: {
  legend: string
  value: T
  options: { value: T; label: string; title?: string }[]
  onChange: (v: T) => void
}) {
  return (
    <fieldset className="segmented">
      <legend className="sr-only">{legend}</legend>
      {options.map((o) => (
        <button key={o.value} type="button" aria-pressed={o.value === value} onClick={() => onChange(o.value)} title={o.title}>
          {o.label}
        </button>
      ))}
    </fieldset>
  )
}

export function Field({ label, htmlFor, children }: { label: string; htmlFor?: string; children: ReactNode }) {
  return (
    <div className="field">
      {htmlFor ? (
        <label className="field__label" htmlFor={htmlFor}>
          {label}
        </label>
      ) : (
        <span className="field__label">{label}</span>
      )}
      {children}
    </div>
  )
}
