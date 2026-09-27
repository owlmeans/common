import '../../src/@/globals.css'

import { createRoot } from 'react-dom/client'
import { config } from '@owlmeans/client-context'
import { AppType, service } from '@owlmeans/config'
import { HOME } from '@owlmeans/context'
import { App, handler } from '@owlmeans/client'
import type { RoutedComponent } from '@owlmeans/client'
import { I18nContext, setLanguage } from '@owlmeans/client-i18n'
import { bindAll, bindScreen } from '@owlmeans/client-entrypoint'
import type { EntrypointTree } from '@owlmeans/entrypoint'
import { openProtocol } from '@owlmeans/entrypoint'
import { backend, frontend, route } from '@owlmeans/route'
import { AUTH_RESOURCE, USER_ID } from '@owlmeans/client-auth'
import { set } from 'idb-keyval'
import { entrypoints as baseEntrypoints, makeContext } from '@owlmeans/web-client'
import { makeMarketingConsentProtocols } from '@owlmeans/marketing-consent'
import {
  appendMarketingConsent, MARKETING_CONSENT_CLIENT_SERVICE, marketingConsentEntrypoints,
  MarketingConsentPreferences,
} from '../../src/index.js'
import type { MarketingConsentClientService } from '../../src/index.js'

/**
 * A real web application around the marketing-consent screen: the real web context (auth service,
 * IndexedDB resources, History-API router), the real login-service host, the real
 * marketing-consent client service — and the status/save/terms API declared as ordinary backend
 * entrypoints. Only the SERVER is absent: the specs answer those requests with `page.route`, on
 * this very origin, so nothing needs CORS.
 *
 * Query switches (one harness process serves every case):
 *   `?bearer=<token>`  the person is signed in with this bearer before the app renders
 *   `?lng=<code>`      render in that language
 *   `?terms=step`      the Terms confirmation moves to the marketing-consent step
 *                       (`appendMarketingConsent({ terms: 'step' })`), with a terms configuration
 *                       so `resolved != null` — a version, a required document, a privacy URL and
 *                       the revision date the Terms row shows.
 */
const params = new URLSearchParams(window.location.search)

const SERVICE = 'web-marketing-consent-test'
const API = `${SERVICE}-api`
const API_BASE = `${SERVICE}:api:base`
const lng = params.get('lng') ?? 'en'
const termsMode = params.get('terms') === 'step'

const origin = window.location
const base = service({
  type: AppType.Frontend, service: SERVICE, host: origin.hostname, port: Number(origin.port),
})
service({
  type: AppType.Backend, service: API, host: origin.hostname, port: Number(origin.port), base: 'api',
}, base)
base.security = {
  unsecure: true,
  ...(termsMode ? {
    auth: {
      login: {
        terms: {
          required: true, version: 'harness-terms-v1',
          terms: 'https://example.test/terms', privacy: 'https://example.test/privacy',
          revisions: { terms: '2026-05-30', privacy: '2026-05-30' }, showRevision: true,
        },
      },
    },
  } : {}),
}
;(base as { i18n?: unknown }).i18n = { defaultLng: lng, fallbackLng: lng }

// `ready` stays false: the Router compiles the entrypoint tree into routes ONLY while the context
// is un-initialized.
const cfg = config(SERVICE, base as never)
const context = makeContext(cfg as never)
context.serviceRoute(SERVICE, true)
context.serviceRoute(API, true)

// The marketing-consent API, mounted where the application mounts it: under a backend parent.
const apiBase = openProtocol(route(API_BASE, '/', backend({ service: API })))
const mcProtocols = makeMarketingConsentProtocols({ parent: API_BASE })

appendMarketingConsent(context as never, { protocols: mcProtocols, terms: termsMode ? 'step' : true })

const home = openProtocol(route(HOME, '/', frontend({ default: true })))
const prefsRoute = openProtocol(route('prefs-screen', '/prefs', frontend()))

const PrefsScreen: RoutedComponent = () => {
  const onSaved = (): void => { (window as unknown as { __mcSaved?: boolean }).__mcSaved = true }

  return <div id="prefs"><MarketingConsentPreferences onSaved={onSaved} /></div>
}

context.registerEntrypoints([
  // The framework's own entrypoints: the real dispatcher among them.
  ...baseEntrypoints,
  ...bindAll({
    apiBase,
    marketingConsent: {
      base: mcProtocols.base, status: mcProtocols.status, save: mcProtocols.save, terms: mcProtocols.terms,
    },
  } as unknown as EntrypointTree),
  ...marketingConsentEntrypoints(mcProtocols),
  bindScreen(home, handler(() => <div id="home">home-screen</div>)),
  bindScreen(prefsRoute, handler(PrefsScreen)),
])

/** What the specs read back from the page — the real service and auth store, never a copy. */
;(window as unknown as { __mc: unknown }).__mc = {
  token: async () => await context.auth().authenticated(),
  status: async (fresh?: boolean) =>
    await context.service<MarketingConsentClientService>(MARKETING_CONSENT_CLIENT_SERVICE).status({ fresh }),
  save: async (decisions: Array<{ key: string, granted: boolean }>) =>
    await context.service<MarketingConsentClientService>(MARKETING_CONSENT_CLIENT_SERVICE)
      .save({ decisions, source: 'settings' }),
  recordTerms: async () => await context.service<MarketingConsentClientService>(MARKETING_CONSENT_CLIENT_SERVICE)
    .recordTerms({ documents: [{ key: 'terms', href: 'https://example.test/terms' }], version: 'v1' }),
}

// A person who signed in on an earlier visit: the record the auth service reads back on
// `authenticated()`, written where the web store keeps it (`<db alias>:<record id>`). The services
// are not initialized yet — and must not be, or the router would compile no routes.
const bearer = params.get('bearer')
if (bearer != null && bearer !== '') await set(`${AUTH_RESOURCE}:${USER_ID}`, { id: USER_ID, token: bearer })

// The instance starts in the language chosen before it exists, so this is what `?lng=` means.
if (lng !== 'en') await setLanguage(lng)

createRoot(document.getElementById('root')!).render(
  <I18nContext config={context.cfg}><App context={context as never} /></I18nContext>
)
