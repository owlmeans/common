---
name: testing-integration
description: Category-C integration tests for OwlMeans Common packages that talk to external services (PostgreSQL, MongoDB, Redis, S3, Kubernetes). Env-gated, no mocks, per-suite namespaces, conditional context provisioning. Auto-invoked when writing tests in postgres*, mongo*, redis*, kluster, storage*, image-resource, server-api, server-app, queue.
---
<!-- AUTO-GENERATED — do not edit. Regenerate via sync-agent-meta. -->

# Integration Tests — Category C

**Install:** `"@owlmeans/test-integration": "^0.1.18-rc.8"` in `devDependencies`

Category C applies to packages that integrate with external services: `postgres`,
`postgres-resource`, `mongo`, `mongo-resource`, `redis`, `redis-resource`, `kluster`,
`storage-common`, `storage-resource`, `image-resource`, `server-api`, `server-app`, `queue`,
`llm` (live inference providers). These tests **never** mock the external service. They run
only when the corresponding env vars are set, and they self-skip cleanly when those variables
are missing.

## Helpers from `@owlmeans/test-integration`

| Helper | Purpose |
|---|---|
| `postgresGate()`, `mongoGate()`, `redisGate()`, `s3Gate()`, `kubeGate()` | Read env, return `{ skip, reason?, env }`. |
| `randomNamespace(prefix, len?)` | Schema / DB / key / object-prefix namespacing for parallel-safe runs. |
| `registerCleanup(fn)` + `runCleanups()` | Process-global LIFO queue. **Single-spec-file packages only** — see below. |

The driver libraries (`pg`, `mongodb`, `ioredis`, `@aws-sdk/client-s3`,
`@kubernetes/client-node`) stay where they already live — in the consuming integration
packages — and are imported directly in those packages' `tests/`.

## Env contract

`/.env.example` documents every required variable, grouped by service, with comments. The
single `.env` at the monorepo root supplies real values for local runs. CI sets them via
secrets. **Empty value = skip** — never a failure.

When a required variable is empty:
1. The corresponding gate reports `skip: true`.
2. The per-package `tests/context.ts` does **not** register the dependent service in the real context.
3. Specs that touch that service self-skip with the reason printed.

**Never print a credential.** Pipe it straight from its source into the env var the gate
reads — the value must never reach a log, a report, or a committed file:

```bash
POSTGRES_URL="$(<build it from the secret file, without echoing>)" bun test ./tests
```

### Where the real credentials come from

The dev-cluster secrets are the source of truth; `../viable/.env.dev.secrets` holds the same
values under kebab-case keys (`mongo-secret`, `redis-secret`, `s3-storage`, …) for
`kubectl create secret --from-env-file`. Read the cluster secret directly rather than transcribing:

```bash
kubectl get secret mongo-owlmeans-mongo-main-db-admin-admin -o jsonpath='{.data.password}' | base64 -d
```

Two things that will bite:

- **URL-escape the password before putting it in a connection string.** These generated passwords
  contain reserved characters; an unescaped one fails with `MongoParseError: Password contains
  unescaped characters`. Escape with `urllib.parse.quote(pw, safe='')`.
- **The port-forward may already be running** — the slots share one cluster, so
  `bind: address already in use` on 27017/5432/6379 usually means another checkout forwards the
  same service. Reuse it; never kill another environment's process.

The suites namespace every database/schema (`MONGO_TEST_DB_PREFIX`, default `omt`) and drop it on
completion, so they are safe against the shared cluster. Confirm nothing was left behind after a
run that aborted mid-way.

## Where the specs live

A resource package (`*-resource`) owns the `Resource<T>` contract; the db package
(`@owlmeans/postgres`, `@owlmeans/mongo`) implements the service that backs it and therefore
**depends on** the resource package.

- **Unit specs** — schema compilation, identifier derivation, placeholder resolution, error
  translation — live in the **resource** package. No gate, no service.
- **Integration specs** that build a real `ServerContext` live in the **db** package. Putting
  them in the resource package would need a devDependency on its own dependent, which is a
  cycle and risks breaking `publish.ts`'s topological batching.

## Per-suite namespaces, not the global cleanup queue

Bun runs **every spec file of a package in one process** with one shared module registry. A
process-global `registerCleanup`/`runCleanups()` therefore misfires: the first file to reach
`afterAll` drops the namespaces of the files still to come. Use `registerCleanup` only in a
package with a single spec file.

Give each spec file its own namespace and its own teardown instead:

```ts
// tests/context.ts
export const gate: IntegrationGate<PostgresEnv> = postgresGate()

export const makeSuite = (label: string): PgSuite => {
  const prefix = process.env.POSTGRES_TEST_DB_PREFIX ?? 'omt'
  const schema = randomNamespace(`${prefix}_${label}`)
  const pools: Pool[] = []

  const boot = async (opts: BootOptions = {}): Promise<Booted> => {
    const cfg: ServerConfig = config('pg-test', { dbs: [{ service: 'postgres', schema, /* … */ }] })
    const context = makeServerContext(cfg) as ServerContext<ServerConfig>
    appendPostgres(context)
    for (const resource of opts.resources ?? []) context.registerResource(resource as never)
    context.configure()
    const pg = context.service<PostgresService>('postgres')
    try {
      await context.init()
    } finally {
      collect(pg)   // in `finally`: a spec asserting a *failed* boot still opened a pool
    }

    return { context, pg }
  }

  const teardown = async (): Promise<void> => {
    if (gate.skip) return
    await raw(async pool => { await pool.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`) })
      .catch(error => console.error(`postgres test teardown (${schema}):`, error))
    /** After the drop — a pool still holding the schema open makes CASCADE wait. */
    while (pools.length > 0) await pools.pop()?.end().catch(() => undefined)
  }

  return { schema, boot, collect, teardown }
}
```

`makeSuite('sync')`, `makeSuite('migration')` … one call per spec file, each with
`afterAll(async () => { await suite.teardown() })`.

## Capability probes must be top-level `await`

Bun decides `test` vs `test.skip` **synchronously**, so a suite cannot await its own probe. A
probe that needs a round trip goes at module scope in `tests/context.ts`, guarded by the gate
and defaulting to "not capable" on any error:

```ts
export const capabilities: PgCapabilities = gate.skip
  ? { bootstrap: false }
  : await raw(async pool => { /* SELECT rolsuper, rolcreaterole, rolcreatedb … */ })
      .catch(() => ({ bootstrap: false }))
```

Specs then branch on it once, at the top: `const it = gate.skip || !capabilities.bootstrap ? test.skip : test`.

## Module-scope declarations outlive a `boot()`

Migration registries and table declarations are keyed by resource **alias** at module scope, so a
maker that runs more than once for the same alias re-declares the same entries and loses nothing.
A `boot()` builds a whole new context, but the declarations belong to the module registry rather
than to any context, so they carry across every boot in the process — deliberately.
Never reset them inside a shared `boot()` helper: a `.migration()` registered before the boot
would be silently dropped. A spec that wants a clean slate calls `resetDeclarations(alias)`
itself, which is what a spec simulating a restarted process should have to say out loud.

Migration bodies belong at **module scope**, not inside the spec callback: the checksum
fingerprints the function's source text, and a body closed over a loop variable fingerprints
the wrapper instead.

## Spec shape

```ts
import { afterAll, describe, expect, test } from 'bun:test'
import { gate, makeSuite } from './context.js'

const suite = makeSuite('crud')
const it = gate.skip ? test.skip : test

describe('@owlmeans/<pkg> — <feature>', () => {
  if (gate.skip) {
    test.skip(gate.reason ?? '<svc> gate closed', () => {})

    return
  }

  afterAll(async () => { await suite.teardown() })

  it('round-trips a record through a real context', async () => {
    /* boot, exercise, assert */
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

Add `"./tests/**/*"` to the package's `tsconfig.json` `exclude` so `tsc -b` never compiles
specs into `build/`, and declare `@owlmeans/test-integration` plus `@types/bun` as
devDependencies.

The Bun runtime auto-loads `<root>/.env` when the test command runs from a workspace package.
If you need to override, `bun test --env-file=../../.env` works. Long-running specs may need a
higher timeout — set it locally in a per-package `bunfig.toml`:

```toml
[test]
timeout = 60000
```

## Bun assertion gotcha

`expect(fn).not.toThrow()` reports a **returned** `Error` as a thrown one. Every error
*translator* returns an `Error`, so this is the wrong assertion for them — assert the returned
value instead, which also proves the call returned:

```ts
expect(pgErrorToResourceError(circular)).toBe(circular)   // not: expect(() => …).not.toThrow()
```

## Rules

- **No mocks.** The whole point of category C is to exercise the real driver against a real service.
- **Always namespace, per suite.** `randomNamespace(`${prefix}_${label}`)` for schemas, DBs, key
  prefixes, and S3 object prefixes, so neither parallel runs nor sibling spec files collide.
- **Always clean up, in the suite that provisioned it.** A failing cleanup is logged, not
  raised — failure must show up in the test, not the teardown. Verify afterwards that the
  service holds no leftovers matching the prefix.
- **Cover SKILL.md cases first.**
- **Max 3-4 tests per method/function.**
- **CI runs C only when secrets are set.** Locally, an empty `.env` produces a clean skip.

## When the env is partially populated

Each gate fails closed. A test that needs both `S3_KEY` and `S3_SECRET` does not run if only
one is set — `s3Gate()` reports `skip: true`. This is intentional: a half-configured
environment must not produce false positives or partial coverage.
