---
name: testing-auth-unit
description: Category-B unit tests for OwlMeans Common — auth/authz packages where the test substitutes a fake authenticated identity via @owlmeans/test-auth. Auto-invoked when writing tests in auth, auth-common, basic-keys, basic-envelope, did, client-auth, client-did, server-auth, oidc, server-oidc-*, web-oidc-*, wled, client-payment.
---
<!-- AUTO-GENERATED — do not edit. Regenerate via sync-agent-meta. -->

# Auth Unit Tests — Category B

**Install:** `"@owlmeans/test-auth": "^0.1.18-rc.13"` in `devDependencies`

Category B applies to the auth/authz packages: `auth`, `auth-common`, `basic-keys`, `basic-envelope`, `did`, `client-auth`, `client-did`, `server-auth`, `oidc`, `server-oidc-rp`, `server-oidc-provider`, `web-oidc-rp`, `web-oidc-provider`, `wled`, `client-payment`. These tests run under `bun test` (no Playwright even when there are React bits) and are the **only** place mocks are allowed — and only for authentication/authorization, via `@owlmeans/test-auth`.

For background on the protocol you're mocking, read the `auth-protocol` skill.

## Helpers from `@owlmeans/test-auth`

| Helper | Purpose |
|---|---|
| `makeFixtureKeyPair(seed?)` | Deterministic Ed25519 `KeyPairModel`. Same seed → same keys. |
| `makeMemoryTrustedResource(records?)` | `Resource<TrustedRecord>` that satisfies `trust()` lookups. |
| `makeMockGuard({ alias?, auth?, allow? })` | `GuardService` resolving to a chosen `Auth`. |
| `withAuth(ctx, auth)` | Registers a mock guard on `ctx` that resolves to `auth`. |
| `signMockEnvelope(msg, type, kind?, kp?)` | Wraps `makeEnvelopeModel` with a fixture keypair. |
| `makeBearer(auth, kp?)` | Produces an `ED25519-BASIC-TOKEN <encoded>` header. |
| `SUPERUSER`, `USER`, `SERVICE` | Canonical `Auth` payload fixtures. |

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
- **Cover SKILL.md cases first.** The package's `.agents/skills/<pkg>/SKILL.md` documents the consumer-facing surface — that's the test priority order.
- **Max 3-4 tests per method/function.** Same as category A.
- **Don't test types or utils.**

## When you actually want OIDC end-to-end

The current `@owlmeans/test-auth` does not ship a fake JWKS server. Use the real `makeOidcGuard` against the in-memory trusted resource and a fixture keypair. If a future test needs a hostable IdP fake, add it to `@owlmeans/test-auth` and document it here — don't bolt it on per package.
