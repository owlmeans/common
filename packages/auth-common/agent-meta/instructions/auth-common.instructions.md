---
description: "How to use @owlmeans/auth-common — shared authentication guard aliases (DEFAULT_GUARD, GUARD_ED25519) and middleware shared between server and client. Use when declaring modules with guards."
applyTo: "**/*.ts, **/*.tsx"
---
<!-- AUTO-GENERATED — do not edit. Regenerate via sync-agent-meta. -->

# @owlmeans/auth-common

**Layer:** Core
**Install:** `"@owlmeans/auth-common": "^0.1.12"` in `dependencies`

## Key Exports

| Export | Description |
|--------|-------------|
| `DEFAULT_GUARD` | Alias for the default authentication guard |
| `GUARD_ED25519` | Alias for the Ed25519 signature guard |
| `AUTH_API` | Alias of the auth service module group |
| Auth modules | Shared module declarations registered in both server and client |
| Middleware | Cross-side auth middleware helpers |

## Subpath Exports

- `./utils` — shared auth utility functions

## Usage

```typescript
import { entrypoint, guard, gate } from '@owlmeans/entrypoint'
import { route } from '@owlmeans/route'
import { DEFAULT_GUARD } from '@owlmeans/auth-common'
import { OIDC_GATE } from '@owlmeans/oidc'

entrypoint(
  route(manager.back.account.base, '/account'),
  guard(DEFAULT_GUARD, gate(OIDC_GATE, [`my-service-account-{entity}`]))
)
```

## Product-Viable Usage Notes

- Manager API modules use `DEFAULT_GUARD` for bearer-token authentication and compose product authorization with `gate(VIABLE_AUTH_GATE, [...])` inside the same `guard(...)` options object.
- Internal service-to-service routes still use `GUARD_ED25519`, including publisher/project command paths and auth service helper modules.
- `DEFAULT_GUARD` is the guard alias shared across server and web; `@owlmeans/client-auth` exports the matching client alias.
- Do not assume OIDC gates are required when OIDC is only the login/bootstrap provider. In product-viable, OIDC/Google login issues local bearer auth, and a product-specific gate checks local identity scopes.

## Depends On

- `@owlmeans/auth` — types and errors
- `@owlmeans/entrypoint` — entrypoint/guard/gate helpers
