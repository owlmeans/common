---
name: mui-oidc-rp
description: "How to use @owlmeans/mui-oidc-rp — the LEGACY MUI browser OIDC relying party: appendOidcGuard, setupOidcGuard, the OidcAuthService round trip and the Dispatcher screen, plus the OIDC and Google client-auth plugins. Superseded by @owlmeans/web-oidc-rp (or @owlmeans/client-iam) for new work. Auto-invoked when maintaining an app that already imports mui-oidc-rp or migrating one off it."
user-invocable: false
---

# @owlmeans/mui-oidc-rp

**Layer:** Web (React)
**Install:** `"@owlmeans/mui-oidc-rp": "^0.1.18-rc.24"` in `dependencies`

## This is the legacy relying party

**`@owlmeans/web-oidc-rp` is the current browser OIDC relying party**, and `@owlmeans/client-iam`
wraps it in one call (`appendIam`, `setupIam`) that also installs the consent-before-sign-in
precondition. Use those for new work. This package is the MUI-family predecessor, kept for the
applications already built on `@owlmeans/mui-panel`.

The two are wire-compatible: same guard aliases, same dispatcher entrypoints, same
`@owlmeans/oidc` constants, same server side. The difference is behavioural, not cosmetic — **this
dispatcher starts the authorization itself and never defers to a method chooser**, where the current
one offers the sign-in method screen.

The MUI in the name is only the two client-auth plugins behind `./auth/plugins` — the OIDC one and
the Google one, each rendering a `LinearProgress`. The `Dispatcher` itself imports no MUI at all —
plain `<div>`/`<button>` plus `LoginSurrogateView` from `@owlmeans/web-client`, the same primitives
the current dispatcher uses.

**Migrating is more than swapping a screen.** `@owlmeans/web-oidc-rp`'s `appendOidcGuard` also calls
`ensureLoginService(ctx).registerMethodSource(oidcMethodSource)`, which is what puts the configured
identity providers in front of the method chooser — without that registration the chooser has
nothing to offer. That package additionally exports `OIDC_LOGIN_METHOD` and the surrogate-window
constants (`OIDC_POPUP_NAME`, `OIDC_POPUP_TOKEN`, `OIDC_POPUP_FEATURES`, `OIDC_POPUP_MARKER`,
`OIDC_POPUP_WATCH_INTERVAL`, re-exported under their original names from
`@owlmeans/client-auth/login`), which have no counterpart here.

## Key Exports

| Export | Description |
|--------|-------------|
| `appendOidcGuard<C, T>(context, opts?)` | Registers `OidcAuthService` and the OIDC guard on a web context |
| `setupOidcGuard(entrypoints, coguards?, extras?)` | Attaches the guard to the declarations and elevates the three dispatcher entrypoints |
| `makeOidcAuthService(alias?)` | The browser auth service — `dispatch`, `authenticate`, `proceedToRedirectUrl` |
| `Dispatcher` | The redirect-URI screen, wrapped in `DispatcherHOC` |
| `OidcAuthService` / `OidcAuthRedirectExtras` / `OidcPostAuthPayload` / `OidcInteraction` | The service and payload shapes |
| `OidcAuthPurposes` | `Unknown` / `Subscribe` / `Login` — what the round trip is for |
| `DEFAULT_ALIAS` | `'oidc-rp'`, the service alias |

## Subpath Exports

- `./auth/plugins` — imported **for its side effects**: it registers `OIDC_CLIENT_AUTH` and
  `GOOGLE_CLIENT_AUTH` into the shared plugin registry of `@owlmeans/client-auth/manager`. The
  registry is a module singleton, so importing this alongside another family's plugins replaces
  entries rather than merging them.

## Wiring

```typescript
import { makeContext as makeBasicContext } from '@owlmeans/mui-panel'
import { appendOidcGuard, setupOidcGuard } from '@owlmeans/mui-oidc-rp'

export const makeContext = <C extends Config, T extends Context<C>>(cfg: C): T => {
  const context = makeBasicContext<C, T>(cfg) as T
  appendOidcGuard<C, T>(context)
  return context
}

setupOidcGuard(entrypoints, undefined, { payload: { simplified: 'true' } })
```

**Call `setupOidcGuard` exactly once per entrypoint list.** It mutates the list it is given rather
than returning a new one, and it elevates `DISPATCHER_OIDC_INIT`, `DISPATCHER_OIDC` and
`DISPATCHER`. A second call re-runs all of that over the same aliases, so the dispatcher screen an
app carefully parametrised is silently replaced by the one from the later call.

`coguards` composes the OIDC guard with another guard alias. `extras` parametrises the dispatcher
component; its `payload` is merged into the flow payload the dispatcher carries onward.

**The simplified-flow flag is the string `'true'`, never the boolean.** `OidcAuthRedirectExtras`
declares `simplified?: string`, and the service tests `flow.payload().simplified === 'true'` before
it appends `&simplified=true` to the provider URL. `FlowPayload` accepts booleans too, so
`{ simplified: true }` compiles and then never matches — the simplified flow is silently off with
no error anywhere. `@owlmeans/web-oidc-rp` and `@owlmeans/web-oidc-provider` compare the same way.

## The round trip

Three service methods, in the order the browser meets them:

1. **`authenticate(flow, params)`** — only acts when the flow is `STD_OIDC_FLOW` at the
   `OidcAuthStep.Ephemeral` step and an organization entity is known (from `params.entity` or the
   flow's own `entityId`); otherwise it answers `null`. It calls `DISPATCHER_OIDC_INIT` on the
   server, gets the provider URL back, **stores that URL in the auth store** under a fixed key, and
   returns it for the caller to navigate to.
2. The provider returns the browser to the `DISPATCHER` entrypoint — the redirect URI.
3. **`dispatch(params)`** — returns `false` immediately when the query carries no `OIDC_CODE_QUERY`.
   Otherwise it reads the stored `authUrl` back, posts the whole query to `DISPATCHER_OIDC`, and on
   a non-empty token calls `adoptToken`. **The browser starts the login; the server exchanges the
   provider code, links the local identity and returns an ordinary bearer token** — no product
   authorization is decided here, it stays server-side in entrypoint gates and profile scopes.

`proceedToRedirectUrl(extras)` drives the flow model forward instead, for the surfaces that hand
the user onward through the flow rather than straight to the provider.

## Gotchas

- **The provider reports failure by redirecting BACK to the dispatcher with `error` set.**
  `OIDC_ERROR_QUERY` / `OIDC_ERROR_DESCRIPTION_QUERY` (from `@owlmeans/oidc`) must be checked
  **before** re-entering the flow. Re-entering rebuilds the authorization request that just failed,
  so the browser bounces between dispatcher and provider forever and the real reason never reaches
  the user. The `Dispatcher` here does that check first and renders the message; keep it that way in
  any replacement.
- **`context.login().enter()` is the first statement in the dispatcher's effect, on purpose.**
  Everything after it can navigate the window to the provider, and once that happens the evidence of
  what this window was is gone.
- **The environment is read in the component body, not in an effect.** `window.name` is set before
  the document loads and `sessionStorage` carries the marker across the provider round trip, so the
  answer is already right at first paint — reading it in an effect flashes the application inside a
  surrogate window before the effect corrects it.
- **A surrogate window never renders the application**, whatever else is true; that branch is
  checked ahead of every other return. Where the round trip actually runs — same tab, popup, framed
  logout — is not this package's decision: it belongs to the login plugin the framework selected.
- **The dispatcher's effect has no once-only guard.** It is keyed `[client, error]`, and `client`
  comes from `useFlow`, which builds a fresh `FlowClient` whenever its own inputs re-resolve — so the
  effect can run more than once for one page. The PKCE verifier and the authorization code are
  single-use, so a second run repeats an exchange that can only fail. `@owlmeans/web-oidc-rp` carries
  a `dispatchedRef` for exactly this; if a maintained app hits a spurious dispatch failure here, that
  is the shape of it.
- **`dispatchClientOnly` is unfinished.** It stops at the redirect to the provider because a
  browser-only implementation needs integrated cryptography over TLS, and its `client_id` is empty.
  Do not wire it into an application.
- `oidc-client-ts` is pinned exactly (`3.5.0`), like every other OIDC dependency in the framework —
  bump it only through the version-upgrade checklist.

## Depends On

- `@owlmeans/oidc` — the guard, the dispatcher entrypoint aliases, the query-parameter constants
- `@owlmeans/web-client` — the context, plus `elevate` and `parametriseDispatcher`
- `@mui/material` (`^7`) and `react` — **peer** dependencies; the host application supplies both.
  This package does not depend on `@owlmeans/mui-panel`; it only renders comfortably beside it
- `@owlmeans/client-auth` — `DispatcherHOC`, the plugin registry, `adoptToken`
- `@owlmeans/client-flow` / `@owlmeans/web-flow` / `@owlmeans/flow` — the flow model the round trip
  advances
- `@owlmeans/basic-envelope` — opening the signed challenge the Google plugin receives

## Related

- `web-oidc-rp` — **the current relying party**; read it for anything new
- `iam` and the `client-iam` one-call wiring — how an application wires sign-in today
- `login-plugins` (WHERE the round trip runs) and `login-methods` (WHICH method is offered) — read
  both before touching any dispatcher
- `mui-panel` — the legacy panel family this one belongs to
- `oidc-versions` — the exact-pin policy for `oidc-client-ts` and its siblings
