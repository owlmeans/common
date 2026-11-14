import type { InitializedService } from '@owlmeans/context'
import type { LlmModel } from '@owlmeans/llm'
import type {
  DescribeOptions, ExtractOptions, ExtractResult, ImagesOptions, LinksOptions, ModeOptions, PageClassification, PageDescription,
  SelectedLink,
} from '../analyst/types.js'
import type { CollectLimits, CollectOptions, CollectResult, ReaderSource } from '../collect/types.js'
import type { CrawlOptions, CrawlResult } from '../crawl/types.js'
import type { DesignReport } from '../design/types.js'
import type { ReaderModels } from '../execution/types.js'
import type { FetchedResource, PageFetcher, PageFetcherOptions } from '../fetch/fetcher/types.js'
import type { PageImage, PageModel } from '../models/page/types.js'
import type { PageRenderer } from '../render/types.js'
import type { S3SourceOptions } from '../sources/s3/types.js'

export interface LlmReaderOptions extends PageFetcherOptions {
  /**
   * Where model calls run: `makeReaderModels(…)` over an execution (text and DOM mode), or one
   * ready model (text mode only). Without models the reader still fetches and parses.
   */
  models?: ReaderModels | LlmModel
  /** A browser for script-rendered pages and computed styles — `@owlmeans/llm-reader-playwright`. */
  renderer?: PageRenderer
  /** A ready fetcher, instead of one built from these options. */
  fetcher?: PageFetcher
  /** Characters of page text a text-mode call reads. */
  budget?: number
  /** Turns the DOM agent may take. */
  maxTurns?: number
  /** Linked stylesheets a design analysis reads. */
  maxStylesheets?: number
  /**
   * Link-expanding sources `collect` consults, in order, before the built-in S3 source — a Drive
   * folder plugin, say.
   */
  sources?: ReaderSource[]
  /** The built-in S3 source's options, or `false` to leave it out. */
  s3?: S3SourceOptions | false
  /** Collect limits under every collect's own. */
  limits?: Partial<CollectLimits>
}

/** How a target URL is read. */
export interface ReadOptions {
  /** The proxy key — a tenant, a session; the target host when omitted. */
  key?: string
  /**
   * Render in the browser: `true` always, `false` never; unset, only a page that turned out to be
   * an app shell (and, for `design`, every page) when a renderer is configured.
   */
  render?: boolean
  signal?: AbortSignal
}

/** A URL to fetch, a fetched resource, or a page already parsed. */
export type ReaderTarget = string | FetchedResource | PageModel // the three things a reader can start from

/** Fetch a page, read it, and have a model analyse it. */
export interface LlmReader {
  readonly fetcher: PageFetcher
  fetch: (url: string, options?: ReadOptions) => Promise<FetchedResource>
  /** The parsed page — fetched (or rendered) when given a URL. */
  page: (target: ReaderTarget, options?: ReadOptions) => Promise<PageModel>
  /** The default reading: a Markdown description of the page and its content. */
  describe: (target: ReaderTarget, options?: ReadOptions & DescribeOptions) => Promise<PageDescription>
  classify: (target: ReaderTarget, options?: ReadOptions & ModeOptions) => Promise<PageClassification>
  extract: <T = unknown>(target: ReaderTarget, options: ReadOptions & ExtractOptions) => Promise<ExtractResult<T>>
  /** The page's links; with an `intent`, only those the model picks for it. */
  links: (target: ReaderTarget, options?: ReadOptions & LinksOptions) => Promise<SelectedLink[]>
  /** The page's pictures with their context; classified (and captioned) on request. */
  images: (target: ReaderTarget, options?: ReadOptions & ImagesOptions) => Promise<PageImage[]>
  /** The page's design system as a DESIGN.md. */
  design: (target: ReaderTarget, options?: ReadOptions) => Promise<DesignReport>
  /**
   * Clone what a link points at into files written to `options.sink`, as if the person had uploaded
   * them: a page as a bundle (its stylesheets, fonts and pictures, references rewritten, scripts
   * removed, `bundle.json`), a file streamed as is, or what a source expands the link to (an S3
   * prefix, a Drive folder) — under the collect's limits, every item reported.
   */
  collect: (url: string, options: CollectOptions) => Promise<CollectResult>
  /** A bounded, robots-honouring walk over a site from `url`, its pages read (and described on request). */
  crawl: (url: string, options?: CrawlOptions) => Promise<CrawlResult>
  /** The same fetcher and renderer with other models — one reader per execution. */
  using: (models: ReaderModels | LlmModel) => LlmReader
  /** Close the fetcher (and its proxy bridge) and the renderer. */
  close: () => Promise<void>
}

export interface LlmReaderService extends InitializedService, LlmReader {}

export interface WithLlmReaderService {
  reader: () => LlmReaderService
}
