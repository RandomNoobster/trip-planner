import { useResearch } from '../data/researchContext'
import type { Discount } from '../data/schema'
import { ExternalLink } from '../components/bits'
import { isUseful, verdictOf } from '../lib/deals'

const GROUPS: { title: string; match: (kind: string) => boolean }[] = [
  { title: 'Flights and travel agencies', match: (k) => k.includes('airline') || k.includes('agency') },
  { title: 'Rail passes and trains', match: (k) => k.includes('rail') },
  { title: 'Buses', match: (k) => k.includes('bus') },
  { title: 'Places to stay', match: (k) => k.includes('accommodation') },
  { title: 'Sights, museums and cards', match: (k) => k.includes('attraction') || k.includes('card') },
]


export function DealsPage() {
  const { model } = useResearch()
  const meta = model.set.meta
  const deals = model.set.discounts ?? []
  const who = meta.travelers?.age ? `${meta.travelers.age}-year-old${meta.travelers.students ? ' students' : 's'}` : 'you'
  const useful = deals.filter(isUseful)
  const none = deals.filter((d) => !isUseful(d))
  const rest = useful.filter((d) => !GROUPS.some((g) => g.match(d.kind.toLowerCase())))
  return (
    <main className="page" id="main">
      <header className="page-head">
        <h1>Student and youth deals</h1>
        <p className="muted">
          What {who} from {meta.originInfo?.name ?? meta.origin} can claim on this trip, checked as part of the research. Always confirm the
          rules at the source before you rely on them.
        </p>
      </header>
      {!deals.length && (
        <div className="card empty">
          <h2>No deals researched in this set</h2>
          <p className="muted">Ask for youth and student discounts when you request the next research set; they are stored next to the prices.</p>
        </div>
      )}
      {GROUPS.map((g) => {
        const list = useful.filter((d) => g.match(d.kind.toLowerCase()))
        if (!list.length) return null
        return (
          <section key={g.title} className="deal-section" aria-label={g.title}>
            <h2>{g.title}</h2>
            <div className="deal-grid">
              {list.map((d, i) => (
                <DealCard key={`${d.provider}-${d.country ?? ''}-${i}`} d={d} />
              ))}
            </div>
          </section>
        )
      })}
      {rest.length > 0 && (
        <section className="deal-section" aria-label="Other deals">
          <h2>Other</h2>
          <div className="deal-grid">
            {rest.map((d, i) => (
              <DealCard key={`${d.provider}-${i}`} d={d} />
            ))}
          </div>
        </section>
      )}
      {none.length > 0 && (
        <section className="deal-section" aria-label="Checked, nothing for you">
          <h2>Checked, nothing for you</h2>
          <p className="muted small">Checked, and either there is no youth or student price, or the research judged it not worth it for this trip.</p>
          <ul className="none-list small">
            {none.map((d, i) => (
              <li key={`${d.provider}-${i}`}>
                <strong>{d.provider}</strong>
                {d.country && d.country !== 'Europe' ? ` (${d.country})` : ''}: {verdictOf(d) || d.notes || 'no youth or student fare'}
              </li>
            ))}
          </ul>
        </section>
      )}
    </main>
  )
}

function DealCard({ d }: { d: Discount }) {
  const how = d.howToBook || d.howToGet
  const verdict = d.worthItForThisTrip || d.relevantForTRD
  return (
    <article className="card deal">
      <div className="deal__head">
        <h3>{d.provider}</h3>
        <span className="muted small">
          {[d.country && d.country !== 'Europe' ? d.country : null, d.ageRange ? `ages ${d.ageRange}` : null, d.studentProofNeeded ? 'student ID needed' : null]
            .filter(Boolean)
            .join(' · ')}
        </span>
      </div>
      {d.benefit && <p>{d.benefit}</p>}
      <dl className="deal__facts small">
        {d.typicalSaving && (
          <>
            <dt>Typical saving</dt>
            <dd>{d.typicalSaving}</dd>
          </>
        )}
        {d.cost && (
          <>
            <dt>Costs</dt>
            <dd>{d.cost}</dd>
          </>
        )}
        {how && (
          <>
            <dt>How</dt>
            <dd>{how}</dd>
          </>
        )}
        {d.conditions && (
          <>
            <dt>Conditions</dt>
            <dd>{d.conditions}</dd>
          </>
        )}
        {verdict && (
          <>
            <dt>For this trip</dt>
            <dd>{verdict}</dd>
          </>
        )}
      </dl>
      <p className="links small">
        {d.sources.slice(0, 3).map((s, i) => (
          <ExternalLink key={s} href={s}>
            Source {i + 1}
          </ExternalLink>
        ))}
        {d.confidence && <span className="muted">confidence {d.confidence}</span>}
      </p>
    </article>
  )
}
