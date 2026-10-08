# @owlmeans/test

Foundation helpers shared by the OwlMeans test packages and individual package test suites: the
repo-root `.env` loader, environment gates that let a spec self-skip with a printed reason, and a
JSON fixture loader. Every package's `tests/` uses it directly or through one of the harness
packages built on it. It holds no auth mocks, no service gates and no browser driver — those are
`@owlmeans/test-auth` (category B), `@owlmeans/test-integration` (category C) and
`@owlmeans/test-ui` (category D). Tests run on `bun:test`; this package adds no runner. The
package's skills are `testing-overview` (which category a package is in) and `testing-unit`.

## Installation

```bash
bun add -d @owlmeans/test@^0.1.18-rc.35
```

## Concepts

- **Env file** — `<monorepo-root>/.env`, found by walking up from `process.cwd()` to a directory
  holding `bun.lock`, or a `package.json` beside a `packages/` directory. Merged into `process.env`
  once per process; a variable already set to a non-empty value wins. A missing file is not an error.
- **Gate** — `EnvGate`: `{ ok: true }` when every required variable is set, otherwise
  `{ skip: true, reason }` naming the missing ones.
- **Gate map** — `makeGates({ name: [envKey, …] })`, a frozen record built once in a suite's
  `tests/context.ts`; specs read it to choose `test` or `test.skip`.
- **Fixture** — a JSON file under the consuming package's `tests/`, read relative to it.

## Usage

### Declare the suite's gates

```typescript
// tests/context.ts
import { makeGates } from '@owlmeans/test'

export const gates = makeGates({
  openrouter: ['OPENROUTER_SECRET'],
  anthropic: ['ANTHROPIC_SECRET'],
})
```

### Self-skip a spec

Bun picks `test` or `test.skip` synchronously, so decide from the gate at module scope:

```typescript
// tests/inference.spec.ts
import { describe, expect, test } from 'bun:test'
import { isSkip } from '@owlmeans/test'
import { gates } from './context.js'

const gate = gates.openrouter
const it = isSkip(gate) ? test.skip : test

describe('llm — openrouter', () => {
  it(`answers a prompt${isSkip(gate) ? ` (${gate.reason})` : ''}`, async () => {
    /* exercise the real provider */
  })
})
```

### Read the environment directly

```typescript
import { envHelper } from '@owlmeans/test'

envHelper.loadEnv()                                  // idempotent; `{ force: true }` re-reads
envHelper.loadEnv({ file: '/path/to/other/.env' })   // a workspace shaped differently

if (envHelper.hasEnv('MONGO_URL')) {
  /* provision the optional service in tests/context.ts */
}

const gate = envHelper.requireEnv(['SMTP_HOST', 'SMTP_PORT'])
```

### Load a fixture

```typescript
import { loadFixture } from '@owlmeans/test'

const profile = loadFixture<ProfileRecord>('fixtures/profile.json') // <package>/tests/fixtures/profile.json
```

## API

| Symbol | Kind | Purpose |
|---|---|---|
| `envHelper` (`createEnvHelper()`) | helper | The env loader and gates below |
| `envHelper.loadEnv(opts?)` | member | Locate `<monorepo-root>/.env`, parse it, merge into `process.env` (idempotent; no-op for variables Bun already loaded via `--env-file`) |
| `envHelper.hasEnv(key)` | member | `loadEnv()`, then whether the variable is set and non-empty |
| `envHelper.requireEnv(keys)` | member | `{ ok: true }` or `{ skip: true, reason }` so callers can `test.skip(...)` when an integration variable is missing |
| `makeGates(spec)` | function | Frozen record of `{ <name>: EnvGate }` — one source of truth in `tests/context.ts` |
| `isSkip(gate)` | function | Type guard narrowing an `EnvGate` to `{ skip: true, reason }` |
| `loadFixture<T>(relPath)` | function | JSON fixture loader rooted at the consuming package's `tests/` |

| Type | Purpose |
|---|---|
| `EnvGate`, `EnvOk`, `EnvSkip` | Gate outcome union and its branches |
| `GateSpec`, `Gates<S>` | `{ name: string[] }` input and the frozen gate map it produces |
| `LoadEnvOptions` | `{ force?, file? }` |
| `EnvHelper` | The helper's interface |

## Test layout

Tests are located at `packages/<pkg>/tests/`, named `*.spec.ts`, and run with `bun test ./tests`
from the package root. List `"./tests/**/*"` in the package `tsconfig.json` `exclude` so `tsc -b`
never compiles specs. One real context per package lives in `tests/context.ts`; specs import its
helper instead of building contexts themselves.

## Common pitfalls

- Awaiting anything before choosing `test` / `test.skip` — the choice must be a value already in hand.
- A missing variable must skip, never fail; do not throw from a gate.
- `loadFixture` resolves against `process.cwd()`, which `bun test` sets to the package root; running
  specs from another directory breaks the path.
- A workspace without `bun.lock` and without a `packages/` directory beside its `package.json` is not
  found by `loadEnv` — pass `file` explicitly.
- Do not add mocks here; auth mocks belong in `@owlmeans/test-auth`, and anything else is an
  integration test.

## Related packages

- [`@owlmeans/test-auth`](../test-auth) — auth/authz mocks for category-B unit tests
- [`@owlmeans/test-integration`](../test-integration) — service gates, namespaces and cleanup for category-C tests
- [`@owlmeans/test-ui`](../test-ui) — Playwright-driven component acceptance for category D
- [`@owlmeans/context`](../context) — the real context a suite's `tests/context.ts` builds

<!-- owlmeans:agent-guidance:start -->
## Agent guidance

This package ships embedded agent skills under `agent-meta/`. After installing your
`@owlmeans/*` packages, run the OwlMeans agent-skills installer to place them into
your project's skill store (`.agents/skills/`):

```sh
npx @owlmeans/agent-skills@^0.1.18-rc.49
```

The embedded files are version-matched to this package release. Do not edit them
directly — they are regenerated on each publish. To contribute guidance edits,
open a PR against the source monorepo.
<!-- owlmeans:agent-guidance:end -->
