import '../../src/@/globals.css'

import type { FC, PropsWithChildren } from 'react'
import { createRoot } from 'react-dom/client'
import { config } from '@owlmeans/client-context'
import { AppType, service } from '@owlmeans/config'
import { BASE, HOME } from '@owlmeans/context'
import { bindScreen } from '@owlmeans/client-entrypoint'
import { openProtocol } from '@owlmeans/entrypoint'
import { frontend, route } from '@owlmeans/route'
import { handler, useNavigate } from '@owlmeans/client'
import { toast } from 'sonner'
import type { PanelNavConfig, PanelNavLink } from '../../src/index.js'
import {
  makeContext, useContext, entrypoints as baseEntrypoints, NavLayout, PanelApp, Toaster
} from '../../src/index.js'
import { LoginScreen } from '../../src/components/login/index.js'
import {
  PanelCookieConsent, PanelConsentMenuWidget, appendConsentWidgetService, useConsentMenuPresence
} from '../../src/consent/index.js'
import { LoginOutcome, ensureLoginService } from '@owlmeans/client-auth/login'
import type { LoginMethod } from '@owlmeans/client-auth/login'

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
  login: `${SERVICE}:web:login`,
  socket: `${SERVICE}:web:socket`,
}

/** A harness id for the ONE tracked connection this screen simulates — a real `ws()`/`useWs()`
 *  connection would generate its own, but the status service only cares that it is stable across
 *  the two buttons below. */
const HARNESS_SOCKET_ID = 'harness-socket'

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

/**
 * What the sign-in screen offers in the harness.
 *
 * Real methods, with real `start` handlers that record they were called — the one thing the
 * screen must never do is start one on its own, and a method that only pretended to start could
 * not prove it.
 */
const started: string[] = []
;(globalThis as unknown as { __loginStarted: string[] }).__loginStarted = started

const method = (id: string, over?: Partial<LoginMethod>): LoginMethod => ({
  id,
  order: 10,
  start: async () => { started.push(id); return LoginOutcome.Handled },
  ...over,
})

/** The sign-in screen, with the terms confirmation the configuration requires. */
const LoginHarness: FC = () => <LoginScreen
  Logo={() => <span id="login-logo">logo</span>}
  translate={(_key, defaultValue) => defaultValue}
/>

// `?header=broken` simulates the layout-restyle bug this harness pins: a `headerClassName`
// carrying an invalid Tailwind v4 arbitrary-value background (v3 syntax, silently dropped) and a
// bare `bg-transparent`, either of which used to leave the sticky header with no background paint
// of its own at all. One harness process serves both branches, exactly like `reloadDialog` above.
const brokenHeader = new URLSearchParams(window.location.search).get('header') === 'broken'
// `?footer=none` omits the `footer` prop entirely — the shape every area layout had before the
// shell grew a footer-links convention. `NavLayout` must still render the credit line then.
const noFooterProp = new URLSearchParams(window.location.search).get('footer') === 'none'
// `?footer=node` hands `NavLayout` a NODE footer — an application's own footer layout (a brand
// block and a Legal column), the shape a generated app's footer takes — instead of links.
const nodeFooter = new URLSearchParams(window.location.search).get('footer') === 'node'
// `?mobileMenu=1` opts into the narrow-viewport menu sheet. Absent, the prop is not passed at
// all — the shape every existing layout has — and the shell must render exactly what it always did.
const mobileMenu = new URLSearchParams(window.location.search).get('mobileMenu') === '1'
// `?consent=bare` mounts `PanelCookieConsent` on a context that never appended the presence
// service — an application using the dialog on its own. `?consent=menu` appends the service, so
// the footer's "Cookie settings" control takes over the floating button's job.
const consentMode = new URLSearchParams(window.location.search).get('consent')
// `?skip=off` passes `skipLinkLabel={false}` — an application that renders its own skip link.
const skipOff = new URLSearchParams(window.location.search).get('skip') === 'off'
// `?themeToggle=1` asks for the footer's light/dark switcher. Absent, the prop is not passed.
const themeToggle = new URLSearchParams(window.location.search).get('themeToggle') === '1'
// `?terms=extended` adds billing/product/custom documents and a revision date to the terms
// confirmation — the shape that pins the "still exactly one checkbox" and "documents render
// outside the notice" rules even when there is more than terms+privacy to show.
const extendedTerms = new URLSearchParams(window.location.search).get('terms') === 'extended'

/**
 * The footer's "Cookie settings" control — the menu widget, rendered from an always-mounted
 * component that also declares the presence, exactly as the `./consent` rules ask.
 */
const CookieSettings: FC = () => {
  useConsentMenuPresence()

  return <PanelConsentMenuWidget label="Cookie settings" className="w-auto" />
}

const FooterBlock: FC = () => <div id="footer-block" className="flex flex-wrap justify-between gap-8">
  <div>
    <strong>Harness</strong>
    <p>One line about what the harness does.</p>
  </div>
  <nav aria-label="Legal">
    <p>Legal</p>
    <ul>
      <li><a href="/privacy">Privacy</a></li>
      <li><a href="/terms">Terms</a></li>
      {consentMode != null && <li><CookieSettings /></li>}
    </ul>
  </nav>
</div>

const Layout: FC<PropsWithChildren> = ({ children }) => <>
  <NavLayout
    nav={navConfig}
    title="Harness"
    actions={<button id="action-slot">action</button>}
    {...(noFooterProp ? {} : { footer: nodeFooter ? <FooterBlock /> : footerLinks })}
    {...(mobileMenu ? { mobileMenu: true } : {})}
    {...(skipOff ? { skipLinkLabel: false as const } : {})}
    {...(themeToggle ? { themeToggle: true } : {})}
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
    {...(brokenHeader ? { headerClassName: 'bg-[--nope] bg-transparent' } : {})}
  >{children}</NavLayout>
  {/* Mounted ONCE, in the layout — exactly where an application mounts it. */}
  <Toaster />
</>

/** The toast surface's exercise: a screen action that reports its outcome. */
const PrefsScreen: FC = () => <div id="prefs">
  prefs-screen
  <button id="fire-toast" onClick={() => toast.success('preferences saved')}>save</button>
  {/* Outlives any assertion — a theme check must not race the 5s default dismissal. */}
  <button id="fire-sticky" onClick={() => toast.error('sticky failure', { duration: 600_000 })}>fail</button>
</div>

/** A grouping screen — it renders whichever child the router matched. */
const ReportsGroup: FC<PropsWithChildren> = ({ children }) => <div id="reports-group">{children}</div>

/**
 * Drives the SAME status service `SocketReloadDialog` reads, exactly the way a real dropped
 * `ws()`/`useWs()` connection would — through `report()`/`release()`, never a prop the dialog
 * itself exposes, since it has none: the whole point is that any socket, anywhere in the app,
 * can put the dialog up.
 */
const SocketStatusScreen: FC = () => {
  const context = useContext()

  return <div id="socket-status">
    socket-status-screen
    <button id="report-lost" onClick={() => context.socketStatus().report(HARNESS_SOCKET_ID, 'lost')}>
      lose connection
    </button>
    <button id="release-lost" onClick={() => context.socketStatus().release(HARNESS_SOCKET_ID)}>
      restore connection
    </button>
  </div>
}

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
base.security = {
  unsecure: true,
  auth: {
    login: {
      // Confirmation required, which is the case that matters: a method must be blocked until it
      // is given, and blocking must SAY so rather than swallow the click.
      terms: {
        required: true, terms: 'https://example.test/terms', privacy: 'https://example.test/privacy',
        ...(extendedTerms ? {
          billing: { href: 'https://example.test/billing', revisedAt: '2026-01-01' },
          product: { name: 'Harness', href: 'https://example.test/product' },
          documents: [
            { key: 'custom-a', href: 'https://example.test/custom-a', label: 'Custom A' },
            { key: 'custom-b', href: 'https://example.test/custom-b', label: 'Custom B' },
          ],
          showRevision: true,
        } : {}),
      },
      credit: { poweredBy: true, product: 'Harness', organization: 'Acme' },
    },
  },
}
// Every other screen in this harness stays unaffected: nothing ever reports into the status
// service unless `#report-lost` is clicked, so the flag being on by default costs nothing. A
// test that needs the OFF case loads `?reloadDialog=0` — one harness process, both branches.
const reloadDialogEnabled = new URLSearchParams(window.location.search).get('reloadDialog') !== '0'
;(base as { socket?: { reloadDialog?: boolean } }).socket = { reloadDialog: reloadDialogEnabled }

// `ready` stays false: the Router compiles the entrypoint tree into routes ONLY while the
// context is un-initialized, so a pre-readied context renders a blank page.
const cfg = config(SERVICE, base as never)
const context = makeContext(cfg as never)
context.serviceRoute(SERVICE, true)
context.serviceRoute(API, true)
if (consentMode === 'menu') {
  appendConsentWidgetService(context as never)
}

ensureLoginService(context as never).registerMethodSource({
  alias: 'harness',
  list: () => [
    method('primary', { emphasis: 'primary', icon: 'google', label: 'Continue with Google' }),
    // A method that finishes without moving the document — the shape of a relying party that
    // could not build an authorization URL. The screen must SAY so; silence reads as a dead
    // button, which is exactly the bug this pins.
    method('secondary', {
      order: 20, label: 'Sign in with a key',
      start: async () => { started.push('secondary'); return LoginOutcome.Passed },
    }),
    method('operator', { order: 900, restricted: true, label: 'Secret key' }),
  ],
})

const protocols = {
  base: openProtocol(route(BASE, '/', frontend())),
  home: openProtocol(route(HOME, '/', frontend({ default: true, parent: BASE }))),
  dash: openProtocol(route(alias.dash, '/dash', frontend({ parent: BASE }))),
  reports: openProtocol(route(alias.reports, '/reports', frontend({ parent: BASE }))),
  reportsIndex: openProtocol(route(alias.reportsIndex, '/', frontend({ default: true, parent: alias.reports }))),
  reportDetail: openProtocol(route(alias.reportDetail, '/detail', frontend({ parent: alias.reports }))),
  prefs: openProtocol(route(alias.prefs, '/prefs', frontend({ parent: BASE }))),
  login: openProtocol(route(alias.login, '/login', frontend({ parent: BASE }))),
  socket: openProtocol(route(alias.socket, '/socket', frontend({ parent: BASE }))),
}

const entrypoints = [
  // The framework's own entrypoints come first — the api-config middleware the panel context
  // registers resolves one of them during init, and without them init throws before any route
  // is compiled.
  ...baseEntrypoints,
  bindScreen(protocols.base, handler(Layout)),
  bindScreen(protocols.home, handler(screen('home', 'home-screen'))),
  bindScreen(protocols.dash, handler(screen('dash', 'dash-screen'))),
  // A screen that has children needs a `default: true` child of its own — without one its own
  // path matches nothing and the page renders blank.
  bindScreen(protocols.reports, handler(ReportsGroup)),
  bindScreen(protocols.reportsIndex, handler(ReportsIndex)),
  bindScreen(protocols.reportDetail, handler(screen('detail', 'detail-screen'))),
  bindScreen(protocols.prefs, handler(PrefsScreen)),
  bindScreen(protocols.login, handler(LoginHarness)),
  bindScreen(protocols.socket, handler(SocketStatusScreen)),
]

context.registerEntrypoints(entrypoints)

// The consent dialog is a sibling of the Router, as in an application — and only on the consent
// branches, since its first-visit overlay covers the page every other test clicks through.
createRoot(document.getElementById('root')!).render(<PanelApp context={context as never}>
  {consentMode != null && <PanelCookieConsent policyHref="/cookies" />}
</PanelApp>)
