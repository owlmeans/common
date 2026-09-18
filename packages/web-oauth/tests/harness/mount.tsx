import '../../src/@/globals.css'

import { createRoot } from 'react-dom/client'
import { config } from '@owlmeans/client-context'
import { AppType, service } from '@owlmeans/config'
import { HOME } from '@owlmeans/context'
import { App, handler } from '@owlmeans/client'
import { I18nContext } from '@owlmeans/client-i18n'
import { bindAll, bindScreen } from '@owlmeans/client-entrypoint'
import type { EntrypointTree } from '@owlmeans/entrypoint'
import { openProtocol } from '@owlmeans/entrypoint'
import { backend, frontend, route } from '@owlmeans/route'
import { AUTH_RESOURCE, USER_ID } from '@owlmeans/client-auth'
import { FLOW_STATE, RESUME_FLOW } from '@owlmeans/client-flow'
import { set } from 'idb-keyval'
import type { ClientResource } from '@owlmeans/client-resource'
import { appendFlowService } from '@owlmeans/web-flow'
import { entrypoints as baseEntrypoints, makeContext } from '@owlmeans/web-client'
import { makeOAuthProtocols } from '@owlmeans/oauth'
import { appendOAuthScreens, oauthEntrypoints } from '../../src/index.js'

/**
 * A real web application around the three screens: the real web context (auth service, IndexedDB
 * resources, History-API router), the real flow service, the real dispatcher — and the consent API
 * declared as ordinary backend entrypoints. Only the SERVER is absent: the specs answer the API's
 * requests with `page.route`, on this very origin, so nothing needs CORS.
 *
 * Query switches (one harness process serves every case):
 *   `?bearer=<token>`  the person is signed in with this bearer before the app renders
 *   `?lng=<code>`      render in that language
 */
const params = new URLSearchParams(window.location.search)

const SERVICE = 'web-oauth-test'
const API = `${SERVICE}-api`
const API_BASE = `${SERVICE}:api:base`
const lng = params.get('lng') ?? 'en'

const origin = window.location
const base = service({
  type: AppType.Frontend, service: SERVICE, host: origin.hostname, port: Number(origin.port),
})
service({
  type: AppType.Backend, service: API, host: origin.hostname, port: Number(origin.port), base: 'api',
}, base)
base.security = { unsecure: true }
;(base as { i18n?: unknown }).i18n = { defaultLng: lng, fallbackLng: lng }

// `ready` stays false: the Router compiles the entrypoint tree into routes ONLY while the context
// is un-initialized.
const cfg = config(SERVICE, base as never)
const context = makeContext(cfg as never)
context.serviceRoute(SERVICE, true)
context.serviceRoute(API, true)
appendFlowService(context as never)
appendOAuthScreens(context as never)

// The consent API, mounted where the application mounts it: under a backend parent.
const apiBase = openProtocol(route(API_BASE, '/', backend({ service: API })))
const consentApi = makeOAuthProtocols({ parent: API_BASE })

const home = openProtocol(route(HOME, '/', frontend({ default: true })))

context.registerEntrypoints([
  // The framework's own entrypoints: the real dispatcher among them.
  ...baseEntrypoints,
  ...bindAll({
    apiBase,
    oauth: { base: consentApi.base, load: consentApi.load, approve: consentApi.approve, deny: consentApi.deny },
  } as unknown as EntrypointTree),
  ...oauthEntrypoints(),
  bindScreen(home, handler(() => <div id="home">home-screen</div>)),
])

/** What the specs read back from the page — the real stores, never a copy. */
;(window as unknown as { __oauth: unknown }).__oauth = {
  suspended: async () => await context.resource<ClientResource<Record<string, unknown>>>(FLOW_STATE).load(RESUME_FLOW),
  token: async () => await context.auth().authenticated(),
}

// A person who signed in on an earlier visit: the record the auth service reads back on
// `authenticated()`, written where the web store keeps it (`<db alias>:<record id>`). The services
// are not initialized yet — and must not be, or the router would compile no routes.
const bearer = params.get('bearer')
if (bearer != null && bearer !== '') await set(`${AUTH_RESOURCE}:${USER_ID}`, { id: USER_ID, token: bearer })

createRoot(document.getElementById('root')!).render(
  <I18nContext config={context.cfg}><App context={context as never} /></I18nContext>
)
