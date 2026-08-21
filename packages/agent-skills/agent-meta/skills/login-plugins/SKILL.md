---
name: login-plugins
description: How OwlMeans login plugins work — the LoginPlugin contract, cascade selection by LoginEnv (embedded / surrogate), the redirect and surrogate-window flows, wiring sign-in with useLogin/useLogout, and authoring a new plugin. Read before touching login wiring, an OIDC dispatcher, or sign-in from an embedded app.
user-invocable: false
metadata:
  scope: general
---
<!-- AUTO-GENERATED — do not edit. Regenerate via sync-agent-meta. -->

# OwlMeans login plugins

Signing in is pluggable. `@owlmeans/client-auth/login` is a **host**: it defines the `LoginService`
facade and holds a registry of `LoginPlugin`s, selecting the active one by **cascade**. A plugin
answers *where the authorization round trip runs* — not how a user proves identity. That second
question belongs to `AuthenticationPlugin` (`@owlmeans/client-auth/manager/plugins`), which is a
different registry with a different job; do not confuse the two.

The distinction exists because it is real: a redirect to an identity provider works in an ordinary
tab and cannot work inside a frame, and that is a property of the browsing context, not of the
credential.

## Plugins that ship today

| Plugin | Package | Registration | Priority | Applies when |
|--------|---------|--------------|----------|--------------|
| Redirect (default) | `@owlmeans/web-client` | `appendWebLogin(ctx)` | 0 | always |
| Surrogate window | `@owlmeans/web-client` | `appendWebLogin(ctx)` | 100 | embedded, or in the surrogate itself |
| Native in-app browser | *(future)* | native app wiring | — | `match: env => !env.hasWindow` |
| Silent refresh | *(future)* | higher-priority opt-in | >100 | an existing session can be renewed |

## Wiring sign-in in an app

`@owlmeans/web-client`'s `makeContext` calls `appendWebLogin`, so every web app — and every app
built on `web-panel` or `mui-panel` — has working login, including a framed one, without
registering anything.

A control renders one handler and makes no decisions:

```typescript
import { useLogin, useLogout } from '@owlmeans/client-iam'

const [, onLogIn] = useLogin()
const onLogOut = useLogout()

// <a onClick={onLogIn}>Login</a>
```

To add a mechanic, register a plugin at a higher priority in your own `makeContext` — the cascade
picks it wherever its `match` is true and falls back to the shipped ones everywhere else:

```typescript
import { makeContext as makeBase } from '@owlmeans/web-panel'

export const makeContext = (cfg) => {
  const context = makeBase(cfg)
  context.login().registerPlugin(makeMyLoginPlugin())
  return context
}
```

## The LoginPlugin contract

```typescript
interface LoginPlugin {
  alias: string
  priority?: number                                   // higher wins; default 0
  mode?: string                                       // 'redirect' | 'surrogate' | 'native'
  match?: (env: LoginEnv, ctx?: LoginContext) => boolean   // undefined = always applicable

  enter?: (ctx, env) => void                          // record what is knowable, before navigating
  begin: (ctx, request, env) => Promise<LoginOutcome> // start from a user gesture
  authorize: (ctx, url, env) => Promise<LoginOutcome> // go to the provider
  complete: (ctx, token, env) => Promise<LoginOutcome>// a token was issued here — place it
}
```

`LoginOutcome` is what the caller acts on: `Handled` (done, do nothing), `Passed` (carry on with
your own continuation), `Redirected` (the browser is leaving — do not render or navigate),
`Gesture` (render a sign-in control; this cannot proceed without a fresh user gesture), `Orphaned`
(authenticated, but with no channel back to the window that started it), `Failed`.

## LoginEnv drives selection

```typescript
interface LoginEnv {
  hasWindow: boolean   // a DOM exists at all (false under SSR, native, tests)
  embedded: boolean    // this document is in a frame
  surrogate: boolean   // this document IS the login window opened one level up
  hasOpener: boolean   // the window that opened this one is still reachable
}
```

This is the single source of environment truth. **Never probe `window` inside a `match`** — a
non-DOM host supplies its own descriptor so the same plugins can be driven from a native shell.

`surrogate` is recorded in `sessionStorage`, not read from `window.name`, because the flow leaves
for the provider and comes back: browsers clear `window.name` whenever a top-level context goes
cross-origin, so by the time the provider redirects back the name is gone.

## Invariants — each one is a real failure when broken

- **Open any window synchronously inside the user gesture.** `window.open` escapes the popup
  blocker only while the gesture is still being handled. `begin` is therefore non-async through the
  whole chain — the facade included — because an `async` method defers the body past a microtask
  and the blocker wins.
- **The host is a lazy service.** Apps call `appendLogin` from `makeContext`, i.e. at the Loading
  stage, and `context.service()` throws for an uninitialized non-lazy service.
- **Facade methods stay plain writable properties, never getters**, so an alternative
  implementation can monkey-patch them.
- **`enter()` is the first statement of the dispatcher's effect.** Everything after it can navigate
  away, and the evidence it records is gone once that happens.
- **A provider sending `Cross-Origin-Opener-Policy: same-origin` severs `window.opener`
  permanently.** That is why `complete` reports `Orphaned` instead of retrying.
- **Never start login from an effect.** Without a gesture the window is blocked; report `Gesture`
  and let the app render a control.
- **Adopt a token only through `adopt` / `adoptToken`.** It stores the record, decodes the envelope
  and sets the token in one place; writing those by hand drifts.

## Authoring a plugin

1. Implement `LoginPlugin` in your package, with an `alias`, a `priority` above the one you intend
   to beat, and a `match` that reads `LoginEnv` only.
2. Keep `begin` non-async and open any window in its first statement.
3. Export an `appendXLogin(ctx)` that calls `ensureLoginService(ctx)` then `registerPlugin(...)`.
4. Have the app call it in `makeContext` after the base context is built.

## Related

`router-plugins` (the same host/cascade pattern) · `client-auth` · `web-client` · `web-oidc-rp`
