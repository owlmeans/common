import '../../src/@/globals.css'

import { createRoot } from 'react-dom/client'
import { config } from '@owlmeans/client-context'
import { AppType, service } from '@owlmeans/config'
import { HOME } from '@owlmeans/context'
import { App, handler } from '@owlmeans/client'
import { I18nContext } from '@owlmeans/client-i18n'
import { SUPPORTED_LNGS } from '@owlmeans/i18n'
import { bindAll, bindScreen } from '@owlmeans/client-entrypoint'
import type { EntrypointTree } from '@owlmeans/entrypoint'
import { openProtocol } from '@owlmeans/entrypoint'
import { frontend, route } from '@owlmeans/route'
import { BotPlatform, makeBotProtocols } from '@owlmeans/bot'
import { entrypoints as baseEntrypoints, makeContext } from '@owlmeans/web-client'
import { BotActivityPanel, BotConnectionsPanel } from '../../src/index.js'

/**
 * A real web application around the two panels: the real web context and router, the real
 * client bindings of a bot surface declared the way a target declares `api.bot.operator` — only
 * the SERVER is absent: the specs answer the bot API with `page.route`, on this very origin.
 *
 * Query switches (one harness process serves every case):
 *   `?panel=connections|activity`  which panel to render
 *   `?platforms=telegram,slack`    the connections panel's `platforms`
 *   `?connection=<id>`             the activity panel's filter
 *   `?refs=g1:Spam,g2:Hours`       the activity panel's `refLabel` (ref → label); absent: no `refLabel`
 *   `?lng=<code>`                  render in that language
 */
const params = new URLSearchParams(window.location.search)

const SERVICE = 'web-bot-test'
const API = `${SERVICE}-api`
const lng = params.get('lng') ?? 'en'

const origin = window.location
const base = service({
  type: AppType.Frontend, service: SERVICE, host: origin.hostname, port: Number(origin.port),
})
service({
  type: AppType.Backend, service: API, host: origin.hostname, port: Number(origin.port), base: 'api',
}, base)
base.security = { unsecure: true }
;(base as { i18n?: unknown }).i18n = {
  // French is an extra language an application opts into (the library ships it eagerly beside the
  // seven `SUPPORTED_LNGS`), exactly as the target and the manager do.
  defaultLng: lng, fallbackLng: lng, supportedLngs: [...SUPPORTED_LNGS, 'fr'],
}
// The app starts in a persisted choice first and the BROWSER's language second — headless Chromium
// says `en-US`, which beats `fallbackLng`. Stored the way `setLanguage` stores a person's choice.
try { localStorage.setItem('owlmeans-lng', lng) } catch (_) { /* storage blocked: stays on the browser's */ }

const cfg = config(SERVICE, base as never)
const context = makeContext(cfg as never)
context.serviceRoute(SERVICE, true)
context.serviceRoute(API, true)

// The operator surface, declared as a target's `sources/common/src/bot-protocols.ts` declares it.
const surface = makeBotProtocols({ base: { alias: 'api:bot:operator', path: '/bot/operator', service: API } })

const list = <T extends string>(name: string): T[] | undefined => {
  const value = params.get(name)

  return value == null || value === '' ? undefined : value.split(',') as T[]
}

const panel = params.get('panel') ?? 'connections'
const connection = params.get('connection') ?? undefined
const platforms = list<BotPlatform>('platforms')
const refs = list<string>('refs')
/** What a generated screen passes: its own records' names by id (here, from the query). */
const labels = new Map((refs ?? []).map(pair => pair.split(':') as [string, string]))
const refLabel = refs != null ? (ref: string): string | undefined => labels.get(ref) : undefined

const Harness = () => <main className="mx-auto flex max-w-3xl flex-col gap-6 p-4" data-harness={panel}>
  {panel === 'connections' && <BotConnectionsPanel surface={surface} platforms={platforms} />}
  {panel === 'activity' && <BotActivityPanel surface={surface} connection={connection} refLabel={refLabel} />}
  <p data-harness-ready>ready</p>
</main>

const home = openProtocol(route(HOME, '/', frontend({ default: true })))

context.registerEntrypoints([
  ...baseEntrypoints,
  ...bindAll(surface as unknown as EntrypointTree),
  bindScreen(home, handler(Harness)),
])

createRoot(document.getElementById('root')!).render(
  <I18nContext config={context.cfg}><App context={context as never} /></I18nContext>
)
