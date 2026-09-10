---
name: testing-auth-unit
description: Category-B unit tests for OwlMeans Common — auth/authz packages where the test substitutes a fake authenticated identity via @owlmeans/test-auth. Auto-invoked when writing tests in auth, auth-common, auth-otp, basic-keys, basic-envelope, did, client-auth, client-did, client-iam, client-payment, mui-oidc-rp, oidc, server-auth, server-auth-otp, server-oidc-*, web-auth, web-oidc-*, wled.
---

# Auth Unit Tests — Category B

**Install:** `"@owlmeans/test-auth": "^0.1.18-rc.12"` in `devDependencies`

Category B applies to the auth/authz packages: `auth`, `auth-common`, `auth-otp`, `basic-envelope`, `basic-keys`, `client-auth`, `client-did`, `client-iam`, `client-payment`, `did`, `mui-oidc-rp`, `oidc`, `server-auth`, `server-auth-otp`, `server-oidc-provider`, `server-oidc-rp`, `web-auth`, `web-oidc-provider`, `web-oidc-rp`, `wled`. These tests run under `bun test` (no Playwright even when there are React bits) and are the **only** place mocks are allowed — and only for authentication/authorization, via `@owlmeans/test-auth`.

For background on the protocol you're mocking, read the `auth-protocol` skill.

## Helpers from `@owlmeans/test-auth`

| Helper | Purpose |
|---|---|
| `makeFixtureKeyPair(seed?)` | Deterministic Ed25519 `KeyPairModel`. Same seed → same keys; no seed → a fresh random pair. |
| `makeMemoryTrustedResource(records?, alias?)` | `Resource<TrustedRecord>` that satisfies `trust()` lookups. `alias` defaults to `TRUSTED`. |
| `makeMockGuard(opts?)` | `GuardService` resolving to a chosen `Auth`, registerable exactly like a real guard. |
| `MockGuardOptions` | `{ alias?, auth?, allow?, token? }` — see below. |
| `withAuth(ctx, auth, alias?)` | Registers a mock guard on `ctx` that resolves to `auth`, and returns `ctx`. |
| `signMockEnvelope(msg, type, kind?, kp?)` | Wraps `makeEnvelopeModel` with a fixture keypair and signs it; `kind` defaults to `EnvelopeKind.Token`. |
| `makeBearer(auth, kp?)` | Produces an `ED25519-BASIC-TOKEN <encoded>` header value from an `Auth`. |
| `SUPERUSER`, `USER`, `SERVICE` | Canonical `Auth` payload fixtures (`Superuser` / `User` / `Service` roles, `scopes: ['*']`). |

`MockGuardOptions` carries the whole seam: `auth` is what `handle` resolves into the response,
`allow` is the predicate `match` reports (default: always match), `token` is what the client-side
`authenticated()` answers, and `alias` defaults to `DEFAULT_GUARD` so the mock takes the place a
real guard would occupy. `withAuth` is the shorthand for the common case.

**The last registration for an alias wins.** `registerService` in `@owlmeans/context` assigns
`services[service.alias]`, so it overwrites silently — there is no "first one keeps the slot".
Register the mock **after** anything that appends a real guard under the same alias (an
`append*` mixin the package documents, or a context factory that wires one), or give the mock
its own alias and point the entrypoint's guard at that. A mock registered first and then
overwritten leaves the spec exercising real cryptography and failing on a trusted-record
lookup, which reads as an unrelated failure.

## `tests/context.ts` pattern

```ts
import { AppType, makeBasicContext } from '@owlmeans/context'
import { makeMemoryTrustedResource, withAuth, USER } from '@owlmeans/test-auth'

export const makeTestCtx = () => {
  const ctx = makeBasicContext({
    ready: false, service: '<pkg>-tests', type: AppType.Backend, services: {},
  })
  ctx.registerResource(makeMemoryTrustedResource([
    { id: 'svc', name: 'svc', credential: '<fixture-pubkey>' },
  ]))
  withAuth(ctx, USER)        // register a mock guard resolving to USER
  return ctx
}
```

One factory, one context: the trusted resource and the mock guard are registered inside it, in the
order a real app's `makeContext` would.

`makeMemoryTrustedResource` implements only `load`, `save` and `create` — enough for the `trust()`
boundary and for seeding from a spec; every other resource method throws. A read takes an id or a
single-field criteria over `id` or `name`, and anything wider is refused with
`UnsupportedArgumentError` rather than scanned: a query the mock cannot answer exactly is a test
reaching past its seam, and the honest fix is integration coverage.

Every seeded record needs an `id`; a record without one is rejected on construction, and so is a
`create` for an id already held. `trust(context, resource, userName)` looks up by `name` by
default, so seed both fields. Give the record a `credential` (a public key) when the code under
test only verifies, and a `secret` (a private key) when it must sign as the trusted party —
`trust()` prefers `secret` and falls back to `credential`.

The trusted resource, mock guard, and any fixture keys are the **only** mocks allowed. Everything else (the service under test, sibling packages it depends on) is the real thing.

## Spec shape

```ts
import { describe, expect, test } from 'bun:test'
import { makeFixtureKeyPair } from '@owlmeans/test-auth'
import { packAuthCredentials, unpackAuthCredentials } from '@owlmeans/basic-keys'

const key = makeFixtureKeyPair('alice')

describe('@owlmeans/basic-keys — packAuthCredentials', () => {
  test('round-trips a signed credential', async () => {
    const signed = await packAuthCredentials(/* … */, undefined, key)
    const result = await unpackAuthCredentials(signed, key)
    expect(result.isValid).toBe(true)
  })
})
```

## Rules

- **Mocks only for auth/authz.** No mocks for databases, network, or any sibling package. If you need one, move the spec to category C and write an integration test.
- **Don't replicate `@owlmeans/test-auth` helpers in your package.** If you need a new mocking primitive (e.g. an OIDC userinfo endpoint stub), add it to `@owlmeans/test-auth` and its skill — never to a per-package `tests/`.
- **Use deterministic seeds.** `makeFixtureKeyPair('<seed>')` keeps signatures stable run-to-run; random keypairs break snapshot-style assertions.
- **Cover SKILL.md cases first.** The package's own skill (its directory under `.agents/skills/` — named for the skill, which is not always the package name) documents the consumer-facing surface, and that is the test priority order.
- **Max 3-4 tests per method/function.** Same as category A.
- **Don't test types or utils.**

## When you actually want OIDC end-to-end

`@owlmeans/test-auth` ships no fake JWKS server. Use the real `makeOidcGuard` against the in-memory trusted resource and a fixture keypair. If a future test needs a hostable IdP fake, add it to `@owlmeans/test-auth` and document it here — don't bolt it on per package.
