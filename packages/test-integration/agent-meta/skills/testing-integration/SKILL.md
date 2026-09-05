---
name: testing-integration
description: Category-C integration tests for OwlMeans Common packages that talk to external services (PostgreSQL, MongoDB, Redis, S3, Kubernetes, SMTP). Env-gated, no mocks, per-suite namespaces, conditional context provisioning. Auto-invoked when writing tests in postgres*, mongo*, redis*, kluster, llm, storage-resource, mailer-smtp, server-mailer-mailgun, server-api, server-app.
---
<!-- AUTO-GENERATED — do not edit. Regenerate via sync-agent-meta. -->

# Integration Tests — Category C

**Install:** `"@owlmeans/test-integration": "^0.1.18-rc.8"` in `devDependencies`

Category C applies to packages that integrate with external services: `postgres`,
`postgres-resource`, `mongo`, `mongo-resource`, `redis`, `redis-resource`, `redis-queue`,
`kluster`, `storage-resource`, `mailer-smtp`, `server-mailer-mailgun`, `server-api`,
`server-app`, `llm` (live inference providers). These tests **never** mock the external service.
They run only when the corresponding env vars are set, and they self-skip cleanly when those
variables are missing.

`queue`, `resource`, `mailer`, `storage-common` and `image-resource` stay in category A: types,
AJV schemas and error translation only, so their specs need nothing running and there is no gate
they could open. What decides the category is what a package's own code does at runtime, not what
its manifest lists — a `*-resource` package that issues real commands through a client the db
service hands it is category C even when it names no driver of its own.

## Helpers from `@owlmeans/test-integration`

| Helper | Purpose |
|---|---|
| `postgresGate()`, `mongoGate()`, `redisGate()`, `s3Gate()`, `kubeGate()`, `smtpGate()` | Read env, return `IntegrationGate<E>` = `{ skip, reason?, env }`. |
| `IntegrationGate<E>` | `{ skip: boolean, reason?: string, env: Partial<E> }`. `env` holds only the variables that were actually populated. `skip` is a plain `boolean`, not a discriminant, so `env` stays `Partial<E>` on the open branch too — a suite reads a required variable through a cast: `gate.env.MONGO_URL as string`. |
| `PostgresEnv`, `MongoEnv`, `RedisEnv`, `S3Env`, `KubeEnv`, `SmtpEnv` | The variable set each gate reads, so `tests/context.ts` types its exported gate. |
| `randomNamespace(prefix, len?)` | Schema / DB / key / object-prefix namespacing for parallel-safe runs. Default 6 hex chars. |
| `registerCleanup(fn)` + `runCleanups()` | Process-global LIFO queue. Only where **one** spec file of the package provisions anything — see below. |

Each gate fails closed on its **required** variables and treats the rest as optional:

| Gate | Required | Optional |
|---|---|---|
| `mongoGate()` | `MONGO_URL` | `MONGO_TEST_DB_PREFIX` |
| `postgresGate()` | `POSTGRES_URL` | `POSTGRES_TEST_DB_PREFIX` |
| `redisGate()` | `REDIS_URL` | `REDIS_TEST_KEY_PREFIX` |
| `s3Gate()` | `S3_ENDPOINT`, `S3_KEY`, `S3_SECRET`, `S3_TEST_BUCKET` | `S3_REGION` |
| `kubeGate()` | `KUBE_CONFIG`, `KUBE_TEST_OK` | — |
| `smtpGate()` | `SMTP_HOST`, `SMTP_USER`, `SMTP_PASSWORD`, `SMTP_FROM`, `SMTP_TEST_TO` | `SMTP_PORT`, `SMTP_SECURE` |

`SMTP_TEST_TO` is required rather than optional because an open SMTP gate sends **real mail** — the
suite must never guess a recipient.

An optional variable is only in `env` when it was actually populated, which is why a suite reads a
defaulted one — `POSTGRES_TEST_DB_PREFIX ?? 'omt'` — straight from `process.env` instead: calling
any gate has already run `loadEnv`, so the `.env` values are in `process.env` by then.

**Six services, six gates — a category-C package outside that set writes its own.** There is no
gate for an LLM provider or for the Mailgun HTTP API, and none should be added to
`@owlmeans/test-integration` for a provider only one package talks to. Declare it in that
package's `tests/context.ts` with `makeGates` from `@owlmeans/test` instead, listing the variables
the provider needs; the result skips exactly the same way. `@owlmeans/llm` is the worked example.

Every driver stays where it already lives — in the package that integrates with the service, not
in a test package: `pg` (`@owlmeans/postgres`), `mongodb` (`@owlmeans/mongo`), `ioredis`
(`@owlmeans/redis`), `bullmq` (`@owlmeans/redis-queue`), `@aws-sdk/client-s3`
(`@owlmeans/storage-resource`), `@kubernetes/client-node` (`@owlmeans/kluster`) and `nodemailer`
(`@owlmeans/mailer-smtp`). A suite that must reach the service outside the package's own
service — to seed a fixture, or to assert on what really landed — imports that driver directly in
its `tests/`. `@owlmeans/server-mailer-mailgun` has no driver: it posts to the Mailgun HTTP API
with the global `fetch`, so a suite there imports nothing beyond the package under test and
asserts on the request it builds and the API's reply.

## Env contract

One `.env.example` at the workspace root documents every variable, grouped by service, with
comments; the `.env` beside it supplies real values for local runs and `loadEnv` (from
`@owlmeans/test`) picks it up. CI sets the same variables from secrets. **Empty value = skip** —
never a failure.

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

Read each secret from wherever it actually lives — a cluster secret, a vault, the provider's own
console — and pipe it into the variable in one step. Never transcribe a credential into a file,
a fixture or this guidance.

```bash
kubectl get secret <name> -o jsonpath='{.data.password}' | base64 -d
```

Two things that will bite:

- **URL-escape the password before putting it in a connection string.** Generated passwords
  contain reserved characters; an unescaped one fails with `MongoParseError: Password contains
  unescaped characters`. Escape with `urllib.parse.quote(pw, safe='')`.
- **A port-forward may already be running.** `bind: address already in use` on 27017/5432/6379
  usually means another checkout or another developer already forwards that service. Reuse the
  forward; never kill a process you did not start.

The suites namespace every database/schema (`MONGO_TEST_DB_PREFIX`, default `omt`) and drop it on
completion, so they are safe against an instance shared with anything else. Confirm nothing was
left behind after a run that aborted mid-way.

## Where the specs live

A resource package (`*-resource`) owns the `Resource<T>` contract; the db package
(`@owlmeans/postgres`, `@owlmeans/mongo`) implements the service that backs it and therefore
**depends on** the resource package.

- **Unit specs** — schema compilation, identifier derivation, placeholder resolution, error
  translation — live in the **resource** package and gate on nothing: they leave the process
  alone. `@owlmeans/postgres-resource` is entirely this shape.
- **Raw-driver specs** belong there too when the subject is the round trip and not the service.
  `@owlmeans/mongo-resource` opens `mongoGate()`, derives a namespaced database with
  `randomNamespace`, registers a cleanup that drops it, and drives `mongodb` directly with the
  driver as its own devDependency — legitimate precisely because it never constructs the db
  service. It is also the one package that may use the global cleanup queue, because only that
  one spec file of the three provisions anything.
- **Integration specs that build a real `ServerContext`** live in the **db** package. It already
  depends on the resource package, so the pair it boots is the real one; putting them in the
  resource package would make a contract dev-depend on its own implementation just to run its
  specs.

## Per-suite namespaces, not the global cleanup queue

Bun runs **every spec file of a package in one process** with one shared module registry, and the
queue is one array for that whole process. A process-global `registerCleanup`/`runCleanups()`
therefore misfires as soon as two spec files provision: the first to reach `afterAll` drains the
entire queue and drops the namespaces of the files still to come. The queue is safe only where a
**single** spec file provisions anything and that same file calls `runCleanups()`. That is the
shape `@owlmeans/mongo-resource` has — one gated round-trip spec registering one dropped database,
beside two ungated spec files that translate criteria and references in memory and open nothing.

Any package with a second provisioning spec file gives each spec file its own namespace and its
own teardown instead:

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

**Nothing auto-loads the workspace `.env`.** Bun reads a `.env` beside the working directory, so
`bun test` inside a package never sees the one at the workspace root. The gates work because
`@owlmeans/test`'s `loadEnv` does the loading itself and every gate calls it before reading a
variable: it walks up from the working directory for a `bun.lock`, or for a `package.json`
sitting beside a directory named `packages`, and reads the `.env` it finds there. A variable
already set to a non-empty value always wins, so `MONGO_URL=… bun test ./tests` still overrides
the file. A workspace shaped any other way names the file itself — `loadEnv({ file })` at the top
of `tests/context.ts`, before the gates run.

Bun's per-test timeout is 5s, and **`bunfig.toml`'s `[test] timeout` does not raise it** — bun
1.4.0 reads the section (`preload` in it works) and ignores that key. Give a long-running spec its
own budget as the third argument to `test`, or raise the whole run on the command line:

```ts
test('round-trips through a real service', async () => { /* … */ }, 60_000)
```

```sh
bun test --timeout=60000 ./tests
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
