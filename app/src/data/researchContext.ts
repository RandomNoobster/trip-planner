import { createContext, use } from 'react'
import type { Model } from './model'
import type { SetIndexEntry } from './schema'

export type ResearchContextValue = {
  index: SetIndexEntry[]
  locals: Model[]
  model: Model
  setActive: (id: string) => void
}

export const ResearchContext = createContext<ResearchContextValue | null>(null)

export function useResearch(): ResearchContextValue {
  const v = use(ResearchContext)
  if (!v) throw new Error('useResearch must be used inside ResearchProvider')
  return v
}
