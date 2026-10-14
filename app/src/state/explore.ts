import type { RefObject } from 'react'
import { useOutletContext } from 'react-router'
import type { Destination } from '../data/schema'
import type { ActiveFilter, Filters } from '../lib/filters'
import type { EvalTrip, Settings, TripGroup } from '../lib/trips'
import type { SettingsPatch } from './settings'

export type FocusStats = { routes: number; single: number; multi: number; minPP: number | null; hidden: number }

/** What the explore layout shares with the side pane: the routes list or one route's details. */
export type ExploreCtx = {
  settings: Settings
  update: (patch: SettingsPatch, opts?: { push?: boolean; drop?: string[] }) => void
  setF: (patch: Partial<Filters>) => void
  clearAll: () => void
  evals: EvalTrip[]
  visible: EvalTrip[]
  groups: TripGroup[]
  active: ActiveFilter[]
  unpricedTrips: number
  focus: Destination | null
  focusStats: FocusStats | null
  tab: 'routes' | 'about'
  carry: string
  limit: number
  setLimit: (fn: (n: number) => number) => void
  setHoverKey: (key: string | null) => void
  focusCity: (code: string | null) => void
  /** zoom the map into one stop of the open route (stay, centre, airports), or back out with null */
  showStopOnMap: (stopIndex: number | null) => void
  mapStop: number | null
  paneRef: RefObject<HTMLDivElement | null>
  listScroll: RefObject<number>
  /** trip ids in the side-by-side comparison, in the order they were added: that order gives each its letter and colour (kept in the URL, so it can be shared) */
  saved: string[]
  /** the saved trips priced with the current settings; null where one no longer fits the leg and stay filters */
  savedTrips: { id: string; e: EvalTrip | null; title: string }[]
  toggleSaved: (tripId: string) => void
  clearSaved: () => void
  /** the comparison holds its most routes; adding needs one taken out first */
  compareFull: boolean
  /** the leg or stop being read on a route page, lit up on the map (null: none) */
  setTripPart: (part: TripPart | null) => void
}

export type TripPart = { kind: 'leg' | 'stop'; index: number }

export function useExplore(): ExploreCtx {
  return useOutletContext<ExploreCtx>()
}
