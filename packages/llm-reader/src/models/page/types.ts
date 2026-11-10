import type { ImageKind, ImageRole, LinkKind, PageRegion } from '../../consts.js'
import type { FetchedResource } from '../../fetch/fetcher/types.js'
import type { RenderedPage } from '../../render/types.js'

/** What a page model is built from: the HTML and the URL it came from. */
export interface PageSource {
  url: string
  html: string
  fetched?: FetchedResource
  rendered?: RenderedPage
}

/** Where a metadata value was read — so a consumer can weigh JSON-LD over a guessed byline. */
export type MetaSource = 'json-ld' | 'open-graph' | 'meta' | 'microdata' | 'markup' | 'content' // closed set of evidence kinds

export interface MetaValue {
  value: string
  source: MetaSource
}

export interface PageMeta {
  title?: MetaValue
  description?: MetaValue
  author?: MetaValue
  /** ISO date or date-time. */
  published?: MetaValue
  modified?: MetaValue
  site?: MetaValue
  language?: string
  canonical?: string
  image?: string
  favicon?: string
  /** `og:type`. */
  ogType?: string
  /** Every JSON-LD `@type` on the page. */
  schemaTypes: string[]
  /** RSS / Atom feeds. */
  feeds: string[]
}

export interface PageContent {
  /** Main content as Markdown. */
  markdown: string
  wordCount: number
  /** `article` when the article extractor's output was used, `structure` for the section-by-section rendering. */
  method: 'article' | 'structure'
}

export interface PageHeading {
  level: number
  text: string
  ref: string
}

export interface PageLink {
  url: string
  text: string
  title?: string
  rel: string[]
  region: PageRegion
  /** The nearest heading above the link. */
  section?: string
  internal: boolean
  kind: LinkKind
  order: number
  ref: string
}

export interface ImageCandidate {
  url: string
  /** `800w`, `2x`, or a media query of a `<source>`. */
  descriptor?: string
}

/** One picture and the context it is used in. */
export interface PageImage {
  id: string
  /** Absolute URL of the best candidate. */
  url: string
  kind: ImageKind
  candidates: ImageCandidate[]
  alt?: string
  title?: string
  width?: number
  height?: number
  loading?: string
  /** Marked as presentational: `alt=""`, `role="presentation"`, `aria-hidden`. */
  decorative: boolean
  /** `<figcaption>` or the inline SVG's `<title>`. */
  caption?: string
  /** The link it is wrapped in. */
  link?: { url: string, text?: string }
  region: PageRegion
  /** The nearest heading above it. */
  section?: string
  /** Text around it — the block it sits in. */
  context?: string
  /** Inside the main content (an article's own figure) rather than the chrome around it. */
  inMain: boolean
  /** Where else the same picture is named (og:image, JSON-LD) — merged into one entry. */
  origins: string[]
  order: number
  ref?: string
  /** A deterministic guess from the markup; the model's `role` refines it. */
  hint?: ImageRole
  /** Filled by `images({ classify: true })`. */
  role?: ImageRole
  usage?: string
  /** Filled by `images({ vision: true })`. */
  description?: string
}

/** Markup facts that tell page types apart before a model looks. */
export interface PageSignals {
  words: number
  /** Words inside the main content. */
  mainWords: number
  headings: number
  links: number
  internalLinks: number
  images: number
  forms: number
  passwordField: boolean
  searchField: boolean
  /** Currency amounts in the text. */
  prices: number
  /** Sibling groups of ≥3 same-shaped items with a link each — a listing's cards. */
  repeatedItems: number
  /** Little text, an empty mount point, a script bundle — an app shell. */
  appShell: boolean
  hasArticle: boolean
  hasTime: boolean
  hasByline: boolean
  callsToAction: number
}

/** One node of the DOM, addressed by a stable ref (`n12`). */
export interface DomNodeView {
  ref: string
  tag: string
  attributes: Record<string, string>
  text: string
  children: number
}

/** The DOM, addressable by refs — what the DOM-mode agent explores. */
export interface DomIndex {
  /** The skeleton from `ref` (the body by default), `depth` levels deep, within `budget` characters. */
  outline: (ref?: string, depth?: number, budget?: number) => string
  /** Elements matching a CSS selector, at most `limit`. */
  query: (selector: string, limit?: number) => DomNodeView[]
  /** Elements whose own text contains `text` (case-insensitive), innermost first. */
  find: (text: string, limit?: number) => DomNodeView[]
  /** One node, or `undefined`. */
  node: (ref: string) => DomNodeView | undefined
  /** The full text of a node, collapsed. */
  text: (ref: string, max?: number) => string | undefined
  /** A CSS path that selects the node. */
  selector: (ref: string) => string | undefined
}

/** A parsed page. Every member is computed on first use and kept. */
export interface PageModel {
  readonly url: string
  readonly html: string
  readonly fetched?: FetchedResource
  readonly rendered?: RenderedPage
  /** The parsed document — the original, never handed to a mutating extractor. */
  document: () => Document
  meta: () => PageMeta
  content: () => Promise<PageContent>
  outline: () => PageHeading[]
  links: () => PageLink[]
  images: () => PageImage[]
  signals: () => PageSignals
  /** Absolute URLs of linked stylesheets. */
  stylesheets: () => string[]
  /** `<style>` blocks, in document order. */
  styles: () => string[]
  dom: () => DomIndex
}
