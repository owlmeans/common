import type { Browser, LaunchOptions, Page } from 'playwright'

/** The one chromium a `bun test` process shares, and the pages specs drive off it. */
export interface BrowserHelper {
  /**
   * Launch (or return) a single shared chromium instance for the current
   * `bun test` process. UI specs hold a fixture page off this browser; the
   * suite calls {@link BrowserHelper.closeBrowser} from `afterAll` to tear it down once.
   */
  launchBrowser: (opts?: LaunchOptions) => Promise<Browser>
  /**
   * Tear down the shared browser. Idempotent — safe to call from multiple
   * `afterAll` hooks.
   */
  closeBrowser: () => Promise<void>
  /**
   * Convenience that launches the browser, runs a callback with a fresh
   * context + page, and closes the context on completion. The browser
   * itself stays alive across calls so multiple specs share it cheaply.
   */
  withPage: <T>(fn: (page: Page) => Promise<T>) => Promise<T>
}
