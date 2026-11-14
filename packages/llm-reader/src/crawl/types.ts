import type { DescribeOptions, PageDescription } from '../analyst/types.js'
import type { PageModel } from '../models/page/types.js'

export interface CrawlOptions {
  /** What the pages are read for — ranks which links are followed (by the model when the reader has one). */
  intent?: string
  /** Pages read at most, the start page included. Default 10. */
  maxPages?: number
  /** Link hops from the start page. Default 2. */
  depth?: number
  /** Only the start page's origin. Default `true`. */
  sameOrigin?: boolean
  /** Links followed from one page at most. Default 20. */
  linksPerPage?: number
  /** Pages fetched at once. Default 2. */
  concurrency?: number
  /** Least time between two requests to one host, ms (a robots.txt `Crawl-delay` up to 10 s raises it). Default 500. */
  delay?: number
  /** Honour robots.txt. Default `true`. */
  robots?: boolean
  /** Describe each page too (the model's Markdown description); the option object is passed to `describe`. */
  describe?: boolean | DescribeOptions
  /** The proxy key. */
  key?: string
  signal?: AbortSignal
  /** As for `page`: render app shells (unset), always (`true`) or never (`false`). */
  render?: boolean
}

export interface CrawledPage {
  url: string
  /** Hops from the start page. */
  depth: number
  /** The page it was linked from. */
  from?: string
  page: PageModel
  /** With `describe`. */
  description?: PageDescription
}

export interface CrawlSkip {
  url: string
  /** `robots`, `status-404`, `not-a-page`, an error message … */
  reason: string
}

export interface CrawlResult {
  url: string
  /** In the order they were read. */
  pages: CrawledPage[]
  skipped: CrawlSkip[]
}

export interface CrawlerOptions {
  /** The reader has models: links are picked by intent through `links({ intent })`, the keyword ranking otherwise. */
  models: boolean
}

/** A bounded walk over a site, reading pages through the reader. */
export interface Crawler {
  crawl: (url: string, options?: CrawlOptions) => Promise<CrawlResult>
}
