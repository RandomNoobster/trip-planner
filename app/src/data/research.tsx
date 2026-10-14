import { use, useCallback, useMemo, useSyncExternalStore, type ReactNode } from 'react'
import { useSearchParams } from 'react-router'
import { getLocalModels, loadIndex, loadSet, subscribeLocalModels, type Model } from './model'
import { ResearchContext } from './researchContext'

/** Resolves the active research set (suspends while it loads) and shares it with the pages. */
export function ResearchProvider({ children }: { children: ReactNode }) {
  const index = use(loadIndex())
  const locals = useSyncExternalStore(subscribeLocalModels, getLocalModels)
  const [params, setParams] = useSearchParams()
  const requested = params.get('set')
  const local = locals.find((m) => m.id === requested)
  let model: Model
  if (local) {
    model = local
  } else {
    const entry = index.find((e) => e.id === requested) ?? index[0]
    if (!entry) throw new Error('No research sets are published yet. Compose one in research/ and run "npm run sync".')
    model = use(loadSet(entry))
  }

  const setActive = useCallback(
    (id: string) => {
      setParams((prev) => {
        const next = new URLSearchParams(prev)
        next.set('set', id)
        next.delete('sel')
        return next
      })
    },
    [setParams],
  )

  const value = useMemo(() => ({ index, locals, model, setActive }), [index, locals, model, setActive])
  return <ResearchContext value={value}>{children}</ResearchContext>
}
