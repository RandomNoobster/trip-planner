import { ICON, MODE_ICON } from '../lib/canon'
import { CompareBadge } from './bits'
import { Icon, type IconName } from './Icon'

const ICONS: [IconName, string][] = [
  [ICON.fares, 'fares'],
  [ICON.bags, 'bag fees'],
  [ICON.transfers, 'airport transfers'],
  [ICON.stays, 'stays'],
  [ICON.entry, 'entry permit'],
  [MODE_ICON.flight, 'flight'],
  [MODE_ICON.train, 'train'],
  [MODE_ICON.bus, 'bus'],
  [ICON.time, 'time travelling'],
  [ICON.dates, 'dates'],
  [ICON.nights, 'nights'],
  [ICON.rating, 'adjusted rating'],
  [ICON.centre, 'distance to the centre'],
  [ICON.weather, 'December weather'],
  [ICON.beer, 'beer in a bar'],
  [ICON.food, 'a cheap meal'],
  [ICON.events, 'on while you are there'],
]

/** The canon spelled out once, under the list: what each colour means and what each icon stands for. */
export function CanonKey() {
  return (
    <section className="canon-key small" aria-label="How to read the cards">
      <h3>How to read the cards</h3>
      <p className="facts">
        <span className="canon-key__tone canon-key__tone--good">good or cheaper</span>
        <span className="canon-key__tone canon-key__tone--caution">worth a check</span>
        <span className="canon-key__tone canon-key__tone--bad">missing or poor</span>
        <span className="fact">
          <CompareBadge slot={0} />
          <span className="fact__label">a route in the comparison, same letter on the map</span>
        </span>
      </p>
      <p className="facts">
        {ICONS.map(([icon, text]) => (
          <span key={text} className="fact">
            <span className="fact__icon">
              <Icon name={icon} size={13} filled={icon === ICON.rating} />
            </span>
            <span className="fact__label">{text}</span>
          </span>
        ))}
      </p>
    </section>
  )
}
