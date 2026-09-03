---
name: testing-unit
description: Category-A unit tests for OwlMeans Common packages — no mocks, real sibling-package imports, services/components/helpers focus. Auto-invoked when writing tests in non-auth, non-integration, non-UI packages.
---

# Unit Tests — Category A (no mocks)

**Install:** `"@owlmeans/test": "^0.1.18-rc.7"` in `devDependencies`

Apply this skill when adding tests to packages in category A (see `testing-overview`). The list includes core abstractions (`context`, `config`, `error`, `entrypoint`, `route`, `resource`, …) and platform-agnostic services (`api`, `state`, `flow`, `i18n`, `client-flow`, `client-socket`, `server-route`, `server-context`, `web-router`, `web-db`, …).

## Layout

```
<your-package>/
├── src/...
├── tests/
│   ├── context.ts          # one real context, shared across specs
│   ├── <area>.spec.ts      # *.spec.ts only
│   └── fixtures/           # JSON fixtures, optional
```

## `tests/context.ts` — single source of truth

Build a real context exactly the way the package's `SKILL.md` documents downstream apps building it. No mocks. Sibling packages are imported normally.

```ts
import { AppType, makeBasicContext } from '@owlmeans/context'
import type { BasicConfig, BasicContext } from '@owlmeans/context'

export const makeTestCtx = (overrides: Partial<BasicConfig> = {}): BasicContext<BasicConfig> =>
  makeBasicContext({
    ready: false,
    service: '<pkg>-tests',
    type: AppType.Backend,
    services: {},
    ...overrides,
  })
```

`BasicConfig` is `{ ready, service, type }` plus the optional `alias`, `services`, `debug` and config records — a fixture that names anything else is describing a config field that does not exist.

One factory builds the context and the `append*` mixins the package documents go straight after it, in the same helper — the same shape a real app's `makeContext` has. Nothing is stored for re-creation and no spec builds a second context to register something late.

Specs import `makeTestCtx()` (or whatever helper fits) and never call `makeBasicContext` directly. This keeps the wiring centralised so a context-shape change only touches one file per package.

## Spec shape

```ts
import { describe, expect, test } from 'bun:test'
import { makeTestCtx } from './context.js'

describe('<package> — <area>', () => {
  test('does the thing the SKILL.md documents', () => {
    const ctx = makeTestCtx()
    /* exercise the real public API */
  })
})
```

Use `bun:test`'s `describe`/`test`/`expect`. No `vi.mock`, no `jest.mock`, no test doubles.

## Rules

- **Max 3-4 tests per method/function.** Cover the happy path, the documented edge cases, and at most one invariant.
- **Test services, components, helpers, broad domain models.** Test domain models only when the model has functionality the service facade does not expose.
- **Skip utils** (`src/utils/*`) — they are internal.
- **Skip types** (`src/types.ts`).
- **Cover `SKILL.md` and `README.md` first.** Tests are executable docs of the documented use cases.
- **No mocks.** If a test seems to need one, the package likely belongs in category C (integration) or the test is asking the wrong question.
- Cross-package imports are normal `import` statements; the workspace links resolve them.

## Wiring `bun test`

Per-package `package.json`:

```json
"scripts": {
  "test": "bun test ./tests"
}
```

`bun:test` is built-in — no devDeps to add. The root `bun run test` script runs every package's `test` script via workspace filters.

## When auth shows up

If a category-A package starts to need an authenticated identity to exercise a behaviour, that behaviour belongs in a different package — the auth-aware sibling. Don't reach for `@owlmeans/test-auth` here. Move the test to category B (and possibly the implementation) instead of dragging an auth dep into a low-layer package.
