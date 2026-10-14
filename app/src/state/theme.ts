import { useSyncExternalStore } from 'react'

/** "auto" follows the device; light or dark is a choice from the header switch, kept in this browser. */
export type ThemePref = 'auto' | 'light' | 'dark'
export type Theme = 'light' | 'dark'

/** also read by the inline script in index.html, which sets the theme before the first paint */
const KEY = 'trip-finder-theme'
const media = typeof window !== 'undefined' && window.matchMedia ? window.matchMedia('(prefers-color-scheme: dark)') : null

function readPref(): ThemePref {
  try {
    const v = localStorage.getItem(KEY)
    return v === 'light' || v === 'dark' ? v : 'auto'
  } catch {
    return 'auto'
  }
}

let pref: ThemePref = readPref()
const resolve = (): Theme => (pref === 'auto' ? (media?.matches ? 'dark' : 'light') : pref)
let snapshot = { pref, theme: resolve() }
const listeners = new Set<() => void>()

function publish() {
  snapshot = { pref, theme: resolve() }
  document.documentElement.dataset.theme = snapshot.theme
  listeners.forEach((l) => l())
}

media?.addEventListener('change', () => {
  if (pref === 'auto') publish()
})

export function setThemePref(next: ThemePref) {
  pref = next
  try {
    if (next === 'auto') localStorage.removeItem(KEY)
    else localStorage.setItem(KEY, next)
  } catch {
    // private windows may refuse storage; the choice still holds until the page closes
  }
  publish()
}

/** The theme in use and the switch's setting; components that draw colours themselves (the map) follow it. */
export function useTheme(): { pref: ThemePref; theme: Theme } {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l)
      return () => listeners.delete(l)
    },
    () => snapshot,
  )
}
