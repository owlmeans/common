---
applyTo: "packages/{client,client-i18n,client-panel,client-wl,web-client,web-flow,web-panel,web-wl}/tests/**"
---

# Category D — Component Acceptance Tests (bun test + Playwright as a library)

- Tests in `packages/<pkg>/tests/*.spec.ts`. Use `bun:test` (`describe`, `test`, `expect`) — same as categories A/B/C.
- Playwright is consumed as a **library**: `import { launchBrowser, closeBrowser, mountComponent } from '@owlmeans/test-ui'`. Never `import` from `@playwright/test`.
- Mount one component at a time via `mountComponent({ url, component?, props? })`. Tests are component-level acceptance — not end-to-end.
- Always `await close()` the returned context and call `closeBrowser()` from `afterAll` — leaked contexts hang `bun test`.
- Use `bun:test`'s `expect` against awaited Playwright DOM queries: `expect(await page.locator('h1').textContent()).toBe('Sign in')`.
- Per-package harness (`tests/harness/index.html` + `mount.tsx`) is served by a Vite dev server booted once in `tests/context.ts`. For smoke-only specs a `data:text/html,...` URL is fine.
- One-time per machine: `bunx playwright install chromium`.
- No mocks. Render the real component with real client-context wiring. For network calls use `page.route(...)` to a static fixture — never a live backend.
- Cover `.github/instructions/<pkg>.instructions.md` and `README.md` cases first.
- Max 3-4 tests per component: render, primary interaction, one edge case.
- Per-package `package.json` script: `"test": "bun test ./tests"` — same line as categories A/B/C.

See `.claude/skills/testing-ui/SKILL.md` for the full pattern.
