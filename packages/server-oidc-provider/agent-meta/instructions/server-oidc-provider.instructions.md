---
description: "How to use @owlmeans/server-oidc-provider — embedded OIDC identity provider built on the oidc-provider library."
applyTo: "**/*.ts, **/*.tsx"
---
<!-- AUTO-GENERATED — do not edit. Regenerate via sync-agent-meta. -->

# @owlmeans/server-oidc-provider

**Layer:** Server
**Install:** `"@owlmeans/server-oidc-provider": "^0.1.9"` in `dependencies`

## Key Exports

| Export | Description |
|--------|-------------|
| `makeOidcProviderService()` | Factory for the OIDC provider service |
| Middleware | OIDC endpoints |
| Constants | Endpoint paths, default scopes |
| `OidcProvider` types | Provider config shape |

## Usage

```typescript
import { makeOidcProviderService } from '@owlmeans/server-oidc-provider'
context.registerService(makeOidcProviderService())
```

For consuming an external IdP instead, use `@owlmeans/server-oidc-rp`.

## Permissions claim seam (integrated IAM)

- `findAccount` threads the requesting `clientId` into `OidcAccountService.loadById(ctx, id, { clientId })`
  (`OidcAccountParams`) so the account service can scope claims per client.
- `combineConfig` registers the `permissions` scope and the `permissions → [permissions]` claim mapping
  by default (consts from `@owlmeans/oidc`); this is inert unless the account service emits the claim.
- To mint the claim into the id_token set `customConfiguration.conformIdTokenClaims: false` and return
  `permissions: PermissionSet[]` from the account's `claims()` when the scope includes `permissions`.

## Depends On

- `@owlmeans/oidc`, `@owlmeans/server-api`, `@owlmeans/server-context`, `oidc-provider`
