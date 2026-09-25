import {
  CHUNK_RELOAD_KEY, CHUNK_RELOAD_WINDOW_MS, DEF_IMPORT_RETRY_ATTEMPTS, DEF_IMPORT_RETRY_DELAYS_MS
} from './consts.js'
import type { RetryImportOptions } from './types.js'

/**
 * What a browser says when a dynamic `import()` could not fetch its module — Chromium, Safari and
 * Firefox, in that order — and what Vite's preload helper says when a chunk's stylesheet could not.
 */
const CHUNK_FAILURE = /failed to fetch dynamically imported module|importing a module script failed|error loading dynamically imported module|unable to preload css/i

/**
 * Whether `error` is a chunk that could not be FETCHED: a browser's failed dynamic import, Vite's
 * stylesheet preload failure, webpack's `ChunkLoadError`, Vite's `vite:preloadError` event, or
 * the `error` event of the element a loader fetched through. A module that was fetched and then
 * failed — a missing export, a throw while it evaluated — is not one: loading it again changes
 * nothing.
 */
export const isChunkLoadError = (error: unknown): boolean => {
  if (error == null || typeof error !== 'object') {
    return false
  }
  if (typeof Event !== 'undefined' && error instanceof Event) {
    return error.type === 'vite:preloadError' || error.type === 'error'
  }
  const { name, message } = error as { name?: unknown, message?: unknown }

  return name === 'ChunkLoadError' || (typeof message === 'string' && CHUNK_FAILURE.test(message))
}

const pause = (ms: number): Promise<void> => new Promise(resolve => setTimeout(resolve, ms))

/** The module URL a Chromium or Firefox import failure names; Safari's message names none. */
const FAILED_URL = /dynamically imported module:?\s+(\S+)/i

/**
 * The URL of the chunk a failed dynamic import tried to fetch, when the browser's error names it
 * and it is an http(s) URL of this page's origin — never an arbitrary URL out of a message. `null`
 * otherwise (Safari, a non-browser platform, another origin).
 */
export const chunkUrlOf = (error: unknown): string | null => {
  const message = (error as { message?: unknown } | null)?.message
  const found = typeof message === 'string' ? FAILED_URL.exec(message)?.[1] : undefined
  if (found == null) {
    return null
  }
  try {
    const url = new URL(found)
    const origin = typeof location !== 'undefined' ? location.origin : undefined
    if ((url.protocol !== 'https:' && url.protocol !== 'http:') || (origin != null && url.origin !== origin)) {
      return null
    }
    return url.href
  } catch {
    return null
  }
}

/**
 * `href` with a fresh `t` parameter: a URL the browser has not seen, so it fetches the module
 * again. `t` is the parameter Vite's dev server already gives module URLs; a static host ignores it.
 */
export const cacheBustedUrl = (href: string, now: number = Date.now()): string => {
  const url = new URL(href)
  url.searchParams.set('t', String(now))
  return url.href
}

const importUrl = (url: string): Promise<unknown> =>
  import(/* @vite-ignore */ /* webpackIgnore: true */ url)

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
export const retryImport = async <M>(load: () => Promise<M>, opts?: RetryImportOptions): Promise<M> => {
  const attempts = Math.max(0, opts?.attempts ?? DEF_IMPORT_RETRY_ATTEMPTS)
  const delays = opts?.delaysMs ?? DEF_IMPORT_RETRY_DELAYS_MS
  const shouldRetry = opts?.shouldRetry ?? isChunkLoadError
  const bust = opts?.bustCache !== false
  const importBusted = opts?.importUrl ?? importUrl

  let next: () => Promise<M> = load
  for (let attempt = 0; ; attempt++) {
    try {
      return await next()
    } catch (error) {
      if (attempt >= attempts || !shouldRetry(error)) {
        throw error
      }
      const url = bust ? chunkUrlOf(error) : null
      if (url != null) {
        next = async () => await importBusted(cacheBustedUrl(url)) as M
      }
      await pause(delays[Math.min(attempt, delays.length - 1)] ?? 0)
    }
  }
}

/**
 * Reload the page, at most once per `windowMs` in this tab — the time of the last reload is kept
 * in `sessionStorage` under `key`. Never while offline (the reload would land on the browser's own
 * error page), and never without storage: with nowhere to keep the guard, a failure that survives
 * the reload would reload forever. A platform with no page to reload does nothing. Answers whether
 * a reload was started.
 */
export const reloadOnce = (key: string, windowMs: number): boolean => {
  const location = typeof window !== 'undefined' ? window.location : undefined
  if (typeof location?.reload !== 'function') {
    return false
  }
  if (typeof navigator !== 'undefined' && navigator.onLine === false) {
    return false
  }
  try {
    const now = Date.now()
    if (now - Number(window.sessionStorage.getItem(key) ?? 0) < windowMs) {
      return false
    }
    window.sessionStorage.setItem(key, String(now))
  } catch {
    return false
  }
  location.reload()

  return true
}

/**
 * The guarded reload a chunk that failed for good ends in: `reloadOnce` under one key every caller
 * in the tab shares, so a lazy boundary and an application's own `vite:preloadError` listener
 * never reload twice for one failure.
 */
export const recoverFromChunkError = (): boolean => reloadOnce(CHUNK_RELOAD_KEY, CHUNK_RELOAD_WINDOW_MS)
