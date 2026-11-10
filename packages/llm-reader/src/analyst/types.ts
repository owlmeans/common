import type { ImageRole, PageType, ReaderMode } from '../consts.js'
import type { PageFetcher } from '../fetch/fetcher/types.js'
import type { ReaderModels } from '../execution/types.js'
import type { PageImage, PageLink } from '../models/page/types.js'

export interface AnalystOptions {
  models: ReaderModels
  /** Fetches images for vision captions, through the same proxy and guard as the page. */
  fetcher?: PageFetcher
  /** Characters of page text a text-mode call reads. Default 60 000. */
  budget?: number
  /** Turns the DOM agent may take. Default 12. */
  maxTurns?: number
}

/** A node and the text that backs an answer read in DOM mode. */
export interface Evidence {
  ref: string
  quote: string
  selector?: string
}

/**
 * Every model-backed task reads the page in DOM mode by default — an agent exploring the DOM — when
 * the reader has a helper execution for it (`makeReaderModels`); a reader on one bare model reads in
 * text mode. An explicit `mode` always wins (`Dom` without an execution is a `ReaderConfigError`).
 */
export interface ModeOptions {
  mode?: ReaderMode
}

export interface ExtractOptions extends ModeOptions {
  /** JSON schema of the answer. Without one the answer is `{ result: Markdown, urls: [] }`. */
  schema?: object
  /** What to extract, in words. */
  instruction?: string
  /** Proxy key / spectator label of the call. */
  action?: string
}

export interface ExtractResult<T = unknown> {
  data: T
  /** The mode that produced `data`. */
  mode: ReaderMode
  /** DOM mode: the nodes the answer was read from (quotes verified against the page). */
  evidence: Evidence[]
}

export interface PageClassification {
  pageType: PageType
  confidence: number
  reasons: string[]
}

export interface DescribeOptions extends ModeOptions {
  /** How much of the main content the description carries. Default `full`. */
  content?: 'full' | 'summary' | 'none'
}

export interface PageDescription {
  /** The Markdown description — the default output of a reader. */
  markdown: string
  pageTitle: string
  pageType: PageType
  summary: string
  structure: { block: string, purpose: string }[]
  keyLinks: { url: string, label: string, purpose: string }[]
  images: { id: string, role: ImageRole, usage: string }[]
}

/** What the model fills for `describe`; the Markdown is rendered by the package. */
export type DescribeDraft = Omit<PageDescription, 'markdown'> // a mapped type over the description

export interface LinksOptions extends ModeOptions {
  /** What the wanted links are ("article links", "category pages") — the model picks them. */
  intent?: string
  limit?: number
}

export interface SelectedLink extends PageLink {
  /** Why the model picked it for the intent. */
  reason?: string
}

export interface ImagesOptions extends ModeOptions {
  /** Ask the model for each picture's role and usage. Default `true`. */
  classify?: boolean
  /** Caption the most prominent pictures with a vision model. Default `false`. */
  vision?: boolean
  /** Pictures captioned. Default 4. */
  visionLimit?: number
  /** Leave out tracking pixels. Default `true`. */
  skipTracking?: boolean
  /** Proxy key the pictures are fetched under — the page's own, so one page keeps one egress. */
  key?: string
}

/** The model-backed reading of one page. */
export interface PageAnalyst {
  describe: (options?: DescribeOptions) => Promise<PageDescription>
  classify: (options?: ModeOptions) => Promise<PageClassification>
  extract: <T = unknown>(options: ExtractOptions) => Promise<ExtractResult<T>>
  links: (options?: LinksOptions) => Promise<SelectedLink[]>
  images: (options?: ImagesOptions) => Promise<PageImage[]>
}

/** One task for the DOM agent. */
export interface DomTask {
  instruction: string
  schema: object
  action: string
  /** What the agent is told besides the DOM — markup facts, the image list. */
  context: string[]
  /** A check the schema cannot express; a message rejects the submission with it. */
  check?: (result: unknown) => string | undefined
}

/** The DOM agent's answer — the submitted value and its verified evidence, or nothing. */
export interface DomAnswer {
  submitted?: unknown
  evidence: Evidence[]
  /** The agent's last words, for a fallback extraction. */
  notes: string
}
