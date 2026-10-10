import type { BrowserContext, Page } from 'playwright'
import { DEFAULT_CONSENT_GEO_COUNTRY, DEFAULT_CONSENT_TRACE_PATH } from './consts.local.js'
import type { ConsentGeoMock, ConsentGeoMockOptions, ConsentGeoTestHelper } from './consent/types.js'

export const createConsentGeoTestHelper = (): ConsentGeoTestHelper => {
  const mockConsentGeo = async (target: Page | BrowserContext, geo: ConsentGeoMock): Promise<void> => {
    const options: ConsentGeoMockOptions & { country: string, delayMs: number, path: string } = {
      country: typeof geo === 'string' ? geo : geo.country ?? DEFAULT_CONSENT_GEO_COUNTRY,
      delayMs: typeof geo === 'string' ? 0 : geo.delayMs ?? 0,
      path: typeof geo === 'string' ? DEFAULT_CONSENT_TRACE_PATH : geo.path ?? DEFAULT_CONSENT_TRACE_PATH,
      ...(typeof geo !== 'string' && geo.fail != null ? { fail: geo.fail } : {}),
      ...(typeof geo !== 'string' && geo.gpc != null ? { gpc: geo.gpc } : {}),
    }

    // A string, not a function: it runs in the page, and this package compiles without DOM types.
    await target.addInitScript({ content: `(function(arg){
      if (arg.gpc != null) {
        Object.defineProperty(Navigator.prototype, 'globalPrivacyControl', { get: function () { return arg.gpc }, configurable: true })
      }
      window.__consentTraceCalls = 0
      var original = window.fetch.bind(window)
      window.fetch = function (input, init) {
        var href = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url
        var url = new URL(href, location.href)
        if (url.origin !== location.origin || url.pathname !== arg.path) return original(input, init)
        window.__consentTraceCalls += 1
        var answer = function () {
          if (arg.fail === 'hang') return new Promise(function () {})
          if (arg.fail === true) return Promise.resolve(new Response('not found', { status: 404 }))
          return Promise.resolve(new Response(
            'fl=0f0\\nh=' + location.hostname + '\\nip=203.0.113.7\\nts=0\\nvisit_scheme=https\\ncolo=TST\\nloc=' + arg.country + '\\n',
            { status: 200, headers: { 'content-type': 'text/plain' } }
          ))
        }
        return arg.delayMs > 0
          ? new Promise(function (resolve) { setTimeout(resolve, arg.delayMs) }).then(answer)
          : answer()
      }
    })(${JSON.stringify(options)})` })
  }

  const traceCalls = async (page: Page): Promise<number> =>
    await page.evaluate('window.__consentTraceCalls || 0') as number

  return { mockConsentGeo, traceCalls }
}

export const consentGeoTestHelper = createConsentGeoTestHelper()
