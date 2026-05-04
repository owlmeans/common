---
name: testing-integration
description: Category-C integration tests for OwlMeans Common packages that talk to external services (MongoDB, Redis, S3, Kubernetes). Env-gated, no mocks, conditional context provisioning. Auto-invoked when writing tests in mongo*, redis*, kluster, storage*, image-resource, server-api, server-app, queue.
---

# Integration Tests — Category C

Category C applies to packages that integrate with external services: `mongo`, `mongo-resource`, `redis`, `redis-resource`, `kluster`, `storage-common`, `storage-resource`, `image-resource`, `server-api`, `server-app`, `queue`. These tests **never** mock the external service. They run only when the corresponding env vars are set, and they self-skip cleanly when those variables are missing.

## Helpers from `@owlmeans/test-integration`

| Helper | Purpose |
|---|---|
| `mongoGate()`, `redisGate()`, `s3Gate()`, `kubeGate()` | Read env, return `{ skip, reason?, env }`. |
| `randomNamespace(prefix, len?)` | DB / key / object-prefix namespacing for parallel-safe runs. |
| `registerCleanup(fn)` + `runCleanups()` | LIFO cleanup queue for `afterAll`. |

The driver libraries (`mongodb`, `ioredis`, `@aws-sdk/client-s3`, `@kubernetes/client-node`) stay where they already live — in the consuming integration packages — and are imported directly in those packages' `tests/`.

## Env contract

`/.env.example` documents every required variable, grouped by service, with comments. The single `.env` at the monorepo root supplies real values for local runs. CI sets them via secrets. **Empty value = skip** — never a failure.

When a required variable is empty:
1. The corresponding gate reports `skip: true`.
2. The per-package `tests/context.ts` does **not** register the dependent service in the real context.
3. Specs that touch that service self-skip with the reason printed.

## `tests/context.ts` pattern

```ts
import { mongoGate, randomNamespace, registerCleanup } from '@owlmeans/test-integration'

let cached: { gate: ReturnType<typeof mongoGate>, dbName: string } | null = null

export const getTestEnv = () => {
  if (cached != null) return cached
  const gate = mongoGate()
  const dbName = randomNamespace(process.env.MONGO_TEST_DB_PREFIX ?? 'omt')
  cached = { gate, dbName }
  if (!gate.skip) {
    registerCleanup(async () => {
      const { MongoClient } = await import('mongodb')
      const client = new MongoClient(gate.env.MONGO_URL!)
      try { await client.connect(); await client.db(dbName).dropDatabase() }
      finally { await client.close() }
    })
  }
  return cached
}
```

## Spec shape

```ts
import { afterAll, describe, expect, test } from 'bun:test'
import { runCleanups } from '@owlmeans/test-integration'
import { getTestEnv } from './context.js'

const env = getTestEnv()

afterAll(async () => { await runCleanups() })

describe('@owlmeans/<pkg> — <feature>', () => {
  if (env.gate.skip) {
    test.skip(env.gate.reason ?? '<svc> gate closed', () => {})
    return
  }
  test('round-trips a record via the real <svc>', async () => {
    /* connect, exercise, assert */
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

The Bun runtime auto-loads `<root>/.env` when the test command runs from a workspace package. If you need to override, `bun test --env-file=../../.env` works. Long-running specs may need a higher timeout — set it locally in a per-package `bunfig.toml`:

```toml
[test]
timeout = 60000
```

## Rules

- **No mocks.** The whole point of category C is to exercise the real driver against a real service.
- **Always namespace.** Use `randomNamespace(prefix)` for DBs, key prefixes, and S3 object prefixes so parallel runs don't collide.
- **Always clean up.** `registerCleanup(fn)` + `runCleanups()` in `afterAll`. A failing cleanup is logged, not raised — failure must show up in the test, not the teardown.
- **Cover SKILL.md cases first.**
- **Max 3-4 tests per method/function.**
- **CI runs C only when secrets are set.** Locally, an empty `.env` produces a clean skip.

## When the env is partially populated

Each gate fails closed. A test that needs both `S3_KEY` and `S3_SECRET` does not run if only one is set — `s3Gate()` reports `skip: true`. This is intentional: a half-configured environment must not produce false positives or partial coverage.
