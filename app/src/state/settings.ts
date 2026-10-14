import { useCallback, useMemo } from 'react'
import { useSearchParams } from 'react-router'
import type { Meta } from '../data/schema'
import { useResearch } from '../data/researchContext'
import { NO_FILTERS, readFilters, writeFilters, type Filters } from '../lib/filters'
import { EAT_PLANS, type EatPlan } from '../lib/prices'
import type { TransferPref } from '../lib/pricing'
import type { Settings, SortKey } from '../lib/trips'

const SORTS: SortKey[] = ['price', 'rating', 'time']
const TRANSFERS: TransferPref[] = ['cheapest', 'public', 'taxi']

export type SettingsPatch = Partial<Omit<Settings, 'f'>> & { f?: Partial<Filters> }

export function defaults(meta: Meta): Settings {
  return {
    n: meta.party.default, rooms: 'share', sort: 'price', youth: true,
    bags: { cabin: false, checked: false }, transfer: 'cheapest', eat: 'off', home: {}, f: NO_FILTERS,
  }
}

/** "stavanger:1,tonsberg:2": how many travellers fly home to each home other than the origin, never more than the party. */
function readHome(raw: string | null, meta: Meta, n: number): Record<string, number> {
  const known = new Set((meta.homes ?? []).slice(1).map((h) => h.id))
  const out: Record<string, number> = {}
  let left = n
  for (const part of (raw ?? '').split(',')) {
    const [id, count] = part.split(':')
    const c = Math.min(left, Math.max(0, Math.round(Number(count))))
    if (known.has(id) && Number.isFinite(c) && c > 0) {
      out[id] = c
      left -= c
    }
  }
  return out
}

export function writeHome(home: Record<string, number>): string {
  return Object.entries(home)
    .filter(([, c]) => c > 0)
    .map(([id, c]) => `${id}:${c}`)
    .join(',')
}

export function readSettings(params: URLSearchParams, meta: Meta): Settings {
  const d = defaults(meta)
  const n = Number(params.get('n'))
  const sort = params.get('sort') as SortKey
  const bags = (params.get('bags') ?? '').split(',')
  const transfer = params.get('transfer') as TransferPref
  const eat = params.get('eat') as EatPlan
  const party = Number.isFinite(n) && n >= meta.party.min && n <= meta.party.max ? Math.round(n) : d.n
  return {
    n: party,
    rooms: params.get('rooms') === 'own' ? 'own' : 'share',
    sort: SORTS.includes(sort) ? sort : d.sort,
    youth: params.get('youth') !== '0',
    bags: { cabin: bags.includes('cabin'), checked: bags.includes('checked') },
    transfer: TRANSFERS.includes(transfer) ? transfer : d.transfer,
    eat: EAT_PLANS.includes(eat) ? eat : d.eat,
    home: readHome(params.get('home'), meta, party),
    f: readFilters(params),
  }
}

/**
 * Trip settings and filters live in the URL so any view can be shared or bookmarked. Changes replace the current
 * history entry, except when `push` is set (focusing a city), so Back steps out of the city again.
 */
export function useSettings(): [Settings, (patch: SettingsPatch, opts?: { push?: boolean; drop?: string[] }) => void] {
  const { model } = useResearch()
  const meta = model.set.meta
  const [params, setParams] = useSearchParams()
  const settings = useMemo(() => readSettings(params, meta), [params, meta])
  const update = useCallback(
    (patch: SettingsPatch, opts?: { push?: boolean; drop?: string[] }) => {
      setParams(
        (prev) => {
          const next = new URLSearchParams(prev)
          const cur = readSettings(prev, meta)
          const merged: Settings = { ...cur, ...patch, f: { ...cur.f, ...patch.f } }
          const d = defaults(meta)
          const put = (key: string, value: string, isDefault: boolean) => (isDefault ? next.delete(key) : next.set(key, value))
          put('n', String(merged.n), merged.n === d.n)
          put('rooms', merged.rooms, merged.rooms === d.rooms)
          put('sort', merged.sort, merged.sort === d.sort)
          put('youth', '0', merged.youth)
          const bagList = [merged.bags.cabin && 'cabin', merged.bags.checked && 'checked'].filter(Boolean).join(',')
          put('bags', bagList, !bagList)
          put('transfer', merged.transfer, merged.transfer === d.transfer)
          put('eat', merged.eat, merged.eat === d.eat)
          // fewer travellers than people heading elsewhere: the extra ones come off the last home first
          const home = writeHome(readHome(writeHome(merged.home), meta, merged.n))
          put('home', home, !home)
          writeFilters(next, merged.f)
          for (const key of opts?.drop ?? []) next.delete(key)
          return next
        },
        { replace: !opts?.push },
      )
    },
    [setParams, meta],
  )
  return [settings, update]
}

/** The current query string minus view-only keys, for links that should keep the same set and settings. */
export function useCarrySearch(): string {
  const [params] = useSearchParams()
  return useMemo(() => {
    const next = new URLSearchParams(params)
    next.delete('sel')
    next.delete('tab')
    const s = next.toString()
    return s ? `?${s}` : ''
  }, [params])
}
