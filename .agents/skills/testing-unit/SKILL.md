---
name: testing-unit
description: Category-A unit tests for OwlMeans Common packages — no mocks, real sibling-package imports, services/components/helpers focus. Auto-invoked when writing tests in non-auth, non-integration, non-UI packages.
---

# Unit Tests — Category A (no mocks)

**Install:** `"@owlmeans/test": "^0.1.18-rc.7"` in `devDependencies`

Apply this skill when adding tests to packages in category A (see `testing-overview`). The list includes core abstractions (`context`, `config`, `error`, `entrypoint`, `route`, `resource`, …) and platform-agnostic services (`api`, `state`, `flow`, `i18n`, `client-flow`, `client-socket`, `client-job`, `server-route`, `server-context`, `web-db`, …).

`@owlmeans/test` is also the base of the other three harness packages, so its exports below are
available in every category.

## Helpers from `@owlmeans/test`

| Helper | Purpose |
|---|---|
| `loadEnv({ force?, file? })` | Read a `.env` into `process.env`, once per process. Never overwrites a variable already set to a non-empty value; a missing file is not an error. The root is found by walking up for a `bun.lock`, or for a `package.json` sitting beside a directory named `packages` — a workspace shaped any other way must pass `file` explicitly. |
| `hasEnv(key)` | `loadEnv()`, then true when the variable is set and non-empty. |
| `requireEnv(keys)` | `EnvGate` — `{ ok: true }` when every key is populated, otherwise `{ skip: true, reason }` naming the missing ones. |
| `makeGates(spec)` | Frozen `{ name: EnvGate }` built from `{ name: [envKey, …] }`. One call in `tests/context.ts` is the whole suite's availability map. |
| `isSkip(gate)` | Type guard narrowing an `EnvGate` to the skip branch, so `gate.reason` is readable. |
| `loadFixture<T>(relPath)` | Parse a JSON fixture from the package's own `tests/` directory — `bun test` sets `process.cwd()` to the package root, so the path is `tests/`-relative. |
| Types: `EnvGate`, `EnvOk`, `EnvSkip`, `GateSpec`, `Gates<S>` | The gate shapes, for typing a suite's exported map. |

### Gating a spec

A category-A package needs nothing external, so most specs never gate. When one does — a live
provider, an optional local binary — declare every gate in `tests/context.ts` and let each spec
choose its own `test` at module scope:

```ts
// tests/context.ts
import { makeGates } from '@owlmeans/test'

export const gates = makeGates({
  openrouter: ['OPENROUTER_SECRET'],
  anthropic: ['ANTHROPIC_SECRET'],
})
```

```ts
// tests/<area>.spec.ts
import { test } from 'bun:test'
import { isSkip } from '@owlmeans/test'
import { gates } from './context.js'

const gate = gates.openrouter
const it = isSkip(gate) ? test.skip : test
// `isSkip(gate) ? gate.reason : ''` names the missing variables in the skip title.
```

Bun decides `test` vs `test.skip` **synchronously**, so the decision has to be a value already in
hand — never an `await` inside the suite. An empty variable is a printed skip, never a failure.

## Layout

```
<your-package>/
├── src/...
├── tests/
│   ├── context.ts          # one real context, shared across specs
│   ├── <area>.spec.ts      # *.spec.ts only
│   └── fixtures/           # JSON fixtures, read with loadFixture('fixtures/<name>.json')
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

`bun:test` is built-in, so `@types/bun` is the only devDep a plain category-A package needs; add
`@owlmeans/test` when a spec actually uses a helper above. Add `"./tests/**/*"` to the package's
`tsconfig.json` `exclude` so `tsc -b` never compiles specs into `build/`. The root `bun run test`
script runs every package's `test` script via workspace filters.

## When auth shows up

If a category-A package starts to need an authenticated identity to exercise a behaviour, that behaviour belongs in a different package — the auth-aware sibling. Don't reach for `@owlmeans/test-auth` here. Move the test to category B (and possibly the implementation) instead of dragging an auth dep into a low-layer package.
