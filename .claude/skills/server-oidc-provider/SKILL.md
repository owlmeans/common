---
name: server-oidc-provider
description: How to use @owlmeans/server-oidc-provider — embedded OIDC identity provider built on the oidc-provider library. Auto-invoked when serving OIDC endpoints from your own service.
user-invocable: false
---

# @owlmeans/server-oidc-provider

**Layer:** Server
**Install:** `"@owlmeans/server-oidc-provider": "^0.1.2"` in `dependencies`

## Key Exports

| Export | Description |
|--------|-------------|
| `makeOidcProviderService()` | Factory for the embedded OIDC provider service |
| Middleware | OIDC endpoints (authorize, token, userinfo, jwks) |
| Constants | Endpoint paths, default scopes |
| `OidcProvider` types | Provider config shape |

## Usage

Use this only when your service IS the identity provider (e.g. self-hosted Keycloak alternative). For consuming an external IdP, use `@owlmeans/server-oidc-rp`.

```typescript
import { makeOidcProviderService } from '@owlmeans/server-oidc-provider'
context.registerService(makeOidcProviderService())
```

## Depends On

- `@owlmeans/oidc`, `@owlmeans/server-api`, `@owlmeans/server-context`
- `oidc-provider` (runtime)
