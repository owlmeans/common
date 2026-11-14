import type { ResearchGap, ResearchSourceRef } from '../../types.js'

/** What project research is asked: an existing product, read like any site (a repository page included). */
export interface ProjectInput {
  url: string
  /** The person's own words about what to learn from it. */
  instruction?: string
  /** Pages read, at most (≤ `maxProjectPages`). */
  maxPages?: number
  /** Link hops from `url` (≤ `maxProjectDepth`). */
  depth?: number
  outputs: { doc: string }
}

export interface ProjectOutput {
  /** The summary's path — absent when nothing usable was read. */
  doc?: string
  sources: ResearchSourceRef[]
  /** Pages the crawl read. */
  pages: number
  gaps: ResearchGap[]
}

export interface ProjectState extends Record<string, unknown> {
  input: ProjectInput
  crawlAt?: string
  pages?: number
  skipped?: number
  screenAt?: string
  kept?: number
  dropped?: number
  flagged?: number
  judged?: number
  summarizeAt?: string
  cited?: number
  cleanupAt?: string
  output?: ProjectOutput
}

/** The crawl step's durable record. */
export interface ProjectCrawl {
  pages: number
  skipped: number
  error?: string
}
