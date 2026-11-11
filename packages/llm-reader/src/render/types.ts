import type { LocalBundle } from '../fetch/bundle/types.js'
import type { AddressGuard } from '../fetch/guard/types.js'
import type { ProxyLease } from '../fetch/proxy/types.js'

/**
 * A browser that renders pages — the seam `@owlmeans/llm-reader-playwright` fills. A rendered
 * page runs its scripts (an app shell becomes content) and exposes what only a layout engine
 * knows: computed styles, geometry and a screenshot, which the design analyst prefers over
 * parsed CSS.
 */
export interface PageRenderer {
  render: (request: RenderRequest) => Promise<RenderedPage>
  close?: () => Promise<void>
}

export interface RenderRequest {
  url: string
  /** The proxy this page's requests go through, leased by the proxy plugin. */
  lease?: ProxyLease
  /** Applied to the page and every sub-request it makes. */
  guard?: AddressGuard
  signal?: AbortSignal
  timeout?: number
  /** Take a viewport screenshot (JPEG). */
  screenshot?: boolean
  /** Sample computed styles, custom properties and block geometry. */
  styles?: boolean
  /**
   * The local bundle the page belongs to: every request under its origin is answered from the bundle,
   * every other one still goes through `guard`. The reader sets it for a URL a bundle plugin serves.
   */
  bundle?: LocalBundle
}

/** Computed styles aggregated over the visible elements of one role, weighted by on-screen area. */
export interface StyleSample {
  /** body, heading-1…6, link, button, input, card, nav, header, footer, text. */
  role: string
  /** Elements sampled. */
  count: number
  /** Share of the sampled visible area, 0..1. */
  weight: number
  /** The dominant value of each property among these elements. */
  color?: string
  background?: string
  borderColor?: string
  fontFamily?: string
  fontSize?: string
  fontWeight?: string
  lineHeight?: string
  letterSpacing?: string
  radius?: string
  shadow?: string
  padding?: string
  gap?: string
}

/** A large block of the rendered layout, in document order. */
export interface RenderedBlock {
  tag: string
  /** id / class hint. */
  label?: string
  x: number
  y: number
  width: number
  height: number
  background?: string
  text?: string
}

export interface RenderedPage {
  url: string
  finalUrl: string
  status: number
  /** The DOM after scripts ran, serialized. */
  html: string
  /** JPEG bytes of the first viewport. */
  screenshot?: Uint8Array
  styles?: StyleSample[]
  /** `:root` custom properties that resolved, `--name` → value. */
  variables?: Record<string, string>
  blocks?: RenderedBlock[]
  viewport?: { width: number, height: number }
  /** Sub-requests the address guard refused while the page loaded. */
  blocked?: string[]
}
