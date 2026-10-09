# @owlmeans/test-integration

Env-gated harness for integration tests of packages that talk to external services (PostgreSQL, MongoDB, Redis, S3-compatible storage, Kubernetes, SMTP). Bundles helper gates and per-run namespacing — the actual driver libraries (`pg`, `mongodb`, `ioredis`, `@aws-sdk/client-s3`, `@kubernetes/client-node`, `nodemailer`) stay where they already live, in the consuming integration packages. It is a dev dependency of category-C packages; a package whose provider is outside these six services (an LLM provider, the Mailgun HTTP API) declares its own gate with `makeGates` from `@owlmeans/test` instead. The package's skill is `testing-integration`.

## Installation

```bash
bun add -d @owlmeans/test-integration@^0.1.18-rc.34
```

## Concepts

- **Integration gate** — `IntegrationGate<E>` = `{ skip, reason?, env }`. Each gate fails closed on
  its required variables; `env` holds only the variables that were actually populated.
- **Reachability probe** — the three datastore gates also require a host in the connection string
  to accept a TCP connect. A set variable pointing at nothing (a port-forward that is not running)
  closes the gate with a printed reason naming the variable and `host:port`. The probe is
  synchronous, so gates are read at module scope; SRV and unix-socket addresses are not probed.
- **Namespace** — `randomNamespace(prefix)`, a short random suffix that keeps database names, key
  prefixes, schemas and S3 object prefixes unique per run and per spec file.
- **Cleanup queue** — `cleanupHelper`, a process-global LIFO queue drained in `afterAll`; safe only
  when a single spec file of the package provisions anything.

## Usage

### Gate and provision in `tests/context.ts`

Specs do not call services through these helpers — they consume the per-package real test context
built in `tests/context.ts` and only check the gate to self-skip when the dependency is missing.

```typescript
// tests/context.ts
import { gateHelper, randomNamespace } from '@owlmeans/test-integration'
import type { IntegrationGate, MongoEnv } from '@owlmeans/test-integration'

export const gate: IntegrationGate<MongoEnv> = gateHelper.mongoGate()

export const makeSuite = (label: string) => {
  // calling a gate already loaded the repo-root .env, so defaulted optionals come from process.env
  const prefix = process.env.MONGO_TEST_DB_PREFIX ?? 'omt'
  const database = randomNamespace(`${prefix}_${label}`)
  const url = gate.env.MONGO_URL as string

  const teardown = async (): Promise<void> => {
    if (gate.skip) return
    /* drop `database` with the driver this package already owns */
  }

  return { database, url, teardown }
}
```

### Self-skip a spec

```typescript
import { afterAll, describe, test } from 'bun:test'
import { gate, makeSuite } from './context.js'

const suite = makeSuite('crud')
const it = gate.skip ? test.skip : test

describe('@owlmeans/mongo — crud', () => {
  if (gate.skip) {
    test.skip(gate.reason ?? 'mongo gate closed', () => {})

    return
  }

  afterAll(async () => { await suite.teardown() })

  it('round-trips a record through a real context', async () => {
    /* boot, exercise, assert */
  }, 60_000)
})
```

### One provisioning spec file: the cleanup queue

```typescript
import { afterAll } from 'bun:test'
import { cleanupHelper } from '@owlmeans/test-integration'

cleanupHelper.registerCleanup(async () => { await client.db(database).dropDatabase() })

afterAll(async () => { await cleanupHelper.runCleanups() }) // LIFO; a failing cleanup is logged, not raised
```

## API

### Gates

| Gate | Required | Optional | Probes |
|---|---|---|---|
| `gateHelper.mongoGate()` | `MONGO_URL` | `MONGO_TEST_DB_PREFIX` | TCP, default port 27017 |
| `gateHelper.postgresGate()` | `POSTGRES_URL` | `POSTGRES_TEST_DB_PREFIX` | TCP, default port 5432 |
| `gateHelper.redisGate()` | `REDIS_URL` | `REDIS_TEST_KEY_PREFIX` | TCP, default port 6379 |
| `gateHelper.s3Gate()` | `S3_ENDPOINT`, `S3_KEY`, `S3_SECRET`, `S3_TEST_BUCKET` | `S3_REGION` | — |
| `gateHelper.kubeGate()` | `KUBE_CONFIG`, `KUBE_TEST_OK` | — | — |
| `gateHelper.smtpGate()` | `SMTP_HOST`, `SMTP_USER`, `SMTP_PASSWORD`, `SMTP_FROM`, `SMTP_TEST_TO` | `SMTP_PORT`, `SMTP_SECURE` | — |

The variables are documented in the workspace-root `.env.example`.

### Helpers

| Symbol | Purpose |
|---|---|
| `gateHelper` (`createGateHelper()`) | The six gates above |
| `randomNamespace(prefix, length?)` | `<prefix>_<hex>`; default 6 hex characters |
| `cleanupHelper` (`createCleanupHelper()`) | `registerCleanup(fn)`, `runCleanups()` |
| `mongoGate`, `redisGate`, `postgresGate`, `smtpGate`, `registerCleanup`, `runCleanups` | Deprecated wrappers over `gateHelper` / `cleanupHelper` |

### Types

| Symbol | Purpose |
|---|---|
| `IntegrationGate<E>` | `{ skip: boolean, reason?: string, env: Partial<E> }` |
| `MongoEnv`, `PostgresEnv`, `RedisEnv`, `S3Env`, `KubeEnv`, `SmtpEnv` | The variable set each gate reads |
| `GateHelper`, `CleanupHelper`, `CleanupFn`, `ProbeTarget` | Helper interfaces and the probe's `host:port` |

## Common pitfalls

- Using the global cleanup queue from two provisioning spec files — Bun runs them in one process, so
  the first `afterAll` drops every namespace. Give each spec file its own namespace and teardown.
- `skip` is a plain boolean, so `env` stays `Partial<E>` on the open branch; read a required
  variable with a cast.
- Awaiting a capability probe inside the suite — Bun picks `test` / `test.skip` synchronously; probe
  with top-level `await` in `tests/context.ts`.
- An open SMTP gate sends real mail to `SMTP_TEST_TO`.
- A reachable datastore with a wrong password still opens the gate — the probe asks for a TCP
  connect only, never a login.
- Never print a credential while wiring the variables.

## Related packages

- [`@owlmeans/test`](../test) — env loading and `makeGates` for providers outside these six services
- [`@owlmeans/test-auth`](../test-auth) — auth mocks for category-B unit tests
- [`@owlmeans/mongo-resource`](../mongo-resource), [`@owlmeans/postgres`](../postgres), [`@owlmeans/redis`](../redis) — consumers that own their drivers
- [`@owlmeans/log`](../log) — the logger the skip warnings and failed cleanups go to

<!-- owlmeans:agent-guidance:start -->
## Agent guidance

This package ships embedded agent skills under `agent-meta/`. After installing your
`@owlmeans/*` packages, run the OwlMeans agent-skills installer to place them into
your project's skill store (`.agents/skills/`):

```sh
npx @owlmeans/agent-skills@^0.1.18-rc.52
```

The embedded files are version-matched to this package release. Do not edit them
directly — they are regenerated on each publish. To contribute guidance edits,
open a PR against the source monorepo.
<!-- owlmeans:agent-guidance:end -->
