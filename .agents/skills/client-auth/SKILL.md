---
name: client-auth
description: How to use @owlmeans/client-auth — client-side auth manager and UI components, setupExternalAuthentication() to wire OAuth/OIDC flows. Auto-invoked when importing client-auth helpers or registering external authentication.
user-invocable: false
---

# @owlmeans/client-auth

**Layer:** Client
**Install:** `"@owlmeans/client-auth": "^0.1.2"` in `dependencies`

## Key Exports

| Export | Description |
|--------|-------------|
| `setupExternalAuthentication(alias)` | Register OAuth/OIDC external auth flow module |
| Auth components | Login UI primitives |
| Auth service | Client-side auth manager service |
| Modules | Auth module declarations |
| Constants | Auth aliases (re-exports `AUTH_API`) |

## Subpath Exports

- `./manager` — client-side auth manager
- `./manager/modules` — manager module declarations
- `./manager/plugins` — pluggable token providers (**how** a user proves identity)
- `./login` — the login-plugin host (**where** the authorization round trip runs)

## Usage

```typescript
import { setupExternalAuthentication } from '@owlmeans/client-auth'

setupExternalAuthentication(AUTH_WEB) // alias of the web auth service
```

## `./login` — the login-plugin host

A separate registry from `./manager/plugins`, with a different question: an `AuthenticationPlugin`
answers how a credential is proven, a `LoginPlugin` answers in which browsing context the round trip
can complete at all. Do not conflate them.

| Export | Description |
|--------|-------------|
| `appendLogin(ctx)` | Register the host and expose it as `context.login()` |
| `ensureLoginService(ctx)` | Idempotently obtain the host — what a plugin package calls before `registerPlugin` |
| `makeLoginService(alias?)` | The host itself: a **lazy** service, so `makeContext` can reach it at the Loading stage |
| `LoginPlugin`, `LoginEnv`, `LoginRequest`, `LoginOutcome`, `LoginService` | The contract |
| `adoptToken(ctx, token)` | The single path an issued bearer token becomes this context's authentication |
| `useLogin(target?)`, `useLogout()` | Wiring for a sign-in / sign-out control |
| `isEmbedded`, `isSurrogate`, `markSurrogate`, `clearSurrogate`, `defaultLoginEnv` | Environment probes the host builds `LoginEnv` from |
| `LOGIN_SERVICE`, `LOGIN_SURROGATE_NAME`, `LOGIN_TOKEN_MESSAGE`, `LOGIN_SURROGATE_MARKER`, … | Aliases and the fixed cross-document wire values |

```typescript
import { useLogin, useLogout } from '@owlmeans/client-auth/login'

const [loginPath, onLogIn] = useLogin()
const onLogOut = useLogout()
```

`useLogin`'s handler is deliberately **not** async and awaits nothing before delegating — a window
opened after the user gesture has finished being handled is eaten by the popup blocker. It resolves
the `DISPATCHER` entrypoint **inside** the hook, never at module scope: a module body runs before
`registerEntrypoints`, and a top-level lookup throws `Entrypoint dispatcher not found` during import,
taking the whole render down.

Plugin selection, the shipped browser flows and the full invariant list: the `login-plugins` skill.

## Product-Viable Usage Notes

- The manager web app imports `DEFAULT_ALIAS` from `@owlmeans/client-auth` as the client-side equivalent of `DEFAULT_GUARD`.
- It imports `@owlmeans/web-oidc-rp/auth/plugins` for side effects; that registers OIDC and Google authentication plugins in the client auth manager.
- During Google/OIDC redirects, plugins persist the client auth control state, restore it on return, then submit `AuthCredentials` to the server auth flow.
- The browser receives and stores a normal OwlMeans bearer token. Product authorization remains server-side through module gates and handler checks, not through client-only state.

## Depends On

- `@owlmeans/auth`, `@owlmeans/auth-common`
- `@owlmeans/client-context`, `@owlmeans/client-entrypoint`
- `react` (peer)
