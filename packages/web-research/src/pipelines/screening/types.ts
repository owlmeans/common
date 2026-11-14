import type { InjectionSignalKind } from '../../screen/consts.js'
import type { ResearchScreen } from '../../screen/types.js'
import type { ResearchSources } from '../../store/types.js'
import type { RunArea } from '../area/types.js'

export interface SourceScreenerOptions {
  area: RunArea
  sources: ResearchSources
  judge?: ResearchScreen | null
  /** The signals that drop a source when no judge decides. */
  strong: readonly InjectionSignalKind[]
  /** What the research reads its sources for — told to the judge. */
  purpose: string
}

export interface ScreenCounts {
  kept: number
  dropped: number
  /** Kept with weak signals no judge looked at — noted as `source-flagged`. */
  flagged: number
  /** Sources a judge read. */
  judged: number
}

/**
 * The screen step of every pipeline that reads the web: each cloned source not yet screened runs
 * the signal pass; a flagged one goes to the judge when there is one (one call each: an order drops
 * it, none clears it), else a strong signal drops it and weak ones keep it, noted. A dropped source
 * loses its files at once.
 */
export interface SourceScreener {
  screen: (signal?: AbortSignal) => Promise<ScreenCounts>
}
