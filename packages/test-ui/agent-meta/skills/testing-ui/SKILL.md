---
name: testing-ui
description: Category-D component-level acceptance tests for OwlMeans Common UI packages (web-panel, web-client, web-consent, web-router, mui-panel, client-panel, client-wl, web-flow, web-wl, client, client-i18n) and shadcn UI + Tailwind v4 packages. Run under bun test, drive a real chromium via Playwright as a library — not the Playwright runner. Auto-invoked when writing tests in those packages.
---
<!-- AUTO-GENERATED — do not edit. Regenerate via sync-agent-meta. -->

# UI Acceptance Tests — Category D (bun test + Playwright as a library)

**Install:** `"@owlmeans/test-ui": "^0.1.18-rc.15"` in `devDependencies`

`@owlmeans/test-ui` depends on `playwright`, so the browser library arrives with it; add
`playwright` to `devDependencies` as well when a spec imports a launcher itself. The Vite harness
below is the consuming package's own, so a package that builds one also declares `vite` and
`@vitejs/plugin-react`, plus `@tailwindcss/vite` and `tailwindcss` for a shadcn package. A
smoke-only package that serves a `data:` URL needs none of those.

Category D applies to packages that ship a rendered surface: `client`, `client-i18n`, `client-panel`, `client-wl`, `mui-panel`, `web-client`, `web-consent`, `web-flow`, `web-panel`, `web-router`, `web-wl`. Tests are **component-level acceptance** — they mount one component in a real browser and assert against rendered DOM. They are **not** end-to-end tests (no live backend).

The runner is **`bun test`** — same as categories A/B/C — kept consistent so contributors only learn one harness. Playwright is consumed as a **library** (`playwright` package, not `@playwright/test`). The `playwright` library exposes `chromium`, `firefox`, `webkit` browser launchers; specs drive them directly from inside `bun:test` blocks.

A client-side package that ships no component belongs to category A, however browser-flavoured its
name — `client-config`, `client-context`, `client-entrypoint`, `client-flow`, `client-job`,
`client-resource`, `client-route`, `client-socket`, `web-db`, `web-gtm` and
`web-router-react-router` are all services, models and adapters. `@owlmeans/web-router` is the one
that is not: it drives the real History API, so its routing behaviour is only observable in a
browser and its specs mount a full harness here.

Auth-related UI packages (`web-oidc-rp`, `web-oidc-provider`, `client-auth`, `client-payment`) belong to category B and use `bun test` + `@owlmeans/test-auth`, not the chromium harness.

## Layout

```
<your-package>/
├── src/...
└── tests/
    ├── harness/              # per-package: the app the specs drive
    │   ├── index.html        # copy of @owlmeans/test-ui/harness/index.html
    │   └── mount.tsx         # boots the package's real surface into #root
    ├── context.ts            # one place that boots the harness server, exports HARNESS_URL
    └── <area>.spec.ts        # *.spec.ts only
```

## One-time setup (per developer machine)

```sh
bunx playwright install chromium
```

Downloads the chromium binary the `playwright` library drives. CI installs it in a workflow step.

## Helpers from `@owlmeans/test-ui`

| Helper | Purpose |
|---|---|
| `launchBrowser(opts?)` | Return the shared chromium for this `bun test` process. Idempotent. |
| `closeBrowser()` | Tear it down. Call from `afterAll`. |
| `withPage(fn)` | Lease a fresh context+page for the duration of `fn`, dispose context on completion. |
| `mountComponent(opts)` | Open a fresh context, navigate to `opts.url`, return `Mounted` = `{ page, close }`. `component` and `props`, when given, are appended as `?component=` and `?props=`; omit them when the harness mounts a fixed root, which is what every harness here does. |
| `MountOptions` | `{ url, component?, props?, waitUntil?, timeout? }` — `waitUntil` defaults to `domcontentloaded`, see below. |
| `acceptConsent(page, { timeout? })` | Wait up to `timeout` (default 5s) for `[data-consent-dialog]`, accept all, wait for it to detach. Returns whether it answered one — and costs that whole wait when it does not. |
| `saveScreenshot(page, dir, name)` | Full-page PNG to `<dir>/<name>.png`, creating `dir`. Returns the absolute path. |
| Re-exports: `Browser`, `BrowserContext`, `Page`, `Locator` | Playwright types — no direct `playwright` import needed. |

### Authenticated specs

`@owlmeans/test-ui` also carries the supervisor-login helpers, so a spec can reach a screen that
sits behind auth without hand-rolling a token:

| Helper | Purpose |
|---|---|
| `pregenerateAuthToken(opts)` | Mint an `ED25519-BASIC-TOKEN …` bearer offline from a trusted private key — no browser, no round trip. Options: `{ userId, pk, scopes?, role?, entityId?, profileId?, source? }`. |
| `authenticateViaSupervisorApi(opts)` | Drive the live PK supervisor flow over the backend API (init → sign → authenticate → dispatch), registering the user on first use. Options: `{ apiBaseUrl, userId, pk, paths?, fetchImpl? }`. |
| `loginViaDispatcher(page, baseUrl, token, opts?)` | Inject a bearer through the standard `/dispatcher?token=…` route and wait for the app to navigate away. |
| `loginViaSupervisorForm(page, opts)` | Drive the real login form end-to-end — navigate, answer consent, fill user id + key, submit, wait for the landing. Options: `{ baseUrl, userId, pk, path?, expectPath?, timeout?, waitUntil?, consent?, screenshotDir? }`. |

These need a project whose backend trusts the private key they sign with, so they belong to specs
that run against a real app rather than a mounted component. See `[[supervisor-auth]]` for the
server and web wiring they assume.

## Spec shape

```ts
import { afterAll, describe, expect, test } from 'bun:test'
import { closeBrowser, mountComponent } from '@owlmeans/test-ui'
import { HARNESS_URL } from './context.js'

// Browser work does not fit bun's 5s default: a cold harness compiles the app on first request,
// and the first test to run pays for the Vite boot happening in the same process.
const TIMEOUT = 30_000

afterAll(async () => { await closeBrowser() })

// The harness is a real app, so a spec picks its case by opening a path on it.
const open = async (path: string) =>
  mountComponent({ url: `${HARNESS_URL.replace(/\/$/, '')}${path}` })

describe('<package> — <component>', () => {
  test('renders the SKILL.md happy-path example', async () => {
    const { page, close } = await open('/login')
    try {
      expect(await page.locator('h1').textContent()).toBe('Sign in')
      expect(await page.getByRole('button', { name: /sign in/i }).isVisible()).toBe(true)
    } finally {
      await close()
    }
  }, TIMEOUT)
})
```

**Every chromium test carries its own timeout** — the third argument to `test`. Bun's default is
5s, which a cold harness blows through before the first assertion, and `bunfig.toml`'s
`[test] timeout` does not raise it (bun 1.4.0 reads the section but ignores that key). 30s covers a
mounted component against a Vite harness; a suite that drives a login form or a consent gate needs
60s. `bun test --timeout=<ms>` raises a whole run from the command line.

Use `bun:test`'s `expect` against awaited Playwright DOM queries (`textContent()`, `isVisible()`, `getAttribute()`). Don't import `expect` from `@playwright/test` — that would pull in the full runner and create two parallel test toolchains.

## Per-package `tests/context.ts`

The harness needs a real HTTP server because module-style React components can't run from a `data:` URL. Boot it once per `bun test` process:

```ts
import { createServer } from 'vite'
import react from '@vitejs/plugin-react'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'

const here = dirname(fileURLToPath(import.meta.url))

let url: string | null = null

export const getHarnessUrl = async (): Promise<string> => {
  if (url != null) return url
  const server = await createServer({
    configFile: false,
    root: resolve(here, './harness'),
    plugins: [react()],
    // Pre-bundle the third-party runtime deps the mounted components pull in. A dependency
    // discovered mid-transform makes Vite re-optimize and reload the page underneath the
    // navigation, and the first `goto` of a cold run pays for that as a timeout.
    optimizeDeps: { include: ['<runtime dep the components import>'] },
    server: { port: 0 },
    logLevel: 'warn',
  })
  await server.listen()
  const local = server.resolvedUrls?.local?.[0]
  if (local == null) throw new Error('vite did not expose a local URL')
  url = local
  return url
}

export const HARNESS_URL = await getHarnessUrl()
```

List in `optimizeDeps.include` every non-`@owlmeans` runtime package the components reach — the
toast library, the icon set, a form library. It is the difference between a cold run that passes
and one that times out on its first navigation for no visible reason.

The per-package `tests/harness/mount.tsx` statically imports what the package ships and renders it
via `react-dom/client` into the `<div id="root">` that `index.html` provides. It builds a real
application — `@owlmeans/web-panel` wires a context, the framework entrypoints and a `NavLayout`
over its screens; `@owlmeans/web-router` compiles a route tree behind the browser router plugin —
so a spec selects its case by the path it opens rather than by naming a component. A harness that
needs variants of one surface reads its own query string for them, the way `@owlmeans/web-consent`
picks a locale, a category set or the policy view. `mountComponent`'s `component` and `props`
options are the ready-made form of that convention, for a harness written to read them.
Each consuming UI package wires its own providers (a theme provider for the `mui-*` packages, or Tailwind CSS + the `@` alias for shadcn packages; plus i18n, router) the way the real app does — that's why mount.tsx is per-package, not in `@owlmeans/test-ui`.

## Smoke-only baseline

For a package that only needs to prove the bun-test + chromium pipeline works, skip the Vite harness and serve a `data:text/html` URL inline. Use this for a first spec in a package that has no harness yet — `web-panel` keeps one alongside a full Vite + chromium harness (`tests/harness/` plus a `tests/context.ts` wiring the Tailwind plugin, the `@` alias and a react dedupe), and that harness is the reference to copy for any package rendering real components:

```ts
import { afterAll, describe, expect, test } from 'bun:test'
import { closeBrowser, mountComponent } from '@owlmeans/test-ui'

const harness = `data:text/html,${encodeURIComponent('<h1 id="t">hello</h1>')}`

afterAll(async () => { await closeBrowser() })

describe('chromium smoke', () => {
  test('reads a heading from a data: URL', async () => {
    const { page, close } = await mountComponent({ url: harness })
    try { expect(await page.locator('#t').textContent()).toBe('hello') }
    finally { await close() }
  }, 30_000)
})
```

A smoke spec needs the same explicit timeout as any other: bun runs every spec file of a package
in one process, so the first test to start pays for whatever harness the sibling files boot.

## Wiring `bun test`

Per-package `package.json`:

```json
"scripts": {
  "test": "bun test ./tests"
}
```

Same line as categories A/B/C. No `playwright.config.ts`, no `bun x playwright test`.

## Tailwind + shadcn packages

For shadcn-based OwlMeans packages the `tests/context.ts` Vite config needs three additions beyond the standard setup:

```ts
import tailwindcss from '@tailwindcss/vite'
import { resolve } from 'node:path'

const server = await createServer({
  configFile: false,
  root: resolve(here, './harness'),
  plugins: [react(), tailwindcss()],               // add Tailwind v4 Vite plugin
  resolve: {
    alias: { '@': resolve(here, '../src/@') },     // resolve @/ to the package's local copy
    dedupe: ['react', 'react-dom'],                // one React across the workspace links
  },
  optimizeDeps: { include: ['sonner'] },           // pre-bundle, never discover mid-navigation
  server: { port: 0 },
  logLevel: 'warn',
})
```

`dedupe` is not optional in a workspace: symlinked sibling packages otherwise resolve their own React copy and every hook throws.

`tests/harness/mount.tsx` imports the package CSS so components render with Tailwind styles:

```tsx
import '../../src/@/globals.css'
// ... dynamic component mounting ...
```

### Testing routed UI (navigation, layouts)

A spec that exercises navigation opens a **path** on the harness origin instead of a `?component=` query, and `mount.tsx` builds a real context with real entrypoints — the OwlMeans router drives the History API, so nothing about the routing may be faked. Two shapes the harness must get right, because a spec that trips them fails obscurely:

- **Leave the context un-initialized** (`ready` false). The Router compiles the entrypoint tree into routes only while the context is un-initialized; a pre-readied context renders a blank page.
- **Give every entrypoint that has children one child declared `default: true`**, or the parent's own path renders blank.

Spread the framework's own `entrypoints` (exported by the panel package) into the harness list: the panel context registers the api-config middleware, which resolves one of them during init and throws before any route is compiled if they are missing.

Shadcn components are plain React — no theme provider needed. Assert via `getByRole` / text as usual. To verify that Tailwind classes took visual effect, read computed styles:

```ts
const bg = await page.locator('button').evaluate(el =>
  window.getComputedStyle(el).backgroundColor
)
expect(bg).not.toBe('')
```

See `[[shadcn-web]]` for the full `@` alias contract and `tests/context.ts` pattern.

## Rules

- **No mocks.** Render the real component with real client-context wiring (state, i18n, router) the way the app does. For network calls, use Playwright's `page.route(...)` to a static fixture — never point at a live backend.
- **Cover SKILL.md and README.md cases first.** Each component the package documents gets at least one acceptance spec for its happy path.
- **Max 3-4 tests per component**: render, primary interaction, one edge case.
- **Always pass a timeout as `test`'s third argument.** 30s for a mounted component, 60s for a
  suite that drives a login or a consent gate. Bun's 5s default is for in-process work, and
  `bunfig.toml`'s `[test] timeout` is not a way to change it.
- **Always `close()` the page and `closeBrowser()` in `afterAll`.** A leaked context blocks the bun process from exiting.
- **Chromium only by default.** Add `firefox` or `webkit` per package only when the feature has documented cross-browser concerns — call `chromium.launch` / `firefox.launch` explicitly in that case.

## `mountComponent` waits for `domcontentloaded`, not `load`

Playwright's own default is `load`, and it is wrong for any page that is a real application:
`load` waits for EVERY subresource, so one analytics beacon, long-poll or third-party pixel that
never settles holds the navigation open until it times out — with the page fully rendered and
working the whole time. The failure reads as "the site is down", and the first instinct is to go
looking at the server.

`mountComponent` therefore navigates with `domcontentloaded` and lets the spec wait for the
selector it actually needs. That wait IS the assertion; the load event never was. Pass
`waitUntil` explicitly for the rare case that wants otherwise.

The rule is not `mountComponent`'s alone — **every** navigation helper here follows it, including
`loginViaSupervisorForm` and `loginViaDispatcher`. A helper that navigates on playwright's default
turns "someone added a tag manager" into "the whole login-driven suite times out", with the browser
showing a working login form the entire time. Any new helper that calls `page.goto` passes
`domcontentloaded` and takes a `waitUntil` override.

`saveScreenshot(page, dir, name)` is the fastest way to see what the browser actually had on
screen when an assertion timed out; `loginViaSupervisorForm` takes a `screenshotDir` that captures
the filled form just before submit.

## The consent dialog blocks the login form, and the failure blames the button

An OwlMeans app asks for cookie consent **before** it will start an authentication flow, and the
dialog is a modal with no dismissal — a decision is what the gate is waiting for. Until it is
answered the overlay intercepts pointer events, so a login form renders, resolves, reports itself
`visible, enabled and stable`, and still cannot be clicked. Playwright retries for the full timeout
and then reports `click: Timeout … waiting for getByTestId('supervisor-submit')`, naming the
button. Nothing is wrong with the button; read the `subtree intercepts pointer events` line, which
names `[data-consent-dialog]`.

`loginViaSupervisorForm` therefore calls `acceptConsent(page)` after navigating. `acceptConsent` is
exported for specs that drive their own login: it waits for `[data-consent-dialog]` to become
visible, clicks `[data-consent-accept-all]`, waits for the dialog to detach, and reports whether it
answered one. It accepts **all** categories deliberately — a spec asserting a narrower decision must
make that decision itself rather than inherit a silent minimum.

**The `false` return costs the full wait.** It is what the visibility wait rejects into, not a cheap
probe, so a page with no dialog pays the timeout — 5s by `acceptConsent`'s own default, but
`loginViaSupervisorForm` passes its `timeout` straight through and that defaults to `60_000`. On an
app that ships no consent widget the login helper therefore sits for a full minute before it fills
the first field, with nothing on screen to explain it. Drive such an app with `consent: 'ignore'`,
which skips the call entirely; that is also the switch a spec flips when it wants to answer the
dialog itself.
