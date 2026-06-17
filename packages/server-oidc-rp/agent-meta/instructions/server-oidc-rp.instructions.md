---
description: "How to use @owlmeans/server-oidc-rp — OIDC relying party. appendOidcGuard(), makeOidcWrappingService(), makeOidcGate(), setupOidcGuard() to wire OIDC into a server context."
applyTo: "**/context.ts, **/modules.ts, **/*.ts, **/*.tsx"
---
<!-- AUTO-GENERATED — do not edit. Regenerate via sync-agent-meta. -->

# @owlmeans/server-oidc-rp

**Layer:** Server
**Install:** `"@owlmeans/server-oidc-rp": "^0.1.11"` in `dependencies`

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

## Product-Viable Usage Notes

- Viable uses `makeOidcClientService()` to read provider descriptors from `cfg.oidc.providers`, including Google and internal admin providers.
- `findProvider(predicate)`, `hasProvider(params)`, and `entityToClientId(params)` are the preferred provider lookup helpers; avoid scanning config ad hoc in downstream code.
- `setupAuthServiceModules(managerModules, AUTH_API)` exposes provider-list and token-update service modules protected by `GUARD_ED25519`.
- When a downstream app uses OIDC/Google only for login and maps users into `@owlmeans/server-auth-identity`, do not reintroduce `appendOidcGuard()`, `makeOidcGate()`, or `setupOidcGuard()` as product authorization. Use a product-specific `GateService` over local identity data.

## Integrated-IAM permissions claim (Phase 3)

- `extractPermissionSets(claim)` (exported) shape-validates a `permissions` token claim into
  `PermissionSet[]`; non-conforming claims (e.g. anything Keycloak emits) return `undefined`.
- `authenticate` (actions/process.ts) maps a conforming id_token `permissions` claim into
  `Auth.permissions` + `permissioned: true`; the wrapping service re-extracts it on token refresh.
- `createGateModel` is exported for `@owlmeans/server-iam`, whose `makeIamGate` asserts claims first
  and falls back to this UMA2 model — registered under the same `OIDC_GATE` alias by `appendIam()`.

## Depends On

- `@owlmeans/oidc`, `@owlmeans/server-auth`, `@owlmeans/server-context`, `@owlmeans/server-entrypoint`, `@owlmeans/auth-common`, `@owlmeans/basic-keys`
