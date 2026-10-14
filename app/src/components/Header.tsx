import { Link, NavLink } from 'react-router'
import { useResearch } from '../data/researchContext'
import { daysAgo, shortDate } from '../lib/format'
import { useCarrySearch } from '../state/settings'
import { setThemePref, useTheme, type ThemePref } from '../state/theme'
import { Icon } from './Icon'

export function Header() {
  const { model } = useResearch()
  const carry = useCarrySearch()
  const meta = model.set.meta
  return (
    <header className="topbar">
      <Link to={{ pathname: '/', search: carry }} className="brand">
        <span className="brand__mark" aria-hidden="true">
          <Icon name="pin" size={16} />
        </span>
        <span className="brand__name">Trip Finder</span>
      </Link>
      <nav aria-label="Primary" className="topnav">
        <NavLink to={{ pathname: '/', search: carry }} end>
          Explore
        </NavLink>
        <NavLink to={{ pathname: '/deals', search: carry }}>Student deals</NavLink>
        <NavLink to={{ pathname: '/research', search: carry }}>
          Research<span className="topnav__more">&nbsp;sets</span>
        </NavLink>
      </nav>
      <Link to={{ pathname: '/research', search: carry }} className="set-pill" aria-label={`Active research set: ${meta.title}, captured ${shortDate(meta.capturedAt)}. Manage sets`}>
        <span className="set-pill__dot" aria-hidden="true" />
        {meta.title}
        {model.source === 'file' && <span className="set-pill__muted">from file</span>}
        <span className="set-pill__muted">captured {shortDate(meta.capturedAt)}</span>
      </Link>
      <ThemeSwitch />
    </header>
  )
}

const NEXT: Record<ThemePref, ThemePref> = { auto: 'light', light: 'dark', dark: 'auto' }
const ICONS = { auto: 'contrast', light: 'sun', dark: 'moon' } as const

/** One button that steps through the device's theme, light and dark; the icon shows the current setting. */
function ThemeSwitch() {
  const { pref, theme } = useTheme()
  const now = pref === 'auto' ? `follows your device (${theme} now)` : pref
  const next = NEXT[pref] === 'auto' ? 'follow your device' : NEXT[pref]
  const label = `Theme: ${now}. Switch to ${next}.`
  return (
    <button type="button" className="icon-btn theme-switch" onClick={() => setThemePref(NEXT[pref])} aria-label={label} title={label}>
      <Icon name={ICONS[pref]} size={17} />
    </button>
  )
}

export function FreshnessBanner() {
  const { model } = useResearch()
  const age = daysAgo(model.set.meta.capturedAt)
  if (age <= 14) return null
  return (
    <div className={`banner ${age > 30 ? 'banner--stale' : ''}`} role="status">
      <Icon name="clock" size={16} />
      {age > 30
        ? `Prices were captured ${age} days ago, so treat every total as an estimate and check the booking links. Re-run the research before booking.`
        : `Prices were captured ${age} days ago and may have moved. Check the booking links before paying.`}
    </div>
  )
}
