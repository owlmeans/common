---
name: login-plugins
description: How OwlMeans login plugins work — the LoginPlugin contract and its seven stages, cascade selection by LoginEnv (embedded / surrogate), the surrogate window and its own route, the redirect and hand-back flows, the resume fast path, framed logout, preconditions, and wiring sign-in with useLogin/useLogout. Read before touching login wiring, an OIDC dispatcher, or sign-in from an embedded app.
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
different registry with a different job; do not confuse the two. A third question — *which* method
a person picks — is the `login-methods` skill.

The distinction exists because it is real: a redirect to an identity provider works in an ordinary
tab and cannot work inside a frame, and that is a property of the browsing context, not of the
credential.

## Plugins that ship today

| Plugin | Package | Registration | Priority | Applies when |
|--------|---------|--------------|----------|--------------|
| Redirect (default) | `@owlmeans/web-client` | `appendWebLogin(ctx)` | 0 | always |
| Surrogate window | `@owlmeans/web-client` | `appendWebLogin(ctx)` | 100 (`SURROGATE_LOGIN_PRIORITY`) | a DOM exists AND the document is embedded or is itself the surrogate |
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
```

To add a mechanic, register a plugin at a higher priority in your own `makeContext` — the cascade
picks it wherever its `match` is true and falls back to the shipped ones everywhere else.

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
  resume?: (ctx, token, env) => Promise<LoginOutcome> // a token was ALREADY here — place it
  logout?: (ctx, request, env) => Promise<LoginOutcome>      // end it, wherever it lives
  logoutComplete?: (ctx, env) => Promise<LoginOutcome>       // it is gone here — tell whom
}
```

`LoginOutcome` is what the caller acts on: `Handled` (done, do nothing), `Passed` (carry on with
your own continuation), `Redirected` (the browser is leaving — do not render or navigate),
`Gesture` (render a sign-in control; this cannot proceed without a fresh user gesture), `Orphaned`
(authenticated, but with no channel back to the window that started it), `Failed`.

Seven stages; `begin`, `authorize` and `complete` are required and the other four — `enter`,
`resume`, `logout`, `logoutComplete` — are optional, **and an absent one is the ordinary-tab
behaviour**. `resume` absent means `Passed`: keep the session you have and carry on, which is
exactly what an unframed application wants. The redirect plugin therefore omits `enter` and
`resume` while implementing `logout` (revoke locally, then the caller's `navigate` or a full
reload) and `logoutComplete` (`Passed` — the session was cleared in the document that owned it).
Implementing `resume` on the redirect plugin is the one change that would regress every unframed
app.

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

`surrogate` reads `window.name === LOGIN_SURROGATE_NAME` first and falls back to a `sessionStorage`
marker. The marker exists because the flow leaves for the provider and comes back: browsers clear
`window.name` whenever a top-level context goes cross-origin, so by the return leg the name alone
would say "ordinary tab". `markSurrogate()` writes the marker only in a window whose `window.name`
already matches, and must run on the surrogate's FIRST load, while that name is still there;
`clearSurrogate()` removes it once the token has been handed back. Both tolerate storage being
unavailable, which leaves the `window.name` check as the only evidence.

## The surrogate window has its own route

`DISPATCHER_SURROGATE` (`@owlmeans/auth`) at `SURROGATE_PATH` = `/surrogate`
(`@owlmeans/auth-common`), declared in `auth-common`'s shared `entrypoints` list and elevated to the
surrogate screen in **`@owlmeans/web-client`'s own entrypoints**. Three properties, each
load-bearing:

- **Top level, no parent** — so the popup renders outside every application layout. A login window
  showing the application, with its navigation, inside itself is the defect the route exists to
  prevent.
- **No `service`**, unlike `DISPATCHER` — nothing server-side ever addresses it.
- **Elevated in `web-client`, not in a relying party** — the mechanic is "run the login route one
  window up and hand the result back", not an OIDC detail, and every web app already spreads that
  entrypoint list. That is what lets an application which is already deployed gain a working login
  window without editing a line.

**It is never a `redirect_uri`.** The authorization URL's `redirect_uri` is built SERVER-side from
the `DISPATCHER` entrypoint, by `@owlmeans/server-oidc-rp`'s init action, so the provider comes back
to `/dispatcher` whatever page opened the window. That is why a dispatcher ALSO has to render a
surrogate view — `/surrogate` alone cannot cover the return leg — and why adding this route needed
no re-provisioning of any client.

`surrogatePath(ctx, { intent, next?, method? })` builds the address and returns **`null`** when the
entrypoint is absent. That null is the compatibility path for an application built against an older
`auth-common`: the plugin falls back to opening the dispatcher directly, exactly as before. Never
replace it with a throw.

## The six flows

| Situation | What happens |
|---|---|
| Ordinary tab, signing in | redirect plugin: `begin` prefers the caller's in-app `navigate`, else a full load |
| Framed, signing in | surrogate plugin opens `/surrogate?intent=login&next=<dispatcher>` **synchronously**, then waits for a `LOGIN_TOKEN_MESSAGE` |
| Surrogate, no session | forwards to `next` — the dispatcher owns the authorization round trip |
| Surrogate, session already there | `resume` → hand the token back and close. **No provider round trip at all.** |
| Framed, session already there | `resume` → `Passed`; the document simply uses it, and no window opens |
| Framed, signing out | surrogate plugin opens the window FIRST, revokes locally **unconditionally**, then awaits `LOGIN_LOGOUT_MESSAGE` |

## Invariants — each one is a real failure when broken

- **Open any window synchronously inside the user gesture.** `window.open` escapes the popup
  blocker only while the gesture is still being handled. `begin` and `logout` are therefore
  non-async through the whole chain — the facade included — because an `async` method defers the
  body past a microtask and the blocker wins. A **precondition** is synchronous for the same
  reason.
- **The popup NEVER renders the application.** Enforced structurally in two places: the surrogate
  screen is not wrapped in `DispatcherHOC` (so it has no `navigate() → HOME`), and every dispatcher
  checks `env.surrogate` **ahead of every other return**, reading it in the component body rather
  than in an effect so the first paint is already correct.
- **…but the surrogate panel must not mask `choose`.** The guard is `env.surrogate && !choose`, in
  `web-client`'s dispatcher and in `web-oidc-rp`'s (`mui-oidc-rp` has no chooser — it starts the
  authorization itself — so it keeps the bare check). The login chooser is not the application: a
  login window with nothing to return from and nobody signed in has exactly one thing left that can
  move it forward, and that is asking which provider. The surrogate URL is supposed to carry
  `?method=` so the question is already answered, but a window opened from a bare "Log in" — a
  framed application's own header button — has no method to send. With the bare check the popup
  rendered "Signing you in…" **permanently**: the effect had set `choose`, and nothing was ever
  going to start. It reads as a hung backend and is a rendering order bug.
- **The host is a lazy service.** Apps call `appendLogin` from `makeContext`, i.e. at the Loading
  stage, and `context.service()` throws for an uninitialized non-lazy service.
- **Facade methods stay plain writable properties, never getters**, so an alternative
  implementation can monkey-patch them.
- **`enter()` is the first statement of the dispatcher's effect.** Everything after it can navigate
  away, and the evidence it records is gone once that happens.
- **A provider sending `Cross-Origin-Opener-Policy: same-origin` severs `window.opener`
  permanently.** That is why `complete` and `logoutComplete` report `Orphaned` instead of retrying.
- **Never start login from an effect.** Without a gesture the window is blocked; report `Gesture`
  and let the app render a control — which the sign-in screen already is, since every method button
  is a gesture.
- **Adopt a token only through `adopt` / `adoptToken`, and drop one only through `revoke` /
  `revokeToken`.** Each stores the record, decodes the envelope and sets the token in one place;
  writing those by hand drifts. `revokeToken` passes `undefined`, not `null` — `undefined` is the
  declared clearing value.
- **`awaitSurrogate` is the one waiter.** Origin pin, `settled` latch, `closed` poll, teardown on
  every path. Login and logout share it; a second copy is how the two stopped agreeing before.
- **A logout revokes locally even when the popup fails.** Blocked window, severed opener, user
  closing it early — none of them may leave the calling document signed in. A half-done logout is
  bad; one that did not happen at all is worse.

## RP-initiated provider logout is deliberately out of scope

Two blockers, both verified, both recorded here so nobody re-derives them:

1. `@owlmeans/server-oidc-provider` never populates `post_logout_redirect_uris`, and the platform's
   `ensureClient` passes `redirectUris` alone. An `end_session_endpoint` hop would therefore be
   rejected, or would land the popup on the provider's own "signed out" page — which never posts
   back and never closes, so the window simply sits there. That is strictly worse than the bug.
2. The IdP session is shared with the manager and every sibling project of the same organization.
   "Log out of this preview" must not sign the user out of everything.

Local-only logout satisfies the requirement exactly: the two token copies are two IndexedDB records
in two storage partitions of one origin, and clearing both is the whole of it. The seam stays —
a higher-priority plugin can implement `logoutComplete` as an `end_session_endpoint` navigation
once the registration carries a post-logout URI.

## Preconditions

`LoginService.registerPrecondition({ alias, priority?, check })` refuses a flow before any plugin
runs. `check` is **synchronous** and returning false resolves `begin` as `Gesture`.

The one that ships is consent: `requireConsentForLogin` (`@owlmeans/client-iam`, wired from
`appendIam`) refuses until the essential cookie category is granted and opens the consent dialog in
the same gesture. It lives on `begin` rather than on `useLogin`, a screen, or a plugin because
`useLogin` is one of four call sites, and a `LoginPlugin` is *selected* rather than chained — a
"consent plugin" would displace the redirect or surrogate plugin instead of running before it.

## Authoring a plugin

1. Implement `LoginPlugin` in your package, with an `alias`, a `priority` above the one you intend
   to beat, and a `match` that reads `LoginEnv` only.
2. Keep `begin` and `logout` non-async and open any window in their first statement.
3. Export an `appendXLogin(ctx)` that calls `ensureLoginService(ctx)` then `registerPlugin(...)`.
4. Have the app call it in `makeContext` after the base context is built.

## Related

`login-methods` (which methods are offered, and the screen) · `router-plugins` (the same
host/cascade pattern) · `client-auth` · `web-client` · `web-oidc-rp`
