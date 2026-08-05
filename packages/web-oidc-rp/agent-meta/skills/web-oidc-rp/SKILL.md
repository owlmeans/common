---
name: web-oidc-rp
description: How to use @owlmeans/web-oidc-rp — browser OIDC relying party. appendOidcGuard() to wire the guard into a web context; setupOidcGuard() to wire it into module declarations. Auto-invoked when importing web-oidc-rp helpers.
user-invocable: false
---
<!-- AUTO-GENERATED — do not edit. Regenerate via sync-agent-meta. -->

# @owlmeans/web-oidc-rp

**Layer:** Web (React)
**Install:** `"@owlmeans/web-oidc-rp": "^0.1.12"` in `dependencies`

## Key Exports

| Export | Description |
|--------|-------------|
| `appendOidcGuard<C, T>(context)` | Add OIDC guard to a web context |
| `setupOidcGuard(modules, options?, payloadOptions?)` | Wire OIDC guard onto module declarations |
| `service` | Web OIDC RP service (oidc-client-ts based) |
| `components` | Login / callback React components |
| Constants | OIDC client aliases |

## Subpath Exports

- `./auth/plugins` — pluggable token/session plugins

## Usage

### In `context.ts`
```typescript
import { appendOidcGuard } from '@owlmeans/web-oidc-rp'

export const makeContext = <C extends Config, T extends Context<C>>(cfg: C): T => {
  const context = makeBasicContext<C, T>(cfg)
  appendOidcGuard<C, T>(context)
  return context
}
```

### In `modules.ts`
```typescript
import { setupOidcGuard } from '@owlmeans/web-oidc-rp'
setupOidcGuard(modules, undefined, { payload: { simplified: true } })
```

## Product-Viable Usage Notes

- Importing `@owlmeans/web-oidc-rp/auth/plugins` registers both `OIDC_CLIENT_AUTH` and `GOOGLE_CLIENT_AUTH` plugins into the `@owlmeans/client-auth` plugin registry.
- The Google plugin uses `useValue` to manage redirect side effects, persists auth control state before redirect, restores it on return, then submits URL query params as `AuthCredentials`.
- The browser plugin starts login; the server finalizes provider exchange, links local identity, and returns a normal bearer token.
- Do not encode product authorization in browser OIDC plugins. Server module gates and local identity profiles remain the authorization source.
- **URL generation:** Use `context.module<Module<string>>(alias).call({ full: true, params })` to build full URLs (redirect_uri, post-auth home). Import `HOME` and module aliases from `@owlmeans/web-client` / `@owlmeans/auth`. Never use raw `window.location.origin + window.location.pathname` concatenation.

## Depends On

- `@owlmeans/oidc`, `@owlmeans/web-client`, `@owlmeans/web-panel`, `@owlmeans/client-auth`, `@owlmeans/auth-common`
- `oidc-client-ts@3.5.0` (exact), `react` (peer) — see [[oidc-versions]]

**Note:** The `oidc-client-ts` `UserManager` path (for fully browser-side OIDC) is an **incomplete stub**. The production flow uses server-side token exchange via `DISPATCHER_OIDC_INIT` / `DISPATCHER_OIDC` modules, not `UserManager.signinRedirect`.
