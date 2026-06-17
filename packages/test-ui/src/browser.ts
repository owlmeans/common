import { chromium } from 'playwright'
import type { Browser, LaunchOptions } from 'playwright'

let shared: Browser | undefined
let inflight: Promise<Browser> | undefined

/**
 * Launch (or return) a single shared chromium instance for the current
 * `bun test` process. UI specs hold a fixture page off this browser; the
 * suite calls `closeBrowser()` from `afterAll` to tear it down once.
 */
export const launchBrowser = async (opts: LaunchOptions = {}): Promise<Browser> => {
  if (shared != null) return shared
  if (inflight != null) return inflight
  inflight = chromium.launch({ headless: true, ...opts })
  shared = await inflight
  inflight = undefined
  return shared
}

/**
 * Tear down the shared browser. Idempotent — safe to call from multiple
 * `afterAll` hooks.
 */
export const closeBrowser = async (): Promise<void> => {
  const b = shared
  shared = undefined
  inflight = undefined
  if (b != null) {
    await b.close()
  }
}

/**
 * Convenience that launches the browser, runs a callback with a fresh
 * context + page, and closes the context on completion. The browser
 * itself stays alive across calls so multiple specs share it cheaply.
 */
export const withPage = async <T>(
  fn: (page: import('playwright').Page) => Promise<T>
): Promise<T> => {
  const browser = await launchBrowser()
  const context = await browser.newContext()
  const page = await context.newPage()
  try {
    return await fn(page)
  } finally {
    await context.close()
  }
}
