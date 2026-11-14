import type { Browser, LaunchOptions } from 'playwright'
import type { FetchFunction, FetchRequest, LocalBundle, PageRenderer, RenderedBlock, StyleSample } from '@owlmeans/llm-reader'

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
  /**
   * The reader's pinned fetch (`@owlmeans/file-streams/fetch`): every live GET/HEAD the page makes that
   * passes the guard is fetched through it (redirects come back to the browser, each hop guarded again)
   * and fulfilled, instead of Chromium resolving the host again — the DNS-rebinding window between the
   * guard and the connect. Other methods are refused. A render request's own `fetch` wins.
   */
  fetch?: FetchFunction
  /** Bytes of one sub-request answer fulfilled through `fetch`; a larger one is aborted. Default 16 MiB. */
  maxFulfilBytes?: number
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
