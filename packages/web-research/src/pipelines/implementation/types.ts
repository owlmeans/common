import type { ResearchGap, ResearchSourceRef } from '../../types.js'

/** What implementation research is asked. */
export interface ImplementationInput {
  /** What to research — "lead scoring best practices for B2B CRM". */
  topic: string
  /** The questions the report must answer. */
  questions?: string[]
  /** The person's own words about what they want from it. */
  instruction?: string
  /** The product the recommendations are for — a brief excerpt (capped at `contextChars`). */
  context?: string
  /** Searches planned, at most (≤ `maxQueries`, default the ceiling). */
  maxQueries?: number
  /** Pages opened, at most (≤ `maxResults`, default the ceiling). */
  maxResults?: number
  /** Domains never opened (no scheme). */
  blockedDomains?: string[]
  /** Where the report is written (outputs). */
  outputs: { doc: string }
}

export interface ImplementationOutput {
  /** The report's path — absent when no report was written (no search, nothing usable). */
  doc?: string
  /** What the report cites, in its Sources order. */
  sources: ResearchSourceRef[]
  gaps: ResearchGap[]
}

/** Markers (`<step>At`, the first guard of each step) and counters — never a page, never a URL list. */
export interface ImplementationState extends Record<string, unknown> {
  input: ImplementationInput
  planAt?: string
  queries?: number
  searchAt?: string
  searches?: number
  candidates?: number
  collectAt?: string
  collected?: number
  screenAt?: string
  kept?: number
  dropped?: number
  flagged?: number
  judged?: number
  synthesizeAt?: string
  cited?: number
  cleanupAt?: string
  /** Bounded by `maxResults` sources and `maxGaps` gaps; set before the sources are removed. */
  output?: ImplementationOutput
}

/** The plan step's durable record. */
export interface ImplementationPlan {
  queries: string[]
  /** Set when no search port is wired. */
  unavailable?: boolean
}

/** One search's durable record (a unit: a resumed step never repeats a search that answered). */
export interface ImplementationSearch {
  query: string
  /** The pages the answer cited, then the others it consulted. */
  urls: ResearchSourceRef[]
  searches: number
  error?: string
  /**
   * The search port answered that it cannot search at all (`LlmSearchUnsupportedError` — a delegated
   * performer without a web search): recorded as the run's `search-unavailable`, never as a failure.
   */
  unavailable?: boolean
}

/** The search step's durable record: the pages to open, in order. */
export interface ImplementationCandidates {
  candidates: ResearchSourceRef[]
  /** Queries whose search failed (an unavailable search is not a failure). */
  failed: string[]
  /** A search answered that searching is unavailable; the rest were not asked. */
  unavailable?: boolean
}

/** The answer of the plan call. */
export interface PlanAnswer {
  queries: string[]
}
