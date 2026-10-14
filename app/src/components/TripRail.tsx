import { useEffect, useRef, type RefObject } from 'react'
import { Icon, type IconName } from './Icon'

/** One part of a route page, in travel order: the overview, each leg, each stop, the checklist and booking. */
export type RailPart = {
  id: string
  kind: 'overview' | 'leg' | 'stop' | 'checklist' | 'book'
  label: string
  /** the full name, for the tooltip and screen readers: "Leg 2: Warsaw to Kraków" */
  title: string
  icon?: IconName
  /** the stop's number, as on the map */
  stop?: number
}

const reduceMotion = () => typeof window !== 'undefined' && !!window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches

/**
 * Where you are on a long route page: its parts in travel order, stuck to the top of the pane. The part you are
 * reading lights up, the ones above it are marked as passed, and a click scrolls there. Stops carry the same numbers
 * as on the map.
 */
export function TripRail({ parts, active, onActive, paneRef }: { parts: RailPart[]; active: string; onActive: (id: string) => void; paneRef: RefObject<HTMLDivElement | null> }) {
  const railRef = useRef<HTMLElement>(null)
  const ids = parts.map((p) => p.id).join(' ')

  // The part being read is the last one whose top has passed just under the rail; the bottom of the page is the last part.
  useEffect(() => {
    const pane = paneRef.current
    if (!pane) return
    let frame = 0
    const measure = () => {
      frame = 0
      const line = pane.getBoundingClientRect().top + (railRef.current?.offsetHeight ?? 0) + 24
      const list = ids.split(' ')
      let current = list[0]
      for (const id of list) {
        const el = document.getElementById(id)
        if (el && el.getBoundingClientRect().top <= line) current = id
      }
      if (pane.scrollTop > 0 && pane.scrollTop + pane.clientHeight >= pane.scrollHeight - 2) current = list[list.length - 1]
      onActive(current)
    }
    const onScroll = () => {
      if (!frame) frame = requestAnimationFrame(measure)
    }
    measure()
    pane.addEventListener('scroll', onScroll, { passive: true })
    window.addEventListener('resize', onScroll)
    return () => {
      pane.removeEventListener('scroll', onScroll)
      window.removeEventListener('resize', onScroll)
      cancelAnimationFrame(frame)
    }
  }, [paneRef, ids, onActive])

  // keep the lit part in view when the rail is wider than the pane (phones)
  useEffect(() => {
    const rail = railRef.current
    const item = rail?.querySelector<HTMLElement>(`[data-part="${active}"]`)
    if (!rail || !item) return
    rail.scrollTo({ left: item.offsetLeft - rail.clientWidth / 2 + item.offsetWidth / 2, behavior: reduceMotion() ? 'auto' : 'smooth' })
  }, [active])

  const go = (id: string) => {
    const pane = paneRef.current
    const el = document.getElementById(id)
    if (!pane || !el) return
    const top = id === parts[0]?.id ? 0 : pane.scrollTop + el.getBoundingClientRect().top - pane.getBoundingClientRect().top - (railRef.current?.offsetHeight ?? 0) - 8
    pane.scrollTo({ top, behavior: reduceMotion() ? 'auto' : 'smooth' })
    onActive(id)
  }

  const at = parts.findIndex((p) => p.id === active)
  return (
    <nav ref={railRef} className="trip-rail" aria-label="Parts of this route">
      <ol>
        {parts.map((p, i) => (
          <li key={p.id} data-part={p.id} className={`trip-rail__item trip-rail__item--${p.kind}${i === at ? ' is-active' : i < at ? ' is-past' : ''}`}>
            <button type="button" onClick={() => go(p.id)} aria-current={i === at ? 'location' : undefined} title={p.title} aria-label={p.title}>
              {p.stop != null ? (
                <span className="stop-marker stop-marker--inline" aria-hidden="true">
                  {p.stop}
                </span>
              ) : (
                p.icon && <Icon name={p.icon} size={13} />
              )}
              <span>{p.label}</span>
            </button>
          </li>
        ))}
      </ol>
    </nav>
  )
}
