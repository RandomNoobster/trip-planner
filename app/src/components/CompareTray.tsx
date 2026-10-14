import { Link } from 'react-router'
import { COMPARE_MAX, ICON } from '../lib/canon'
import { CompareBadge } from './bits'
import { Icon } from './Icon'

type Item = { id: string; title: string }

/**
 * The comparison's one home while browsing: a slim bar under the list, there only once a route is added. Each route
 * shows its letter (the same as on its card and, when comparing, on the map), opens on a click and leaves with its x.
 * The button opens the side-by-side table once two routes are in.
 */
export function CompareTray({ items, carry, onRemove, onClear }: { items: Item[]; carry: string; onRemove: (id: string) => void; onClear: () => void }) {
  const ready = items.length >= 2
  return (
    <section className="compare-tray" aria-label="Routes to compare">
      <span className="compare-tray__title">
        <Icon name={ICON.compare} size={15} />
        <span className="compare-tray__word">Compare</span>
      </span>
      <ul className="compare-tray__list">
        {items.map((s, i) => (
          <li key={s.id} className="tray-chip">
            <Link to={{ pathname: `/trip/${encodeURIComponent(s.id)}`, search: carry }} title={`Open ${s.title}`}>
              <CompareBadge slot={i} />
              <span className="tray-chip__name">{s.title}</span>
            </Link>
            <button type="button" className="tray-chip__x" onClick={() => onRemove(s.id)} aria-label={`Take ${s.title} out of the comparison`} title="Take it out">
              <Icon name="x" size={11} />
            </button>
          </li>
        ))}
      </ul>
      <span className="compare-tray__end">
        {ready ? (
          <Link className="btn btn--primary btn--small" to={{ pathname: '/compare', search: carry }}>
            Compare {items.length} <Icon name="arrow" size={13} />
          </Link>
        ) : (
          <span className="compare-tray__hint">Add one more</span>
        )}
        <button type="button" className="link-btn small" onClick={onClear} title={`Empty the comparison (it holds up to ${COMPARE_MAX} routes)`}>
          Clear
        </button>
      </span>
    </section>
  )
}
