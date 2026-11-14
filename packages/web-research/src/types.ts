import type { CollectLimits } from '@owlmeans/llm-reader'
import type { ResearchGapCode } from './consts.js'

/**
 * Every ceiling and budget the pipelines apply. The defaults are `RESEARCH_LIMITS`; a wiring
 * overrides any subset.
 */
export interface ResearchLimits {
  /** Searches one implementation research plans, at most (input `maxQueries` is clamped to it). */
  maxQueries: number
  /** Pages one implementation research opens, at most (input `maxResults` is clamped to it). */
  maxResults: number
  /** Further candidates tried when an opened page fails, beyond `maxResults`. */
  collectSpare: number
  /** Pages a project crawl reads, at most. */
  maxProjectPages: number
  /** Link hops a project crawl follows, at most. */
  maxProjectDepth: number
  /** Packages one packages research inspects, at most. */
  maxPackages: number
  /** Documentation pages read per package, at most. */
  maxDocsPages: number
  /** Link hops of a documentation crawl. */
  docsDepth: number
  /** Characters of one source's text read before the token fit (a cap with a marker). */
  sourceChars: number
  /** Tokens of sources fitted into one model call (o200k count; trimmed parts carry a marker). */
  promptTokens: number
  /** The fewest tokens of a source worth keeping in a fit; less drops it. */
  minSourceTokens: number
  /** Characters of the caller's product context read. */
  contextChars: number
  /** Characters of the caller's instruction read. */
  instructionChars: number
  /** Characters of a registry readme kept as a source. */
  readmeChars: number
  /** Characters of package notes a skill writer reads. */
  notesChars: number
  /** The largest SKILL.md accepted. */
  skillChars: number
  /** Characters of a flagged source the judge reads. */
  judgeChars: number
  /** Deadline of one file's download while collecting, ms. */
  collectTimeoutMs: number
  /** What implementation research clones of a page — the page only (`IMPLEMENTATION_COLLECT_LIMITS`). */
  implementationCollect: Partial<CollectLimits>
  /** What design research clones of a page — with its styles, fonts and pictures (`DESIGN_COLLECT_LIMITS`). */
  designCollect: Partial<CollectLimits>
  /** Least time between two crawl requests to one host, ms; the reader's default when unset. */
  crawlDelayMs?: number
  /** Gaps kept on one output, at most. */
  maxGaps: number
}

/** Why an output is thinner than asked — a code, the subject it concerns, one line of detail. */
export interface ResearchGap {
  code: ResearchGapCode
  /** The URL, the package name or the query the gap is about. */
  subject?: string
  detail?: string
}

/** A source a written document cites, by its number in the document's Sources list (1-based order). */
export interface ResearchSourceRef {
  url: string
  title?: string
}

/**
 * What a run is handed besides its state — never serialized. The collaborators themselves are bound
 * into `makeResearchPipelines(wiring)`; what changes per run goes here.
 */
export interface ResearchDeps {
  /** The reader's proxy key (a tenant, a session); each target host when omitted. */
  key?: string
}
