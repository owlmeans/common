import type { ResearchGap, ResearchLimits, ResearchSourceRef } from '../../types.js'
import type { ResearchSources } from '../../store/types.js'
import type { SourceRecord } from '../area/types.js'

/** A source read back for a model: its record and its text, capped at `sourceChars`. */
export interface LoadedSource {
  record: SourceRecord
  text: string
}

/** Sources fitted into a token budget and numbered 1… in the order they are given. */
export interface FittedSources {
  /** The numbered sources as the model reads them. */
  text: string
  /** What each number cites, in order. */
  refs: ResearchSourceRef[]
  /** Sources cut to fit (a marker says so) and sources left out whole. */
  trimmed: number
  omitted: number
}

/** What a written text cites. */
export interface CitationCheck {
  /** The numbers cited that exist. */
  cited: number[]
  /** Numbers cited that no source carries. */
  invalid: number[]
}

/** Reading sources back for a model, and the bookkeeping around what it writes from them. */
export interface SourcesHelper {
  /** The records a model may read: cloned, not dropped by the screen, with text. */
  usable: (records: readonly SourceRecord[]) => SourceRecord[]
  load: (records: readonly SourceRecord[]) => Promise<LoadedSource[]>
  /** Fit within `promptTokens` (o200k), every source a part of equal priority, renumbered contiguously. */
  fit: (loaded: readonly LoadedSource[]) => FittedSources
  /** The Sources list a document ends with. */
  list: (refs: readonly ResearchSourceRef[]) => string
  check: (text: string, count: number) => CitationCheck
  /** The gaps the records explain: failed, unreadable, screened out, flagged. */
  gaps: (records: readonly SourceRecord[]) => ResearchGap[]
  /** At most `maxGaps`, each once. */
  cap: (gaps: readonly ResearchGap[]) => ResearchGap[]
}

export interface SourcesHelperOptions {
  sources: ResearchSources
  limits: ResearchLimits
}
