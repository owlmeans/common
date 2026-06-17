import type { Page } from 'playwright'
import { launchBrowser } from './browser.js'

export interface MountOptions {
  /**
   * URL the harness is reachable at. The consuming package is in charge
   * of producing it — typically a Vite dev server pointed at
   * `node_modules/@owlmeans/test-ui/harness/` plus a per-package
   * `mount.tsx` that registers the components under test, OR an
   * inlined `data:text/html,...` URL for the simplest smoke tests.
   */
  url: string
  /**
   * Component name registered in the harness. Appended as `?component=`.
   * Omit when the harness mounts a single fixed root.
   */
  component?: string
  /**
   * JSON-serialisable props passed to the component. Encoded into the
   * URL as `?props=<json>` for the harness's `mount.tsx` to read.
   */
  props?: Record<string, unknown>
}

export interface Mounted {
  page: Page
  /** Closes the page's browser context — the shared browser stays alive. */
  close: () => Promise<void>
}

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
 * `closeBrowser()` from `afterAll` tears down the shared browser at the end of the suite.
 */
export const mountComponent = async (opts: MountOptions): Promise<Mounted> => {
  const browser = await launchBrowser()
  const context = await browser.newContext()
  const page = await context.newPage()
  await page.goto(buildUrl(opts))
  return {
    page,
    close: async () => { await context.close() },
  }
}
