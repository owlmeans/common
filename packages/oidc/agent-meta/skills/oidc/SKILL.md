---
name: oidc
description: How to use @owlmeans/oidc — shared OIDC protocol abstractions including OIDC_GATE constant used in module gate() declarations. Auto-invoked when importing OIDC types/constants or wiring OIDC into a guard().
user-invocable: false
---
<!-- AUTO-GENERATED — do not edit. Regenerate via sync-agent-meta. -->

# @owlmeans/oidc

**Layer:** Core
**Install:** `"@owlmeans/oidc": "^0.1.16-rc.0"` in `dependencies`

## Key Exports

| Export | Description |
|--------|-------------|
| `OIDC_GATE` | Gate alias to pass to `gate(...)` inside `guard(...)` |
| `GOOGLE_CLIENT_AUTH` | Client auth plugin type for Google OAuth |
| `GOOGLE_SERVICE` | Provider service key for Google (`'google'`) |
| `OidcProviderDescriptor` | Shared provider config shape, including service, endpoints, redirect URI, and optional default flag |
| `OidcGuard` types | Guard payload shapes |
| Modules | Shared OIDC module declarations |
| Models | Token/profile shapes |

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

The actual OIDC verification happens in `@owlmeans/server-oidc-rp` (server) and `@owlmeans/web-oidc-rp` (browser). The `oidc` package gives both sides a shared name to refer to.

## Product-Viable Usage Notes

- Provider config is stored in `cfg.oidc.providers`; viable config registers both an internal admin provider and a Google provider with `service: GOOGLE_SERVICE`.
- `GOOGLE_SERVICE` is the provider service value `'google'`. Keep it stable so browser plugins, backend provider lookup, and identity credentials derive the same login-service key.
- `GOOGLE_CLIENT_AUTH` names the browser authentication plugin registered by `@owlmeans/web-oidc-rp/auth/plugins`.
- `OIDC_GATE` is for OIDC/UMA-style authorization gates. Do not use it for downstream products that authenticate with OIDC/Google but authorize against local identity resources; those products should declare their own gate alias.

## Depends On

- `@owlmeans/entrypoint`, `@owlmeans/route`, `@owlmeans/auth`
