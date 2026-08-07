---
description: "How to use @owlmeans/server-oidc-rp — OIDC relying party. appendOidcGuard(), makeOidcWrappingService(), makeOidcGate(), setupOidcGuard() to wire OIDC into a server context."
applyTo: "**/context.ts, **/modules.ts, **/*.ts, **/*.tsx"
---
<!-- AUTO-GENERATED — do not edit. Regenerate via sync-agent-meta. -->

# @owlmeans/server-oidc-rp

**Layer:** Server
**Install:** `"@owlmeans/server-oidc-rp": "^0.1.15"` in `dependencies`

## Key Exports

| Export | Description |
|--------|-------------|
| `appendOidcGuard<C, T>(context)` | Add OIDC auth guard to context |
| `makeOidcWrappingService()` | OIDC token service factory |
| `makeOidcGate()` | OIDC gate factory (used by guards) |
| `setupOidcGuard(modules, options?)` | Wire OIDC guard onto modules |
| Constants | OIDC service / guard aliases |
| `OidcRp` types | RP-side config and token shapes |

## Subpath Exports

- `./auth`, `./auth/plugins`

## Usage

```typescript
// context.ts
import { appendOidcGuard, makeOidcWrappingService, makeOidcGate } from '@owlmeans/server-oidc-rp'
context.registerService(makeOidcWrappingService())
context.registerService(makeOidcGate())
appendOidcGuard<C, T>(context)

// modules.ts
import { setupOidcGuard } from '@owlmeans/server-oidc-rp'
setupOidcGuard(appModules)

// config.ts
cfg.oidc.providers.push({
  clientId: OIDC_ADMIN_CLIENT,
  basePath: 'realms/master',
  service: OIDC_PRODUCT,
  secret: '/etc/master-secret/oidc-admin-secret',
  internal: true
})
```

## Locating the provider: `discoveryUrl` vs `service` + `basePath`

`makeOidcClientService().getConfiguration()` resolves the provider URL in one of two ways:

```ts
// PREFERRED — one fully-qualified value, no knowledge of the provider's URL layout
cfg.oidc.providers.push({ discoveryUrl: process.env.OIDC_ISSUER_URL, clientId, secret, def: true })

// LEGACY — reassembled from a registered service host + base path
cfg.oidc.providers.push({ service: OIDC_PRODUCT, basePath: 'realms/my-org', clientId, secret })
```

- `basePath` and `service` are required **only** when `discoveryUrl` is absent. A `discoveryUrl`-only
  provider is valid (this was not always true — the guards used to throw regardless).
- Prefer `discoveryUrl`. Reassembly forces the relying party to know the provider's URL layout and to
  stay in sync with it; when the two disagree the RP silently talks to the wrong provider. Note that
  `server-oidc-provider` builds its own issuer with `makeUrl(route, basePath, { base: true })` while
  the RP fallback omits `{ base: true }` — so a service route carrying a `base` yields two different
  URLs from the same config.
- **`discoveryUrl` must equal the provider's advertised `issuer` byte for byte.** `openid-client`
  appends `/.well-known/openid-configuration` and then compares the returned `issuer` with the URL it
  was given, failing discovery on any difference (trailing slash, scheme, host). Passing a URL that
  already contains `/.well-known/` skips that check — use it only when the provider's issuer genuinely
  cannot be known in advance.
- There is **no discovery cache**: every `getConfiguration()` performs a fresh HTTP round-trip, and
  `getClient()` calls it per authorize/exchange/refresh/gate check.

## `redirect_uri` is the consumer's own dispatcher URL

`actions/init.ts` builds `redirect_uri` from `context.entrypoint(DISPATCHER).call()` — the app's own
frontend origin + `DISPATCHER_PATH`. It never involves the issuer, and `openid-client` v6 strips
`search`/`hash` on the token-exchange side (`stripParams`), so the authorize and exchange values
match by construction. Do not add query-stripping here.

## Product-Viable Usage Notes

- Viable uses `makeOidcClientService()` to read provider descriptors from `cfg.oidc.providers`, including Google and internal admin providers.
- `findProvider(predicate)`, `hasProvider(params)`, and `entityToClientId(params)` are the preferred provider lookup helpers; avoid scanning config ad hoc in downstream code.
- `setupAuthServiceModules(managerModules, AUTH_API)` exposes provider-list and token-update service modules protected by `GUARD_ED25519`.
- When a downstream app uses OIDC/Google only for login and maps users into `@owlmeans/server-auth-identity`, do not reintroduce `appendOidcGuard()`, `makeOidcGate()`, or `setupOidcGuard()` as product authorization. Use a product-specific `GateService` over local identity data.

## Integrated-IAM permissions claim

- `extractPermissionSets(claim)` (exported) shape-validates a `permissions` token claim into
  `PermissionSet[]`; non-conforming claims (e.g. anything Keycloak emits) return `undefined`.
- `authenticate` (actions/process.ts) maps a conforming id_token `permissions` claim into
  `Auth.permissions` + `permissioned: true`; the wrapping service re-extracts it on token refresh.
- `createGateModel` is exported for `@owlmeans/server-iam`, whose `makeIamGate` asserts claims first
  and falls back to this UMA2 model — registered under the same `OIDC_GATE` alias by `appendIam()`.

## Depends On

- `@owlmeans/oidc`, `@owlmeans/server-auth`, `@owlmeans/server-context`, `@owlmeans/server-entrypoint`, `@owlmeans/auth-common`, `@owlmeans/basic-keys`
