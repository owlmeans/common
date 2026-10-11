# @owlmeans/test-auth

The **only** OwlMeans package that ships authentication/authorization mocks. Tests in any other package may import from here when they need a fake authenticated identity, a deterministic Ed25519 keypair, or an in-memory `TRUSTED` resource. No other mocks (database, network, sibling-package services) belong in test code — those packages get integration tests instead (`@owlmeans/test-integration`). It is a dev dependency of category-B packages (the auth/authz family); a category-A package that seems to need it is testing behaviour that belongs in an auth-aware sibling. The package's skill is `testing-auth-unit`; the protocol these mocks stand in for is described by the `auth-protocol` skill.

## Installation

```bash
bun add -d @owlmeans/test-auth@^0.1.18-rc.48
```

It depends on `@owlmeans/test`, so the env gates and fixture loader are available alongside.

## Concepts

- **Fixture keypair** — `makeFixtureKeyPair(seed)`: an Ed25519 `KeyPairModel` derived from a seed,
  so signatures and trusted records are stable run to run. No seed gives a random pair.
- **Trusted resource** — `makeMemoryTrustedResource(records, alias?)`: a `Resource<TrustedRecord>`
  registered under `TRUSTED` that answers the `trust()` lookups of `@owlmeans/auth-common`.
- **Mock guard** — `makeMockGuard(opts)`: a real `GuardService` shape (`match`, `handle`,
  `authenticated`) that resolves a chosen `Auth` without cryptography or trusted-record lookups.
  Defaults to the `DEFAULT_GUARD` alias, so it takes the place a real guard would occupy.
- **Canonical identities** — `SUPERUSER`, `USER`, `SERVICE`: `Auth` payloads with `scopes: ['*']`.
- **Last registration wins** — `registerService` overwrites an alias, so a mock guard registered
  before a real one under the same alias is silently replaced.

## Usage

### Build the suite's context

```typescript
// tests/context.ts
import { AppType, makeBasicContext } from '@owlmeans/context'
import type { BasicConfig } from '@owlmeans/context'
import type { TrustedRecord } from '@owlmeans/auth-common'
import { USER, appendMockGuard, makeFixtureKeyPair, makeMemoryTrustedResource } from '@owlmeans/test-auth'

export const authKey = makeFixtureKeyPair('auth-service')

export const authRecord: TrustedRecord = {
  id: authKey.exportAddress(),
  name: 'auth-service',               // trust() looks up by name by default — seed both fields
  credential: authKey.exportPublic(), // add `secret: authKey.export()` when the code must sign
  scopes: ['*'],
}

export const makeTestCtx = () => {
  const ctx = makeBasicContext<BasicConfig>({
    ready: false, service: 'my-pkg-tests', type: AppType.Backend,
  })
  ctx.registerResource(makeMemoryTrustedResource([authRecord]))
  appendMockGuard(ctx, USER)          // after anything that registers a real guard

  return ctx
}
```

### Control what the guard matches

```typescript
import { SERVICE, makeMockGuard } from '@owlmeans/test-auth'

const guard = makeMockGuard({
  alias: 'service-guard',
  auth: SERVICE,
  allow: req => req.headers['x-service'] != null,  // `match` reports this predicate
  token: 'token-service',                          // what client-side `authenticated()` answers
})
ctx.registerService(guard)
```

### Sign envelopes and bearers

```typescript
import { EnvelopeKind } from '@owlmeans/basic-envelope'
import { USER, makeBearer, makeFixtureKeyPair, signMockEnvelope } from '@owlmeans/test-auth'

const key = makeFixtureKeyPair('alice')
const token = await signMockEnvelope({ userId: 'u-1' }, 'ed25519-basic-token', EnvelopeKind.Token, key)

const header = await makeBearer(USER, key) // 'ED25519-BASIC-TOKEN <encoded>'
```

## API

| Symbol | Kind | Purpose |
|---|---|---|
| `makeFixtureKeyPair(seed?)` | function | Deterministic Ed25519 `KeyPairModel`; random without a seed |
| `makeMemoryTrustedResource(records?, alias?)` | function | `Resource<TrustedRecord>` satisfying `trust()` lookups against the `TRUSTED` config resource; `alias` defaults to `'TRUSTED'` |
| `makeMockGuard(opts?)` | function | `GuardService` that resolves to a chosen `Auth`; implements `match`, `handle`, `authenticated` |
| `appendMockGuard(ctx, auth, alias?)` | function | Registers a mock guard resolving to `auth` on the context and returns it |
| `signMockEnvelope(msg, type, kind?, kp?)` | function | Wraps `makeEnvelopeModel` with a fixture keypair to produce a signed envelope; `kind` defaults to `EnvelopeKind.Token` |
| `makeBearer(auth, kp?)` | function | `ED25519-BASIC-TOKEN <encoded>` header value for unit tests of header parsing and guard `match` |
| `SUPERUSER`, `USER`, `SERVICE` | const | Canonical `Auth` payloads (`Superuser` / `User` / `Service` roles) |
| `MockGuardOptions` | type | `{ alias?, auth?, allow?, token? }` |

### The in-memory trusted resource

- Implements only `load`, `save` and `create`; every other method throws.
- A read takes an id, or a criteria over exactly one of `id` / `name` with a string value; anything
  wider throws `UnsupportedArgumentError('test-auth:trusted:where')`.
- Every record needs an `id` — a record without one is rejected on construction, and `create` refuses
  an id already held.

## Common pitfalls

- Registering the mock guard first and a real guard (through an `append*` mixin or a context factory)
  afterwards under the same alias — the real one wins and the spec fails on a trusted-record lookup.
- Using random keypairs where a signature or record must be stable — pass a seed.
- Seeding a trusted record with `id` only — `trust()` looks up by `name`.
- Adding a new auth mock to a package's own `tests/` — it belongs here, documented in the
  `testing-auth-unit` skill.
- Mocking anything other than authentication/authorization — write an integration test instead.

## Related packages

- [`@owlmeans/test`](../test) — env gates and fixture loader this package builds on
- [`@owlmeans/test-integration`](../test-integration) — the place for tests that would need any other mock
- [`@owlmeans/auth-common`](../auth-common) — `trust()`, `TrustedRecord`, `DEFAULT_GUARD`
- [`@owlmeans/basic-keys`](../basic-keys) — `KeyPairModel`
- [`@owlmeans/basic-envelope`](../basic-envelope) — `makeEnvelopeModel`, `EnvelopeKind`
- [`@owlmeans/auth`](../auth) — the `Auth` type and roles

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
