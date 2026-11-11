import type { Browser, LaunchOptions } from 'playwright'
import type { FetchRequest, LocalBundle, PageRenderer, RenderedBlock, StyleSample } from '@owlmeans/llm-reader'

export interface PlaywrightRendererOptions {
  /** Your own browser, or how to get one; otherwise Chromium is launched headless on first use. */
  browser?: Browser | (() => Promise<Browser>)
  launch?: LaunchOptions
  viewport?: { width: number, height: number }
  /** Navigation deadline, ms. */
  timeout?: number
  /** `load` by default; the page then gets up to `settle` ms to go network-idle. */
  waitUntil?: 'load' | 'domcontentloaded' | 'networkidle' | 'commit'
  settle?: number
  userAgent?: string
  /**
   * Local bundles (`createLocalBundlePlugin`) whose synthetic origins every page may load from: a
   * request under one is answered from its root (`page.route`), never resolved or sent. A render
   * request's own `bundle` — set by the reader for a bundle URL — is routed the same way.
   */
  bundles?: LocalBundle[]
}

/** A {@link PageRenderer} on Playwright; `close` shuts down a browser it launched itself. */
export interface PlaywrightRenderer extends PageRenderer {
  close: () => Promise<void>
}

/** What the in-page probe returns. */
export interface ProbeResult {
  styles: StyleSample[]
  variables: Record<string, string>
  blocks: RenderedBlock[]
  viewport: { width: number, height: number }
}

export interface PlaywrightFetchPluginOptions {
  /** Render this request? Default: every page request (`purpose: 'page'`). */
  when?: (request: FetchRequest) => boolean
}
