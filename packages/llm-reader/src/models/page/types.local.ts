/** The element ↔ ref map every page helper shares, so a link, an image and a DOM node agree on refs. */
export interface RefMap {
  refOf: (element: Element) => string | undefined
  elementOf: (ref: string) => Element | undefined
  /** Document order of a ref — refs are assigned in preorder. */
  orderOf: (ref: string) => number
  /** Every element, preorder. */
  elements: () => readonly Element[]
}

/** Where an element sits on its page. Built once per page; every helper asks it. */
export interface PageContext {
  regionOf: (element: Element) => import('../../consts.js').PageRegion
  /** The nearest heading above the element, in document order. */
  sectionOf: (element: Element) => string | undefined
  /** The text of the block the element sits in, its own text excluded where possible. */
  contextOf: (element: Element) => string | undefined
  /** Inside `main`, `article` or `[role=main]` — or, on a page with none, outside the chrome. */
  inMain: (element: Element) => boolean
  headings: () => import('./types.js').PageHeading[]
}

/** Reads a page's metadata from JSON-LD, Open Graph, `<meta>` and markup, tagging each value's evidence. */
export interface MetadataHelper {
  read: (document: Document, url: string) => import('./types.js').PageMeta
  /** JSON-LD image URLs, for the image inventory. */
  images: (document: Document) => string[]
}

/** A parsed JSON-LD node; its shape is open by definition. */
export type JsonLd = Record<string, unknown> // open record — JSON-LD has no fixed shape
