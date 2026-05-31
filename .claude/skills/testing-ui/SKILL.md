---
name: testing-ui
description: Category-D component-level acceptance tests for OwlMeans Common UI packages (web-panel, web-client, client-panel, client-wl, web-flow, web-wl, client, client-i18n) and new shadcn UI + Tailwind v4 packages. Run under bun test, drive a real chromium via Playwright as a library — not the Playwright runner. Auto-invoked when writing tests in those packages.
---

# UI Acceptance Tests — Category D (bun test + Playwright as a library)

Category D applies to packages that ship rendered React UI: `client`, `client-i18n`, `client-panel`, `client-wl`, `web-client`, `web-flow`, `web-panel`, `web-wl`. Tests are **component-level acceptance** — they mount one component in a real browser and assert against rendered DOM. They are **not** end-to-end tests (no router-deep navigation, no live backend).

The runner is **`bun test`** — same as categories A/B/C — kept consistent so contributors only learn one harness. Playwright is consumed as a **library** (`playwright` package, not `@playwright/test`). The `playwright` library exposes `chromium`, `firefox`, `webkit` browser launchers; specs drive them directly from inside `bun:test` blocks.

Service-only "client-*" packages (`client-flow`, `client-socket`, `web-router`, `web-db`) belong to category A — they have no rendered UI.

Auth-related UI packages (`web-oidc-rp`, `web-oidc-provider`, `client-auth`, `client-payment`) belong to category B and use `bun test` + `@owlmeans/test-auth`, not the chromium harness.

## Layout

```
packages/<pkg>/
├── src/...
└── tests/
    ├── harness/              # per-package: components registry + mount config
    │   ├── index.html        # copy of @owlmeans/test-ui/harness/index.html
    │   └── mount.tsx         # registers components, reads ?component= and ?props=
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
| `mountComponent({ url, component?, props? })` | Open a fresh context, navigate to the harness URL with `?component=` and `?props=` set, return `{ page, close }`. |
| Re-exports: `Browser`, `BrowserContext`, `Page`, `Locator` | Playwright types — no direct `playwright` import needed. |

## Spec shape

```ts
import { afterAll, describe, expect, test } from 'bun:test'
import { closeBrowser, mountComponent } from '@owlmeans/test-ui'
import { HARNESS_URL } from './context.js'

afterAll(async () => { await closeBrowser() })

describe('<package> — <component>', () => {
  test('renders the SKILL.md happy-path example', async () => {
    const { page, close } = await mountComponent({
      url: HARNESS_URL,
      component: 'LoginForm',
      props: { redirect: '/' },
    })
    try {
      expect(await page.locator('h1').textContent()).toBe('Sign in')
      expect(await page.getByRole('button', { name: /sign in/i }).isVisible()).toBe(true)
    } finally {
      await close()
    }
  })
})
```

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
    server: { port: 0 },
  })
  await server.listen()
  const local = server.resolvedUrls?.local?.[0]
  if (local == null) throw new Error('vite did not expose a local URL')
  url = local
  return url
}

export const HARNESS_URL = await getHarnessUrl()
```

The per-package `tests/harness/mount.tsx` reads `?component=<name>` and `?props=<json>`, dynamic-imports the component from the consumer's `src/`, and renders it via `react-dom/client` inside `<div id="root">`. Each consuming UI package wires its own providers (MUI theme for legacy packages, or Tailwind CSS + `@` alias for shadcn packages; plus i18n, router) the way the real app does — that's why mount.tsx is per-package, not in `@owlmeans/test-ui`.

## Smoke-only baseline

For a package that only needs to prove the bun-test + chromium pipeline works (e.g. `web-panel`'s pilot), skip the Vite harness and serve a `data:text/html` URL inline:

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
  })
})
```

## Wiring `bun test`

Per-package `package.json`:

```json
"scripts": {
  "test": "bun test ./tests"
}
```

Same line as categories A/B/C. No `playwright.config.ts`, no `bun x playwright test`.

## Tailwind + shadcn packages

For shadcn-based OwlMeans packages the `tests/context.ts` Vite config needs two additions beyond the standard setup:

```ts
import tailwindcss from '@tailwindcss/vite'
import { resolve } from 'node:path'

const server = await createServer({
  configFile: false,
  root: resolve(here, './harness'),
  plugins: [react(), tailwindcss()],               // add Tailwind v4 Vite plugin
  resolve: {
    alias: { '@': resolve(here, '../src/@') },     // resolve @/ to the package's local copy
  },
  server: { port: 0 },
})
```

`tests/harness/mount.tsx` imports the package CSS so components render with Tailwind styles:

```tsx
import '../../src/@/globals.css'
// ... dynamic component mounting ...
```

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
- **Always `close()` the page and `closeBrowser()` in `afterAll`.** A leaked context blocks the bun process from exiting.
- **Chromium only by default.** Add `firefox` or `webkit` per package only when the feature has documented cross-browser concerns — call `chromium.launch` / `firefox.launch` explicitly in that case.
