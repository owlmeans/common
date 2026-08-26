---
name: web-oidc-rp
description: How to use @owlmeans/web-oidc-rp — browser OIDC relying party. appendOidcGuard() to wire the guard into a web context; setupOidcGuard() to wire it into module declarations. Auto-invoked when importing web-oidc-rp helpers.
user-invocable: false
---
<!-- AUTO-GENERATED — do not edit. Regenerate via sync-agent-meta. -->

# @owlmeans/web-oidc-rp

**Layer:** Web (React)
**Install:** `"@owlmeans/web-oidc-rp": "^0.1.18-rc.10"` in `dependencies`

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

**Call `setupOidcGuard` exactly once per entrypoint list.** It appends to the list it is given
rather than returning a new one, and it elevates `DISPATCHER_OIDC_INIT`, `DISPATCHER_OIDC` and
`DISPATCHER` — so a second call adds the same entrypoints twice and the elevation throws
`Entrypoint with alias … is already elevated`. An app that wires IAM through
`setupIam` (`@owlmeans/client-iam`) has already made that call and must not repeat it.

## Dispatcher and authorization errors

The `Dispatcher` component is the redirect URI: the provider returns **both** outcomes to it — a
`code` on success and `error` / `error_description` (`OIDC_ERROR_QUERY`, `OIDC_ERROR_DESCRIPTION_QUERY`
from `@owlmeans/oidc`) on failure. It must check for the error params **before** re-entering the
flow and render the message instead: starting authorization again would rebuild the request that
just failed, so the browser bounces between dispatcher and provider forever and the actual reason
never reaches the user. The same rule holds for the MUI dispatcher in `@owlmeans/mui-oidc-rp`.

## Where the round trip runs is not this package's decision

The relying party knows about `code`, `state` and token exchange. *Which browsing context the
authorization round trip can complete in* — an ordinary tab, or one window up because this document
is framed — belongs to the login-plugin host (`@owlmeans/client-auth/login`). See the
`login-plugins` skill for the contract, the shipped plugins and the invariants; none of it is
restated here.

`Dispatcher` therefore drives the flow through `context.login()` and renders off the returned
`LoginOutcome`:

- `context.login().enter()` is the **first statement** of its effect — everything after it can
  navigate away, and the evidence the surrogate flow needs is gone once that happens.
- `authorize(url)` is how the browser reaches the provider — never a direct `window.location`
  assignment. `Gesture` means the flow needs a fresh user gesture, so the component renders a
  sign-in button that replays the current URL through `begin()`.
- `complete(token)` decides where a token issued in *this* document belongs. `Handled` means the
  plugin placed it and nothing more is due; `Orphaned` means the user is authenticated with no
  channel back to the window that started the flow, and the component says so instead of navigating.

`@owlmeans/web-client`'s `makeContext` registers the browser plugins, so a dispatcher works framed
and unframed with nothing extra wired. Adopt an issued token only through `adoptToken` /
`context.login().adopt(token)`.

`isFramed`, `loginViaPopup`, `handBackOidcToken`, `applyAuthToken`, `markOidcLoginPopup` and
`isOidcLoginPopup` are `@deprecated` compatibility exports that delegate to that host, and their
wire values (`OIDC_POPUP_*`) are fixed: a generated target app carries a **copy** of the code that
calls them, so a running project must keep working across a framework upgrade. New code uses
`context.login()` and `useLogin()`.

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
