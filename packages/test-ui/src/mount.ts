import { browserHelper } from './browser.js'
import type { Mounted, MountOptions } from './types.js'

const buildUrl = (opts: MountOptions): string => {
  const params = new URLSearchParams()
  if (opts.component != null) params.set('component', opts.component)
  if (opts.props != null) params.set('props', JSON.stringify(opts.props))
  const qs = params.toString()
  if (qs === '') return opts.url
  const sep = opts.url.includes('?') ? '&' : '?'
  return `${opts.url}${sep}${qs}`
}

/**
 * Open a fresh browser context, navigate to the harness URL with the
 * `component` and `props` query parameters set, and return the `Page`
 * along with a `close()` that disposes the context. Use from a `bun:test`
 * spec to drive component-level acceptance assertions:
 *
 *     const { page, close } = await mountComponent({ url: HARNESS, component: 'LoginForm' })
 *     try { expect(await page.locator('h1').textContent()).toBe('Sign in') }
 *     finally { await close() }
 *
 * `browserHelper.closeBrowser()` from `afterAll` tears down the shared browser at the end of the suite.
 */
export const mountComponent = async (opts: MountOptions): Promise<Mounted> => {
  const browser = await browserHelper.launchBrowser()
  const context = await browser.newContext()
  const page = await context.newPage()
  await page.goto(buildUrl(opts), {
    waitUntil: opts.waitUntil ?? 'domcontentloaded',
    ...(opts.timeout != null ? { timeout: opts.timeout } : {}),
  })
  return {
    page,
    close: async () => { await context.close() },
  }
}
