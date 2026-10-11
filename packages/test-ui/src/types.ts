import type { Page } from 'playwright'
import type { ConsentGeoMock } from './consent/types.js'

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
  /**
   * What counts as "arrived". Defaults to `domcontentloaded`.
   *
   * NOT `load`, which is playwright's own default and is wrong for any page that is a real
   * application: `load` waits for EVERY subresource, and an analytics beacon, a long-poll or a
   * third-party pixel that never settles holds it open until the navigation times out — with the
   * page fully rendered and working the whole time. The failure reads as "the site is down".
   *
   * A spec waits for the selector it actually needs; that is the assertion, not the load event.
   */
  waitUntil?: 'commit' | 'domcontentloaded' | 'load' | 'networkidle'
  /** Navigation timeout in ms. */
  timeout?: number
  /**
   * Answer the page's Cloudflare trace with this — installed BEFORE the first navigation, so the
   * consent geo gate sees it on the very first load. See `consentGeoTestHelper.mockConsentGeo`.
   */
  consentGeo?: ConsentGeoMock
}

export interface Mounted {
  page: Page
  /** Closes the page's browser context — the shared browser stays alive. */
  close: () => Promise<void>
}
