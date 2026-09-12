---
name: web-oidc-rp
description: How to use @owlmeans/web-oidc-rp — the browser OIDC relying party — appendOidcGuard and oidcEntrypoints, the dispatcher screen and its login outcomes, the provider-derived sign-in methods, and building URLs with entrypoint.url(). Auto-invoked when importing web-oidc-rp helpers or working on a browser sign-in flow.
user-invocable: false
---
<!-- AUTO-GENERATED — do not edit. Regenerate via sync-agent-meta. -->

# @owlmeans/web-oidc-rp

**Layer:** Web (React)
**Install:** `"@owlmeans/web-oidc-rp": "^0.1.18-rc.34"` in `dependencies`

## Key Exports

| Export | Description |
|--------|-------------|
| `appendOidcGuard<C, T>(context, opts?)` | Registers the OIDC auth service and guard on a web context, and registers the configured providers as sign-in methods |
| `oidcEntrypoints(dispatcherProps?)` | Browser-local bindings for shared OIDC protocols and the `DISPATCHER` screen |
| `makeOidcAuthService(alias?)` | The relying-party service factory |
| `OidcAuthService` | `dispatch(params)`, `authenticate(flow, params)`, `proceedToRedirectUrl(extras)` |
| `DEFAULT_ALIAS` | `'oidc-rp'` — the service alias |
| `Dispatcher` | The redirect-URI screen bound by `oidcEntrypoints`; render it directly only in a custom binding list |
| `oidcMethodSource` | The `LoginMethodSource` that turns configured providers into sign-in methods. `appendOidcGuard` registers it |
| `OIDC_LOGIN_METHOD` | `'oidc'` — the id of the single generic method offered when no provider is configured |
| `OidcAuthPurposes` | `Unknown` / `Subscribe` / `Login` — what a redirect round trip is for |
| `OidcAuthRedirectExtras`, `OidcPostAuthPayload`, `OidcInteraction` | The flow payload shapes |
| `Config`, `Context` | `AppConfig`/`AppContext` carrying `cfg.oidc` |

### Subpath exports

- `./auth/plugins` — importing it registers both `OIDC_CLIENT_AUTH` and `GOOGLE_CLIENT_AUTH` into the
  `@owlmeans/client-auth` manager plugin registry

## Wiring

```typescript
import { appendOidcGuard } from '@owlmeans/web-oidc-rp'

export const makeContext = <C extends Config, T extends Context<C>>(cfg: C): T => {
  const context = makeBasicContext<C, T>(cfg)
  appendOidcGuard<C, T>(context)
  return context
}
```

```typescript
import { oidcEntrypoints } from '@owlmeans/web-oidc-rp'

export const appEntrypoints = [
  ...bindAll(protocols.api),
  ...bindScreen(protocols.web.home, handler(Home)),
  ...oidcEntrypoints({ payload: { simplified: true } }),
]
```

The third argument is the dispatcher's default props (`Partial<ParametrisedProps>` from
`@owlmeans/web-client`); its `payload` merges under whatever the route supplies, so a route-level
value wins. Pass it only to parametrise
the screen — omit it and the plain `Dispatcher` is attached.

`oidcEntrypoints()` returns bindings, not declarations: spread it once into the browser's immutable
entrypoint list. Its `dispatcherProps` argument parametrises only the dispatcher screen. The shared
OIDC protocols stay in the tree from `@owlmeans/oidc`; do not reconstruct or append them in the
browser entrypoint list.

## Sign-in methods come from the provider list

`appendOidcGuard` registers `oidcMethodSource` on the context's login service, so every offerable
provider in `cfg.oidc.providers` becomes a method on the sign-in screen — id `oidc:<entityId ?? service
?? clientId>`, `label`, `icon` and `order` read from the descriptor, and `def: true` promoted to the
primary emphasis. `restrictedProviders` is honoured exactly as the server honours it, and `internal`
or `hidden` providers are never offered.

When the configuration names **no** provider — the ordinary case for a generated application, whose
browser is never sent a provider list — the source still yields one generic method,
`OIDC_LOGIN_METHOD`, and the server's own default-provider selection decides which issuer it reaches.
So an empty provider list is not a broken sign-in screen, and the source must never return an empty
list.

Starting a method that cannot produce an authorization URL throws `FlowStepMissconfigured` rather
than reporting success: a sign-in button that silently does nothing is the failure this prevents.

## Dispatcher and authorization errors

The `Dispatcher` component is the redirect URI: the provider returns **both** outcomes to it — a
`code` on success and `error` / `error_description` (`OIDC_ERROR_QUERY`, `OIDC_ERROR_DESCRIPTION_QUERY`
from `@owlmeans/oidc`) on failure. It must check for the error params **before** re-entering the
flow and render the message instead: starting authorization again would rebuild the request that just
failed, so the browser bounces between dispatcher and provider forever and the actual reason never
reaches the user. The same rule holds for the MUI dispatcher in `@owlmeans/mui-oidc-rp`.

The exchange is also guarded against re-entry, because it is not repeatable: the PKCE verifier is
deleted on its first successful read and the authorization code is single-use at the provider, so a
second run of the same effect fails with `resource:unknown-record` even though the first succeeded.

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
  assignment. `Gesture` means the flow needs a fresh user gesture, so the component renders the
  sign-in chooser, whose method buttons are that gesture.
- `complete(token)` decides where a token issued in *this* document belongs. `Handled` means the
  plugin placed it and nothing more is due; `Orphaned` means the user is authenticated with no
  channel back to the window that started the flow, and the component says so instead of navigating.
- A surrogate window never renders the application. The one exception is the chooser: when nothing
  arrived to return from and nobody is signed in, asking which provider is the only thing that can
  move the flow forward, and a "signing you in…" panel over that state waits forever.

`@owlmeans/web-client`'s `makeContext` registers the browser plugins, so a dispatcher works framed
and unframed with nothing extra wired. Adopt an issued token only through `adoptToken` /
`context.login().adopt(token)`.

`isFramed`, `loginViaPopup`, `handBackOidcToken`, `applyAuthToken`, `markOidcLoginPopup` and
`isOidcLoginPopup` are `@deprecated` compatibility exports that delegate to that host, and their wire
values (`OIDC_POPUP_*`, re-exported from the `LOGIN_*` names) are fixed: a generated target app
carries a **copy** of the code that calls them, so a running project must keep working across a
framework upgrade. New code uses `context.login()` and `useLogin()`.

## Building URLs

Use the entrypoint's own `url()` — never `window.location.origin + window.location.pathname`
concatenation, and never a hand-built query string:

```typescript
// Use the shared protocol declarations already registered by the application.
const home = await context.entrypoint(appEntrypoints.web.home).url(undefined, { absolute: true })
const typed = await context.entrypoint(appEntrypoints.web.detail)
  .url({ params }, { absolute: true })
```

`url(req?, opts?)` fills the `:params` in and appends the query. It is already absolute when the
route belongs to another service; `{ absolute: true }` forces it otherwise. `path()` gives the
in-application path alone, which is what a same-document redirect target wants. `call()` performs the
round trip and resolves to the value; `invoke()` resolves to value **and** outcome, for the rare
caller that branches on it.

## Rules

- Product authorization is never encoded in a browser OIDC plugin. Server-side entrypoint gates and
  local identity profiles remain the authorization source.
- The `oidc-client-ts` `UserManager` path (fully browser-side OIDC) is an **incomplete stub**. The
  production flow is the server-side token exchange over `DISPATCHER_OIDC_INIT` / `DISPATCHER_OIDC`.
- This package owns its private shadcn progress primitive and imports it through relative
  specifiers. A consuming application adds an `@source` for
  `node_modules/@owlmeans/web-oidc-rp/src`; its own `@` alias never supplies package files.

## Depends On

- `@owlmeans/oidc`, `@owlmeans/web-client`, `@owlmeans/client`, `@owlmeans/client-auth`,
  `@owlmeans/client-flow`, `@owlmeans/web-flow`, `@owlmeans/flow`, `@owlmeans/client-i18n`,
  `@owlmeans/auth`, `@owlmeans/basic-envelope`, `@owlmeans/context`, `@owlmeans/entrypoint`,
  `@owlmeans/resource`
- `oidc-client-ts@3.5.0` (exact) — see [[oidc-versions]]
- `react`, `lucide-react`, `tailwindcss` and the shadcn peer set (peer)
