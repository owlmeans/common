---
description: "How to use @owlmeans/server-oidc-provider — embedded OIDC identity provider built on the oidc-provider library."
applyTo: "**/*.ts, **/*.tsx"
---

# @owlmeans/server-oidc-provider

**Layer:** Server
**Install:** `"@owlmeans/server-oidc-provider": "^0.1.2"` in `dependencies`

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

## Depends On

- `@owlmeans/oidc`, `@owlmeans/server-api`, `@owlmeans/server-context`, `oidc-provider`
