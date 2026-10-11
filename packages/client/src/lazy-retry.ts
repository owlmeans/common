import {
  CHUNK_RELOAD_KEY, CHUNK_RELOAD_WINDOW_MS, DEF_IMPORT_RETRY_ATTEMPTS, DEF_IMPORT_RETRY_DELAYS_MS
} from './consts.js'
import type { RetryImportOptions } from './types.js'
import { CHUNK_FAILURE, FAILED_URL } from './consts.local.js'
import type { LazyRetryHelper } from './lazy-retry/types.js'

export const createLazyRetryHelper = (): LazyRetryHelper => {
  const isChunkLoadError = (error: unknown): boolean => {
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

  const chunkUrlOf = (error: unknown): string | null => {
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

  const cacheBustedUrl = (href: string, now: number = Date.now()): string => {
    const url = new URL(href)
    url.searchParams.set('t', String(now))
    return url.href
  }

  const importUrl = (url: string): Promise<unknown> =>
    import(/* @vite-ignore */ /* webpackIgnore: true */ url)

  const retryImport = async <M>(load: () => Promise<M>, opts?: RetryImportOptions): Promise<M> => {
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

  const reloadOnce = (key: string, windowMs: number): boolean => {
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

  const recoverFromChunkError = (): boolean => reloadOnce(CHUNK_RELOAD_KEY, CHUNK_RELOAD_WINDOW_MS)

  return { isChunkLoadError, chunkUrlOf, cacheBustedUrl, retryImport, reloadOnce, recoverFromChunkError }
}

export const lazyRetryHelper = createLazyRetryHelper()

/** @deprecated compat:factory-refactor — use `lazyRetryHelper.recoverFromChunkError()` */
export const recoverFromChunkError = (): boolean => lazyRetryHelper.recoverFromChunkError()
