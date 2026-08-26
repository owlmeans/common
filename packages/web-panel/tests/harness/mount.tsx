import '../../src/@/globals.css'

import type { FC, PropsWithChildren } from 'react'
import { createRoot } from 'react-dom/client'
import { config } from '@owlmeans/client-context'
import { AppType, service } from '@owlmeans/config'
import { BASE, HOME } from '@owlmeans/context'
import { entrypoint } from '@owlmeans/client-entrypoint'
import { frontend, route } from '@owlmeans/route'
import { handler, useNavigate } from '@owlmeans/client'
import type { PanelNavConfig, PanelNavLink } from '../../src/index.js'
import { makeContext, modules as baseModules, NavLayout, PanelApp } from '../../src/index.js'

// A real app: a context, a layout entrypoint rendering NavLayout, and screens under it.
// The nav model resolves the active screen from the router, so nothing here may be faked.

const SERVICE = 'web-panel-test'
const API = `${SERVICE}-api`

const alias = {
  dash: `${SERVICE}:web:dash`,
  reports: `${SERVICE}:web:reports`,
  reportsIndex: `${SERVICE}:web:reports-index`,
  reportDetail: `${SERVICE}:web:report-detail`,
  prefs: `${SERVICE}:web:prefs`,
}

const navConfig: PanelNavConfig = {
  sections: [
    // Two screens — the side menu shows.
    {
      name: 'work', label: 'Work', items: [
        { alias: alias.dash, label: 'Dashboard' },
        { alias: alias.reports, label: 'Reports' },
      ]
    },
    // One screen — the side menu must not render at all.
    { name: 'settings', label: 'Settings', items: [{ alias: alias.prefs, label: 'Preferences' }] },
    // No literal labels: exercises the humanized-alias fallback with no i18n present.
    { name: 'extra', items: [{ alias: HOME }] },
  ],
}

const footerLinks: PanelNavLink[] = [
  { alias: alias.dash, label: 'Dashboard' },
  { href: 'https://owlmeans.com', label: 'OwlMeans', open: true },
]

const screen = (id: string, text: string): FC => () => <div id={id}>{text}</div>

const Layout: FC<PropsWithChildren> = ({ children }) => <NavLayout
  nav={navConfig}
  title="Harness"
  actions={<button id="action-slot">action</button>}
  footer={footerLinks}
  // A DARK APPLICATION SHELL, which is what a themed app does to the root: a contrasting
  // surface pair, both halves correct. The header paints its own opaque background, so it is
  // a different surface, and everything in it must stay legible against `--background`
  // rather than against this. The harness carries it permanently so every navigation test
  // runs against the hostile case instead of a default-coloured page.
  className="bg-primary text-primary-foreground"
  // A WIDTH-ONLY rhythm override, which is what a design pass writes when it wants a wider
  // page. It names the width and nothing else, so the centring and the side padding must
  // survive it — substituting this for the default is a page running flush to the window edge.
  containerClassName="max-w-[1280px]"
>{children}</NavLayout>

/** A grouping screen — it renders whichever child the router matched. */
const ReportsGroup: FC<PropsWithChildren> = ({ children }) => <div id="reports-group">{children}</div>

/**
 * The section's landing screen. Its button navigates to a screen the MENU DOES NOT LIST,
 * which is the only way to exercise the parent-chain walk: an in-app navigation puts the
 * unlisted alias into the router state, and the active section has to be found from it.
 */
const ReportsIndex: FC = () => {
  const nav = useNavigate()

  return <div id="reports">
    reports-screen
    <button id="to-detail" onClick={nav.press(alias.reportDetail)}>detail</button>
  </div>
}

// The panel context registers the api-config middleware, which resolves the advertise
// entrypoint during init — that entrypoint needs a declared backend service route, so both
// sides are declared here exactly as a real app declares them.
const base = service({ type: AppType.Frontend, service: SERVICE, host: 'localhost', port: 5173 })
service({ type: AppType.Backend, service: API, host: 'localhost', port: 5174, base: 'api' }, base)
base.security = { unsecure: true }

// `ready` stays false: the Router compiles the entrypoint tree into routes ONLY while the
// context is un-initialized, so a pre-readied context renders a blank page.
const cfg = config(SERVICE, base as never)
const context = makeContext(cfg as never)
context.serviceRoute(SERVICE, true)
context.serviceRoute(API, true)

const modules = [
  // The framework's own entrypoints come first — the api-config middleware the panel context
  // registers resolves one of them during init, and without them init throws before any route
  // is compiled.
  ...baseModules,
  entrypoint(route(BASE, '/', frontend()), handler(Layout)),
  entrypoint(route(HOME, '/', frontend({ default: true, parent: BASE })), handler(screen('home', 'home-screen'))),
  entrypoint(route(alias.dash, '/dash', frontend({ parent: BASE })), handler(screen('dash', 'dash-screen'))),
  // A screen that has children needs a `default: true` child of its own — without one its own
  // path matches nothing and the page renders blank.
  entrypoint(route(alias.reports, '/reports', frontend({ parent: BASE })), handler(ReportsGroup)),
  entrypoint(
    route(alias.reportsIndex, '/', frontend({ default: true, parent: alias.reports })),
    handler(ReportsIndex)
  ),
  entrypoint(
    route(alias.reportDetail, '/detail', frontend({ parent: alias.reports })),
    handler(screen('detail', 'detail-screen'))
  ),
  entrypoint(route(alias.prefs, '/prefs', frontend({ parent: BASE })), handler(screen('prefs', 'prefs-screen'))),
]

context.registerEntrypoints(modules)

createRoot(document.getElementById('root')!).render(<PanelApp context={context as never} />)
