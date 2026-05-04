# @owlmeans/test-ui

Playwright-as-a-library helpers for **bun-test**-driven component acceptance tests of OwlMeans UI packages (`web-panel`, `web-client`, `client-panel`, `client-wl`, `web-flow`, `web-wl`, `client`, `client-i18n`).

These are **not** end-to-end UI tests — they exercise individual components in a real browser, the same way unit tests in other categories exercise individual services. The runner is `bun test` (not `bun x playwright test`), keeping the test toolchain consistent across all four categories.

## Exports

- `launchBrowser(opts?)` — return the shared chromium instance for this `bun test` process. Idempotent.
- `closeBrowser()` — tear it down. Call from `afterAll`.
- `withPage(fn)` — convenience: lease a fresh context+page for the duration of `fn`, then dispose the context.
- `mountComponent({ url, component?, props? })` — opens a fresh context, navigates to a harness URL with the component / props encoded, returns `{ page, close }` so the spec can assert against `page.locator(...)` and dispose the context when done.
- `Browser`, `BrowserContext`, `Page`, `Locator` — re-exports of the Playwright types so consumers don't need a direct `playwright` import.

## Spec shape

```ts
import { afterAll, describe, expect, test } from 'bun:test'
import { closeBrowser, mountComponent } from '@owlmeans/test-ui'

afterAll(async () => { await closeBrowser() })

describe('LoginForm — acceptance', () => {
  test('renders the heading from the SKILL example', async () => {
    const { page, close } = await mountComponent({
      url: 'http://localhost:5173/',
      component: 'LoginForm',
      props: { redirect: '/' },
    })
    try {
      expect(await page.locator('h1').textContent()).toBe('Sign in')
    } finally {
      await close()
    }
  })
})
```

## Component harness

`harness/index.html` is a starter page (`<div id="root"></div>` + a `<script type="module" src="/mount.tsx"></script>`). Each consuming UI package serves it via Vite (or any bundler) inside a `beforeAll` hook, registers the components under test from a per-package `mount.tsx` that reads `?component=` and `?props=` from the URL, then mounts via `createRoot(...).render(...)`.

The wiring is per-package because the React/MUI/router providers each package needs differ; see the `testing-ui` skill for the recommended layout.

## One-time setup

```sh
bunx playwright install chromium
```

This downloads the Chromium binary used by the `playwright` library. CI installs it as a workflow step.
