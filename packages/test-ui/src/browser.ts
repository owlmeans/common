import { chromium } from 'playwright'
import type { Browser, LaunchOptions, Page } from 'playwright'
import type { BrowserHelper } from './browser/types.js'

// Process-wide on purpose: every spec of a `bun test` run shares one browser.
let shared: Browser | undefined
let inflight: Promise<Browser> | undefined

export const createBrowserHelper = (): BrowserHelper => {
  const launchBrowser = async (opts: LaunchOptions = {}): Promise<Browser> => {
    if (shared != null) return shared
    if (inflight != null) return inflight
    inflight = chromium.launch({ headless: true, ...opts })
    shared = await inflight
    inflight = undefined
    return shared
  }

  const closeBrowser = async (): Promise<void> => {
    const b = shared
    shared = undefined
    inflight = undefined
    if (b != null) {
      await b.close()
    }
  }

  const withPage = async <T>(fn: (page: Page) => Promise<T>): Promise<T> => {
    const browser = await launchBrowser()
    const context = await browser.newContext()
    const page = await context.newPage()
    try {
      return await fn(page)
    } finally {
      await context.close()
    }
  }

  return { launchBrowser, closeBrowser, withPage }
}

export const browserHelper = createBrowserHelper()

/** @deprecated compat:factory-refactor — use `browserHelper.launchBrowser(…)` */
export const launchBrowser = async (opts: LaunchOptions = {}): Promise<Browser> =>
  await browserHelper.launchBrowser(opts)

/** @deprecated compat:factory-refactor — use `browserHelper.closeBrowser()` */
export const closeBrowser = async (): Promise<void> => await browserHelper.closeBrowser()

/** @deprecated compat:factory-refactor — use `browserHelper.withPage(…)` */
export const withPage = async <T>(fn: (page: Page) => Promise<T>): Promise<T> =>
  await browserHelper.withPage(fn)
