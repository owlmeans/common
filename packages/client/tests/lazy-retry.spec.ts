import { afterEach, describe, expect, test } from 'bun:test'
import { CHUNK_RELOAD_KEY, lazyRetryHelper } from '../src/index.js'

/** What Chromium rejects a dynamic import with when the module's fetch failed. */
const chunkError = () => new TypeError('Failed to fetch dynamically imported module: https://app.test/assets/body.js')

/** A load that rejects with each of `failures` in turn, then resolves; `calls()` counts its runs. */
const flaky = (...failures: unknown[]) => {
  let calls = 0
  const load = async () => {
    const failure = failures[calls++]
    if (failure !== undefined) {
      throw failure
    }
    return { Body: 'module' }
  }
  return { load, calls: () => calls }
}

describe('isChunkLoadError', () => {
  test('recognises a failed module fetch in each browser, a CSS preload and webpack', () => {
    expect(lazyRetryHelper.isChunkLoadError(chunkError())).toBe(true)
    expect(lazyRetryHelper.isChunkLoadError(new TypeError('Importing a module script failed.'))).toBe(true)
    expect(lazyRetryHelper.isChunkLoadError(new TypeError('error loading dynamically imported module: https://app.test/a.js'))).toBe(true)
    expect(lazyRetryHelper.isChunkLoadError(new Error('Unable to preload CSS for /assets/body.css'))).toBe(true)
    expect(lazyRetryHelper.isChunkLoadError(Object.assign(new Error('Loading chunk 7 failed.'), { name: 'ChunkLoadError' }))).toBe(true)
  })

  test('recognises Vite\'s preload event and an element\'s error event', () => {
    expect(lazyRetryHelper.isChunkLoadError(new Event('vite:preloadError'))).toBe(true)
    expect(lazyRetryHelper.isChunkLoadError(new Event('error'))).toBe(true)
    expect(lazyRetryHelper.isChunkLoadError(new Event('load'))).toBe(false)
  })

  test('refuses a module that loaded and broke, and anything that is not an error', () => {
    expect(lazyRetryHelper.isChunkLoadError(new SyntaxError('The requested module does not provide an export named \'Body\''))).toBe(false)
    expect(lazyRetryHelper.isChunkLoadError(new SyntaxError('Lazy module has no component export "Body"'))).toBe(false)
    expect(lazyRetryHelper.isChunkLoadError(new Error('boom'))).toBe(false)
    expect(lazyRetryHelper.isChunkLoadError('Failed to fetch dynamically imported module')).toBe(false)
    expect(lazyRetryHelper.isChunkLoadError(undefined)).toBe(false)
  })
})

describe('retryImport', () => {
  test('retries a chunk failure and resolves with the module that then arrives', async () => {
    const { load, calls } = flaky(chunkError(), chunkError())

    expect(await lazyRetryHelper.retryImport(load, { delaysMs: [1], bustCache: false })).toEqual({ Body: 'module' })
    expect(calls()).toBe(3)
  })

  test('gives up after `attempts` retries with the last failure', async () => {
    const last = chunkError()
    const three = flaky(chunkError(), chunkError(), last)

    await expect(lazyRetryHelper.retryImport(three.load, { delaysMs: [1], bustCache: false })).rejects.toBe(last)
    expect(three.calls()).toBe(3)

    const once = flaky(chunkError())
    await expect(lazyRetryHelper.retryImport(once.load, { attempts: 0 })).rejects.toBeInstanceOf(TypeError)
    expect(once.calls()).toBe(1)
  })

  test('never retries an error that is not a chunk failure', async () => {
    const broken = new SyntaxError('The requested module does not provide an export named \'Body\'')
    const { load, calls } = flaky(broken)

    await expect(lazyRetryHelper.retryImport(load, { delaysMs: [1] })).rejects.toBe(broken)
    expect(calls()).toBe(1)
  })

  test('waits the configured pauses in order, and asks `shouldRetry` which failures to retry', async () => {
    const { load, calls } = flaky(new Error('busy'), new Error('busy'))
    const started = Date.now()

    expect(await lazyRetryHelper.retryImport(load, { delaysMs: [30, 60], shouldRetry: e => (e as Error).message === 'busy' }))
      .toEqual({ Body: 'module' })
    expect(Date.now() - started).toBeGreaterThanOrEqual(85)
    expect(calls()).toBe(3)
  })
})

/**
 * A hand-written browser, not jsdom: the guard reads exactly a clock, `sessionStorage`,
 * `navigator.onLine` and `location.reload`, and a real DOM would prove a fixture works rather
 * than that the guard does.
 */
const stubBrowser = (opts: { online?: boolean, storage?: 'ok' | 'throws' } = {}) => {
  const store = new Map<string, string>()
  const reloads = { count: 0 }
  const sessionStorage = opts.storage === 'throws'
    ? { getItem: () => { throw new Error('SecurityError') }, setItem: () => { throw new Error('SecurityError') } }
    : { getItem: (key: string) => store.get(key) ?? null, setItem: (key: string, value: string) => void store.set(key, value) }
  const globals = globalThis as unknown as Record<string, unknown>
  globals.window = { location: { reload: () => { reloads.count++ } }, sessionStorage }
  Object.defineProperty(globalThis, 'navigator', { value: { onLine: opts.online ?? true }, configurable: true })

  return { store, reloads }
}

const realNavigator = globalThis.navigator

afterEach(() => {
  delete (globalThis as { window?: unknown }).window
  Object.defineProperty(globalThis, 'navigator', { value: realNavigator, configurable: true })
})

describe('cache-busted retries', () => {
  test('chunkUrlOf reads the URL Chromium and Firefox name, and nothing else', () => {
    expect(lazyRetryHelper.chunkUrlOf(chunkError())).toBe('https://app.test/assets/body.js')
    expect(lazyRetryHelper.chunkUrlOf(new TypeError('error loading dynamically imported module: https://app.test/src/x.tsx?t=1')))
      .toBe('https://app.test/src/x.tsx?t=1')
    expect(lazyRetryHelper.chunkUrlOf(new TypeError('Importing a module script failed.'))).toBeNull()
    expect(lazyRetryHelper.chunkUrlOf(new TypeError('Failed to fetch dynamically imported module: javascript:alert(1)'))).toBeNull()
    expect(lazyRetryHelper.chunkUrlOf(new SyntaxError('no export'))).toBeNull()
    expect(lazyRetryHelper.chunkUrlOf(null)).toBeNull()
  })

  test('chunkUrlOf refuses a URL of another origin than the page', () => {
    const saved = (globalThis as { location?: unknown }).location
    ;(globalThis as { location?: unknown }).location = { origin: 'https://other.test' }
    try {
      expect(lazyRetryHelper.chunkUrlOf(chunkError())).toBeNull()
      ;(globalThis as { location?: unknown }).location = { origin: 'https://app.test' }
      expect(lazyRetryHelper.chunkUrlOf(chunkError())).toBe('https://app.test/assets/body.js')
    } finally {
      ;(globalThis as { location?: unknown }).location = saved
    }
  })

  test('cacheBustedUrl sets a fresh t, keeping the other parameters', () => {
    expect(lazyRetryHelper.cacheBustedUrl('https://app.test/src/x.tsx?import&t=1', 42)).toBe('https://app.test/src/x.tsx?import=&t=42')
    expect(lazyRetryHelper.cacheBustedUrl('https://app.test/assets/body.js', 7)).toBe('https://app.test/assets/body.js?t=7')
  })

  test('a retry imports the failed chunk from a new URL instead of repeating load', async () => {
    const { load, calls } = flaky(chunkError(), chunkError(), chunkError())
    const imported: string[] = []
    const importUrl = async (url: string) => {
      imported.push(url)
      return { Body: 'fresh' }
    }

    expect(await lazyRetryHelper.retryImport(load, { delaysMs: [1], importUrl })).toEqual({ Body: 'fresh' })
    expect(calls()).toBe(1)
    expect(imported).toHaveLength(1)
    expect(imported[0]).toStartWith('https://app.test/assets/body.js?t=')
  })

  test('without a URL in the error (Safari), load runs again as is', async () => {
    const { load, calls } = flaky(new TypeError('Importing a module script failed.'))
    const imported: string[] = []

    expect(await lazyRetryHelper.retryImport(load, { delaysMs: [1], importUrl: async url => { imported.push(url); return {} } }))
      .toEqual({ Body: 'module' })
    expect(calls()).toBe(2)
    expect(imported).toEqual([])
  })
})

describe('reloadOnce / recoverFromChunkError', () => {
  test('reloads once per window per tab, and again once the window has passed', () => {
    const { store, reloads } = stubBrowser()

    expect(lazyRetryHelper.reloadOnce('k', 60_000)).toBe(true)
    expect(lazyRetryHelper.reloadOnce('k', 60_000)).toBe(false)
    expect(reloads.count).toBe(1)

    store.set('k', String(Date.now() - 61_000))
    expect(lazyRetryHelper.reloadOnce('k', 60_000)).toBe(true)
    expect(reloads.count).toBe(2)
  })

  test('never reloads while offline, or without storage to keep the guard', () => {
    const offline = stubBrowser({ online: false })
    expect(lazyRetryHelper.reloadOnce('k', 60_000)).toBe(false)
    expect(offline.reloads.count).toBe(0)

    const blocked = stubBrowser({ storage: 'throws' })
    expect(lazyRetryHelper.reloadOnce('k', 60_000)).toBe(false)
    expect(blocked.reloads.count).toBe(0)
  })

  test('does nothing where there is no page to reload', () => {
    expect(lazyRetryHelper.reloadOnce('k', 60_000)).toBe(false)
  })

  test('recoverFromChunkError shares one guard under CHUNK_RELOAD_KEY', () => {
    const { store, reloads } = stubBrowser()

    expect(lazyRetryHelper.recoverFromChunkError()).toBe(true)
    expect(store.has(CHUNK_RELOAD_KEY)).toBe(true)
    expect(lazyRetryHelper.reloadOnce(CHUNK_RELOAD_KEY, 60_000)).toBe(false)
    expect(lazyRetryHelper.recoverFromChunkError()).toBe(false)
    expect(reloads.count).toBe(1)
  })
})
