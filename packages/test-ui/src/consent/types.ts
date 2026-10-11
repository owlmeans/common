import type { BrowserContext, Page } from 'playwright'

/**
 * A fake answer from Cloudflare's trace endpoint: a country code (`'US'`), or
 * `{ country?, fail?, delayMs?, gpc? }`.
 */
export type ConsentGeoMock = string | ConsentGeoMockOptions

export interface ConsentGeoMockOptions {
  /** The `loc=` the fake trace answers with. Defaults to `PL` — a consent country. */
  country?: string
  /** `true` answers 404 (the host is not behind Cloudflare); `'hang'` never answers. */
  fail?: boolean | 'hang'
  /** Answer only after this many ms — long enough to see the spinner. */
  delayMs?: number
  /** Send Global Privacy Control (`navigator.globalPrivacyControl`). */
  gpc?: boolean
  /** The trace path the page asks. Defaults to `/cdn-cgi/trace`. */
  path?: string
}

/**
 * Pinning where a visitor is, so a consent test does not depend on where its runner happens to be:
 * every app behind Cloudflare answers the trace with the RUNNER's country.
 */
export interface ConsentGeoTestHelper {
  /**
   * Answer the page's same-origin trace request from inside the page: an init script that wraps
   * `window.fetch` before any page script runs, and counts the calls in
   * `window.__consentTraceCalls`. Never `page.route` — interception disables the cache for every
   * request, and a vite-served application stalls on its hundreds of unbundled modules.
   *
   * Applies to the NEXT navigation of the page or context it is installed on.
   */
  mockConsentGeo: (target: Page | BrowserContext, geo: ConsentGeoMock) => Promise<void>
  /** How many trace requests the page made since it loaded (`mockConsentGeo` only). */
  traceCalls: (page: Page) => Promise<number>
}
