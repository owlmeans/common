---
description: "How to use @owlmeans/oidc — shared OIDC protocol abstractions including OIDC_GATE constant used in module gate() declarations."
applyTo: "**/*.ts, **/*.tsx"
---
<!-- AUTO-GENERATED — do not edit. Regenerate via sync-agent-meta. -->

# @owlmeans/oidc

**Layer:** Core
**Install:** `"@owlmeans/oidc": "^0.1.15"` in `dependencies`

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
import { OIDC_GATE } from '@owlmeans/oidc'
import { guard, gate } from '@owlmeans/entrypoint'
import { DEFAULT_GUARD } from '@owlmeans/auth-common'

guard(DEFAULT_GUARD, gate(OIDC_GATE, [`my-service-account-{entity}`]))
```

## Product-Viable Usage Notes

- Provider config is stored in `cfg.oidc.providers`; viable config registers both an internal admin provider and a Google provider with `service: GOOGLE_SERVICE`.
- `GOOGLE_SERVICE` is the provider service value `'google'`. Keep it stable so browser plugins, backend provider lookup, and identity credentials derive the same login-service key.
- `GOOGLE_CLIENT_AUTH` names the browser authentication plugin registered by `@owlmeans/web-oidc-rp/auth/plugins`.
- `OIDC_GATE` is for OIDC/UMA-style authorization gates. Do not use it for downstream products that authenticate with OIDC/Google but authorize against local identity resources; those products should declare their own gate alias.

- `PERMISSIONS_SCOPE` / `PERMISSIONS_CLAIM` (`'permissions'`) — the OIDC scope requesting, and the
  token claim carrying, the subject's `PermissionSet[]` from the integrated IAM provider. Shared by
  `server-oidc-provider` (emission), `server-oidc-rp` (extraction), and target provider config (`extraScopes`).

## Depends On

- `@owlmeans/entrypoint`, `@owlmeans/route`, `@owlmeans/auth`
