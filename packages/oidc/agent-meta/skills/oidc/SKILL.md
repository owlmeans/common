---
name: oidc
description: How to use @owlmeans/oidc — shared OIDC protocol abstractions including OIDC_GATE constant used in module gate() declarations. Auto-invoked when importing OIDC types/constants or wiring OIDC into a guard().
user-invocable: false
---
<!-- AUTO-GENERATED — do not edit. Regenerate via sync-agent-meta. -->

# @owlmeans/oidc

**Layer:** Core
**Install:** `"@owlmeans/oidc": "^0.1.18-rc.6"` in `dependencies`

## Key Exports

| Export | Description |
|--------|-------------|
| `OIDC_GATE` | Gate alias to pass to `gate(...)` inside `guard(...)` |
| `GOOGLE_CLIENT_AUTH` | Client auth plugin type for Google OAuth |
| `GOOGLE_SERVICE` | Provider service key for Google (`'google'`) |
| `OIDC_RP_BASE_SCOPES` / `OIDC_RP_BASE_SCOPE` | The scopes every OwlMeans RP requests, as array / space-delimited string |
| `EMAIL_SCOPE`, `PERMISSIONS_SCOPE`, `PERMISSIONS_CLAIM` | Standard email scope; the integrated-IAM grant scope and its claim |
| `OIDC_ERROR_QUERY`, `OIDC_ERROR_DESCRIPTION_QUERY` | Redirect-URI params an authorization server sets on failure |
| `INTERACTION`, `INTERACTION_PATH`, `INTERACTION_UID` | Interaction screen entrypoint alias, path, and its uid path param |
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

## Scope names are a cross-package contract

`OIDC_RP_BASE_SCOPES` is the one definition of what an OwlMeans relying party asks an authorization
server for. Two sides must agree on it and both read it from here:

- the **RP** builds its request from it (`requestedScope()` in `@owlmeans/server-oidc-rp`);
- whoever **registers the client** must allow at least these scopes — an authorization server
  rejects the entire request with `invalid_scope` when a requested scope is one it supports but
  the client is not allowed to use (see `@owlmeans/iam-integrated`'s `INTEGRATED_CLIENT_SCOPES`).

Never hardcode a scope string on either side; adding one to `OIDC_RP_BASE_SCOPES` must widen every
client allowlist derived from it in the same change.

## Product-Viable Usage Notes

- Provider config is stored in `cfg.oidc.providers`; viable config registers both an internal admin provider and a Google provider with `service: GOOGLE_SERVICE`.
- `GOOGLE_SERVICE` is the provider service value `'google'`. Keep it stable so browser plugins, backend provider lookup, and identity credentials derive the same login-service key.
- `GOOGLE_CLIENT_AUTH` names the browser authentication plugin registered by `@owlmeans/web-oidc-rp/auth/plugins`.
- `OIDC_GATE` is for OIDC/UMA-style authorization gates. Do not use it for downstream products that authenticate with OIDC/Google but authorize against local identity resources; those products should declare their own gate alias.

## Depends On

- `@owlmeans/entrypoint`, `@owlmeans/route`, `@owlmeans/auth`
