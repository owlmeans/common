import type { CollectLimits, CrawledPage } from '@owlmeans/llm-reader'
import type { SourceRecord } from '../area/types.js'

/** Where a source sits beside its id: the package it documents, what it is for, a title known up front. */
export interface CloneExtra {
  group?: string
  role?: string
  title?: string
}

export interface CloneCollectOptions extends CloneExtra {
  limits: Partial<CollectLimits>
  key?: string
  signal?: AbortSignal
}

/**
 * Turns what the reader fetched into source records with files in the run's area — the raw form the
 * screen reads and the Markdown a model reads. Never throws for a source that failed: the record says so.
 */
export interface SourceCloner {
  /** `reader.collect` a link into the source's folder: a page bundle (its text extracted), or a text file. */
  collect: (id: string, url: string, options: CloneCollectOptions) => Promise<SourceRecord>
  /** A page a crawl already read: its html and its Markdown content. */
  page: (id: string, crawled: CrawledPage, extra?: CloneExtra) => Promise<SourceRecord>
  /** A text the caller holds (a registry readme), as Markdown. */
  text: (id: string, url: string, text: string, extra?: CloneExtra) => Promise<SourceRecord>
}
