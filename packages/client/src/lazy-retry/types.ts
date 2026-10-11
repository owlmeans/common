import type { RetryImportOptions } from '../types.js'

/** Recovers a lazily-loaded chunk that failed to fetch: retry in place, then a guarded reload. */
export interface LazyRetryHelper {
  /**
   * Whether `error` is a chunk that could not be FETCHED: a browser's failed dynamic import, Vite's
   * stylesheet preload failure, webpack's `ChunkLoadError`, Vite's `vite:preloadError` event, or
   * the `error` event of the element a loader fetched through. A module that was fetched and then
   * failed — a missing export, a throw while it evaluated — is not one: loading it again changes
   * nothing.
   */
  isChunkLoadError: (error: unknown) => boolean
  /**
   * The URL of the chunk a failed dynamic import tried to fetch, when the browser's error names it
   * and it is an http(s) URL of this page's origin — never an arbitrary URL out of a message. `null`
   * otherwise (Safari, a non-browser platform, another origin).
   */
  chunkUrlOf: (error: unknown) => string | null
  /**
   * `href` with a fresh `t` parameter: a URL the browser has not seen, so it fetches the module
   * again. `t` is the parameter Vite's dev server already gives module URLs; a static host ignores it.
   */
  cacheBustedUrl: (href: string, now?: number) => string
  /**
   * Run `load` — a dynamic `import()` — and, while it rejects with a chunk-load failure, run it again
   * after a pause, `attempts` more times at most. Any other rejection is rethrown at once.
   *
   * This covers a TRANSIENT failure — a network blip, an edge answering 404 or 5xx for a moment.
   * A browser remembers a failed module fetch for the document's lifetime (Chromium does) and
   * rejects every later `import()` of that URL at once, so a retry imports the URL the error names
   * with a cache-busting parameter instead (`bustCache`, default on): a new URL, fetched again. Where
   * the error names no URL (Safari), `load` runs again as is; what always recovers is a new
   * document, which `recoverFromChunkError` starts, once and guarded.
   */
  retryImport: <M>(load: () => Promise<M>, opts?: RetryImportOptions) => Promise<M>
  /**
   * Reload the page, at most once per `windowMs` in this tab — the time of the last reload is kept
   * in `sessionStorage` under `key`. Never while offline (the reload would land on the browser's own
   * error page), and never without storage: with nowhere to keep the guard, a failure that survives
   * the reload would reload forever. A platform with no page to reload does nothing. Answers whether
   * a reload was started.
   */
  reloadOnce: (key: string, windowMs: number) => boolean
  /**
   * The guarded reload a chunk that failed for good ends in: `reloadOnce` under one key every caller
   * in the tab shares, so a lazy boundary and an application's own `vite:preloadError` listener
   * never reload twice for one failure.
   */
  recoverFromChunkError: () => boolean
}
