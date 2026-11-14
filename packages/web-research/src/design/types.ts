import type { DesignTokens, PageRenderer, ReaderModels } from '@owlmeans/llm-reader'

/** One large block of the page, top to bottom. */
export interface DesignOutlineBlock {
  order: number
  /** header, hero, logos, features, pricing, testimonial, cards, article, form, footer, section. */
  role: string
  /** What the block holds — its heading in quotes, pictures, items, words. */
  summary: string
}

export interface DesignHeading {
  level: number
  text: string
}

/** The page's own identity — names, logos and icons a design built after it must never reuse. */
export interface DesignMarks {
  names: string[]
  logos: { url: string, alt?: string }[]
  /** The favicon and the sharing picture. */
  icons: string[]
}

/** What reading one page's design produced. */
export interface DesignAnalysis {
  /** The page as collected — the original URL when the bundle's manifest names it, else its bundle URL. */
  url: string
  title?: string
  /** The page was rendered in a browser (computed styles merged). */
  rendered: boolean
  /** `model` — llm-reader's design analyst wrote it; `facts` — rendered from the measured facts alone. */
  by: 'model' | 'facts'
  /** The DESIGN.md llm-reader renders. */
  markdown: string
  tokens: DesignTokens
  outline: { blocks: DesignOutlineBlock[], headings: DesignHeading[] }
  marks: DesignMarks
  /** Font families the page loads. */
  fonts: string[]
  warnings: string[]
}

export interface DesignAnalyzerOptions {
  /** The design analyst's models; without them the analysis is the measured facts alone. */
  models?: ReaderModels
  /** Renders the bundle (computed styles, a screenshot for a seeing model); borrowed, never closed. */
  renderer?: PageRenderer
  /** Linked stylesheets read, at most. */
  maxStylesheets?: number
}

/** A local page bundle — a collected one (with `bundle.json`) or an uploaded html/css folder. */
export interface DesignTarget {
  root: string
  /** The page inside the root; the manifest's entry, else `index.html`. */
  entry?: string
}

/**
 * The analysis stage of `research:design`, standalone: one page of a local bundle read OFFLINE —
 * every request the page makes is answered from the bundle or refused, never sent to the network.
 */
export interface DesignAnalyzer {
  analyze: (target: DesignTarget) => Promise<DesignAnalysis>
}
