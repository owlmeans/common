---
name: web-oidc-rp
description: How to use @owlmeans/web-oidc-rp — browser OIDC relying party. appendOidcGuard() to wire the guard into a web context; setupOidcGuard() to wire it into module declarations. Auto-invoked when importing web-oidc-rp helpers.
user-invocable: false
---

# @owlmeans/web-oidc-rp

**Layer:** Web (React)
**Install:** `"@owlmeans/web-oidc-rp": "^0.1.2"` in `dependencies`

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

## Dispatcher and authorization errors

The `Dispatcher` component is the redirect URI: the provider returns **both** outcomes to it — a
`code` on success and `error` / `error_description` (`OIDC_ERROR_QUERY`, `OIDC_ERROR_DESCRIPTION_QUERY`
from `@owlmeans/oidc`) on failure. It must check for the error params **before** re-entering the
flow and render the message instead: starting authorization again would rebuild the request that
just failed, so the browser bounces between dispatcher and provider forever and the actual reason
never reaches the user. The same rule holds for the MUI dispatcher in `@owlmeans/mui-oidc-rp`.

## Login from an embedded (framed) app

A redirect-based OIDC login cannot complete inside an iframe: the provider answers
`frame-ancestors 'self'` / `X-Frame-Options`, and its session cookies are third-party there, so
neither relaxing one nor the other alone is enough. Run the flow **one window up** instead — a
popup is top-level and first-party on the app's own origin, where none of those restrictions apply.

| Export | Role |
|--------|------|
| `isFramed()` | True when embedded — a cross-origin `window.top` read throws, and that throw counts as framed |
| `loginViaPopup(context, dispatcherUrl)` | Opens the dispatcher in a popup, adopts the handed-back token; resolves `false` if blocked or closed |
| `handBackOidcToken(token)` | Called by the popup to `postMessage` the token to its opener and close; `false` when not a popup |
| `applyAuthToken(context, token)` | Adopts a token into `AUTH_RESOURCE` + the auth service — the one path both code-exchange and popup handback use |
| `markOidcLoginPopup()` | Records, on the popup's first load, that this window is the popup |
| `isOidcLoginPopup()` | Whether this document is that popup — survives the cross-origin round trip |

These rules make this work, and each one is a real failure when broken:

- **Open the popup synchronously inside the click handler.** `window.open` escapes the popup
  blocker only while the gesture is being handled, so nothing may be awaited first — this is why
  `loginViaPopup` is not `async` and opens the window before returning its promise.
- **The token must be passed back explicitly.** The popup writes to the *first-party* storage
  partition while the framed opener has its own, so the opener cannot see what the popup stored;
  `postMessage` (same-origin, origin pinned — it carries a bearer token) is what bridges them.
- **The popup must recognise itself by `sessionStorage`, not `window.name`.** The name is set by
  `window.open`, but browsers clear it the moment a top-level context navigates cross-origin — and
  this flow leaves for the provider and comes back, so on return the popup looks like an ordinary
  tab, skips the handback, and `navigate()`s: the user ends up staring at a second logged-in copy
  of the app in the popup while the frame stays anonymous. `markOidcLoginPopup()` therefore records
  the fact on the popup's **first** load (the only moment it is knowable) and `isOidcLoginPopup()`
  reads it back afterwards.
- **The identity provider must not send `Cross-Origin-Opener-Policy: same-origin`.** It puts the
  popup in a fresh browsing context group and severs `window.opener` **permanently** — returning to
  the relying party's origin does not restore it — which destroys the only channel home. See the
  `server-oidc-provider` skill; helmet's default is exactly this value.
- **Never auto-open a popup from an effect.** With no gesture it is blocked, so `Dispatcher`
  renders a sign-in button when it is framed and would otherwise redirect.

Unframed behaviour is unchanged: `isFramed()` is false, the click navigates to the dispatcher, and
the classic redirect runs. Nothing here requires weakening helmet or setting `SameSite=None`.

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
