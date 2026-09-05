---
name: client-auth
description: How to use @owlmeans/client-auth — the browser side of OwlMeans authentication. Root exports the auth service, the shared client entrypoints and the dispatcher HOC; ./manager holds the authentication screen, its control and the plugin registry; ./manager/plugins holds the authentication-plugin contract a plugin package writes against; ./login holds the login-plugin host, the sign-in method registry, the terms confirmation and the useLogin/useLogout hooks. Auto-invoked when importing client-auth helpers, registering an authentication plugin, or wiring a sign-in control.
user-invocable: false
---

# @owlmeans/client-auth

**Layer:** Client
**Install:** `"@owlmeans/client-auth": "^0.1.18-rc.19"` in `dependencies`

Five subpaths, five jobs:

| Subpath | Job |
|---------|-----|
| `.` | The client `AuthService`, the shared auth entrypoints, and the dispatcher HOC |
| `./manager` | The registry's four names plus the authentication screen, control and error — *how* a user proves identity. Importing it registers the three shipped browser plugins and `pluginMethodSource` by side effect |
| `./manager/entrypoints` | The manager application's own front-end entrypoint elevations |
| `./manager/plugins` | The plugin-authoring surface, and a superset of the registry: the `AuthenticationPlugin` contract, `pluginMethodSource`, the wallet-tunnel helpers and the shipped plugin objects — with no registration side effect |
| `./login` | The **login**-plugin host — *where* the authorization round trip runs, and which method a person picks |

A plugin package imports from both, and the split is fixed: `AuthenticationPlugin`,
`AuthMethodMeta`, `pluginMethodSource`, `PinSchema`, `createWalletFacade`,
`TunnelAuthenticationRenderer` and the shipped plugin objects resolve **only** through
`./manager/plugins`; the registry (`plugins`, `registerAuthPlugin`, …) and the rendering types
(`AuthenticationRenderer`, `AuthenticationControl`, `ClientAuthType`, `AuthenticationHOC`) resolve
through `./manager`. Importing the contract from `./manager` gets an unresolvable name.

`./manager/plugins` and `./login` answer different questions and are separate registries. Do not
conflate them.

## Key Exports — root

| Export | Description |
|--------|-------------|
| `makeAuthService(alias?)` | The client `AuthService` — `authenticate(token)`, `update(token)`, `authenticated()`, `user()`, `store()`. Decodes the bearer envelope and persists the record |
| `appendAuthService(ctx, alias?)` | Register it, register `authMiddleware`, and expose `context.auth()` |
| `setupExternalAuthentication(service)` | Point the `CAUTHEN_FLOW_ENTER` entrypoint at a service, so an external provider can redirect into this app |
| `entrypoints` | The shared auth entrypoint list with `DISPATCHER_AUTHEN` elevated |
| `DEFAULT_ALIAS` | `'auth'` — the client-side counterpart of `DEFAULT_GUARD` |
| `AUTH_RESOURCE` | `'auth'` — the resource the token record is stored in |
| `USER_ID` | `'user'` — the id of that single record |
| `DEFAULT_ENTITY` | `'owlmeans'` |
| `DispatcherHOC` | The return-leg HOC. It wraps a `DispatcherRenderer`, hands it `provideToken(token, query)` and `navigate()`, adopts the supplied token through the auth service, and strips `AUTH_QUERY` before navigating on. Reading the return-leg query is the renderer's job — `@owlmeans/web-client` reads `AUTH_QUERY`, `@owlmeans/web-oidc-rp` also reads `OIDC_ERROR_QUERY` and forwards the remaining params |
| `DispatcherProps`, `TDispatcherHOC`, `DispatcherRenderer`, `DispatcherRendererProps` | Dispatcher types |
| `useWs(entrypoint, request?)` | A socket hook that attaches the current token as the `AUTH_QUERY` param |
| `useSelfAuth(force?)` | Whether this context is authenticated; navigates to `DISPATCHER` when it is not and `force` |
| `AuthServiceAppend`, `ClientAuthRecord`, `ClientAuthResource` | Types |

## `./manager` — the authentication screen and the registry

| Export | Description |
|--------|-------------|
| `plugins`, `registerAuthPlugin`, `getAuthPlugin`, `listAuthPlugins` | The module-global registry |
| `AuthenticationHOC`, `AuthenticationProps`, `TAuthenticationHOC` | The screen that hosts a plugin's implementation |
| `makeControl`, `AuthenticationControl`, `AuthenticationControlState` | The control a plugin drives: `requestAllowence`, `authenticate`, and the state it persists across a provider redirect |
| `AuthenticationRenderer`, `AuthenticationRendererProps`, `ClientAuthType`, `ClientAuthenticationMethod`, `AuthenticationCallback` | Rendering contract |
| `TunnelConsumer`, `TunnelAuthenticationProps`, `TunnelAuthCallback` | The wallet-tunnel consumer screen |
| `AuthenCredError` | Thrown when the entered credential cannot be used |

## `./manager/plugins` — the authentication-plugin contract

| Export | Description |
|--------|-------------|
| `AuthenticationPlugin` | `type`, `Implementation`, optional `Renderer`, `requiresRenderer?`, `method?` and the `authenticate` / `beforeAuthenticate` / `afterAuthenticate` hooks |
| `PluginImplemnetation` (sic) | `(Renderer?) => FC<AuthenticationRendererProps>` — the shape of `Implementation` |
| `AuthMethodMeta` | How the plugin presents itself as a sign-in method — see `login-methods` |
| `plugins`, `registerAuthPlugin`, `getAuthPlugin`, `listAuthPlugins` | The same registry as `./manager` |
| `pluginMethodSource` | The `LoginMethodSource` that turns registered plugins into offerable methods |
| `createWalletFacade`, `PinSchema`, `PinForm`, `TunnelAuthenticationRenderer`, `TunnelAuthenticationRendererProps` | Wallet-tunnel helpers a consumer plugin builds on |
| `ed25519BasicUIPlugin`, `reCaptchaPlugin`, `tunnelConsumerUIPlugin` | The shipped plugin objects |

Shipped plugins register themselves by side effect: `basic-ed25519`, `re-captcha` and
`wallet-consumer` when `@owlmeans/client-auth/manager` is imported, OIDC and Google from
`@owlmeans/web-oidc-rp/auth/plugins`, the PK supervisor from `@owlmeans/web-auth`.

## `./login` — the login-plugin host

An `AuthenticationPlugin` answers how a credential is proven; a `LoginPlugin` answers in which
browsing context the round trip can complete at all.

| Export | Description |
|--------|-------------|
| `appendLogin(ctx)` | Register the host and expose it as `context.login()` |
| `makeLoginService(alias?)`, `ensureLoginService(ctx)` | The host itself — a **lazy** service, so `makeContext` can reach it at the Loading stage — and the idempotent getter a plugin package calls before `registerPlugin` |
| `LoginPlugin`, `LoginEnv`, `LoginRequest`, `LogoutRequest`, `LoginOutcome`, `LoginIntent`, `LoginService`, `LoginContext`, `LoginPrecondition` | The contract |
| `registerMethodSource`, `listMethodSources`, `resolveLoginMethods`, `primaryLoginMethod` | Which sign-in methods are offered — see `login-methods` |
| `LoginMethod`, `LoginMethodSource`, `LoginMethodContext` | Method types |
| `resolveTerms`, `termsAccepted`, `acceptTerms`, `ResolvedTerms` | The confirmation, recorded in `localStorage` against a version derived from the resolved URLs |
| `resolveCredit`, `ResolvedCredit` | The credit and copyright line |
| `FallbackLoginScreen`, `LoginScreenProps`, `LoginScreenComponent` | The plain sign-in screen a relying party renders when no UI family registered one |
| `surrogatePath(ctx, target)`, `SurrogateTarget` | Where a surrogate login window opens; `null` on an older entrypoint list |
| `resumeAction(outcome)`, `ResumeAction`, `loginAttemptError(outcome)` | The one reading of a `resume` outcome, and the one reading of a finished attempt |
| `enterOidcAuthorization(model)` | Move a flow to the step that can authorize — idempotent, call it before every `authenticate` |
| `adoptToken(ctx, token)`, `revokeToken(ctx)` | The single adoption and de-adoption paths |
| `useLogin(target?)`, `useLogout(target?)` | Wiring for a sign-in / sign-out control; `target` is the entrypoint alias the flow lands on when it is over |
| `isEmbedded`, `isSurrogate`, `markSurrogate`, `clearSurrogate`, `defaultLoginEnv` | Environment probes the host builds `LoginEnv` from |
| `LOGIN_SERVICE`, `LOGIN_SURROGATE_NAME`, `LOGIN_TOKEN_MESSAGE`, `LOGIN_LOGOUT_MESSAGE`, `LOGIN_SURROGATE_MARKER`, `LOGIN_SURROGATE_FEATURES`, `LOGIN_WATCH_INTERVAL`, `LOGIN_INTENT_QUERY`, `LOGIN_NEXT_QUERY`, `LOGIN_METHOD_QUERY`, `LOGIN_TERMS_STORAGE`, `DEFAULT_LOGIN_PRIORITY`, `DEFAULT_METHOD_ORDER` | Aliases and the fixed cross-document wire values |

```typescript
import { useLogin, useLogout } from '@owlmeans/client-auth/login'

const [loginPath, onLogIn] = useLogin()
const onLogOut = useLogout()
```

Both handlers are deliberately **not** async and await nothing before delegating — a window opened
after the user gesture has finished being handled is eaten by the popup blocker. Each resolves its
entrypoint **inside** the hook, never at module scope — `DISPATCHER` for `useLogin`, the surrogate
path for `useLogout`. A module body runs before `registerEntrypoints`, so `useLogin`'s lookup at
top level throws `Entrypoint dispatcher not found` during import, taking the whole render down.

`target` is an entrypoint alias, and it is what supplies the request's `navigate` continuation —
the in-app step the plugin runs once the round trip is done. `useLogin` always sends one, falling
back to `DISPATCHER`; `useLogout` sends one only when a target is given. Omitting it does not leave
the session behind: the token is revoked either way, and the plugin decides what the document does
with no continuation to run — `@owlmeans/web-client`'s redirect plugin reloads the page, because
cached auth reads only forget a session when the application is rebuilt. `useLogin` returns
`[path, handler]` and `useLogout` a bare handler — a logout control has no address to point at.

Plugin selection, the shipped browser flows and the full invariant list: the `login-plugins` skill.

## Usage

```typescript
import { appendAuthService, setupExternalAuthentication, DEFAULT_ALIAS } from '@owlmeans/client-auth'
import { appendLogin } from '@owlmeans/client-auth/login'

// in makeContext:
appendAuthService(context)             // registers under DEFAULT_ALIAS ('auth')
appendLogin(context)
setupExternalAuthentication(MY_WEB_SERVICE)   // the service alias the provider redirects into
```

`@owlmeans/web-client`'s own `makeContext` already appends the auth service and the login host, so
a web application only calls these when it builds its context by hand.

## Rules

- The bearer token lives in the `AUTH_RESOURCE` resource under the single id `USER_ID`. Read and
  write it through the auth service or through `adoptToken` / `revokeToken`; hand-written storage
  access drifts from the envelope decoding that happens beside it.
- A plugin that persists state across a provider redirect drives the control's own
  `persist()` / `restore()` / `hasPersistentState()` / `cleanUpState()`. They keep the type, stage
  and allowance in the `FLOW_STATE` resource under an id this package owns and does not export —
  restore before submitting the credential, and clean up after.
- The browser ends up holding an ordinary OwlMeans bearer token whichever provider issued the
  login. Product authorization stays server-side, in entrypoint gates and handler checks — never in
  client-only state.
- The organization entity a token names is its `entitySlug`, the renameable public name. Read it
  with `entitySlugOf` from `@owlmeans/auth`; the stable `entityId` never reaches the browser.

## Depends On

- `@owlmeans/auth`, `@owlmeans/auth-common` — types, aliases, `authMiddleware`
- `@owlmeans/client`, `@owlmeans/client-context`, `@owlmeans/client-entrypoint`, `@owlmeans/client-socket`
- `@owlmeans/config` — the login screen, terms and credit configuration
- `@owlmeans/basic-envelope` — decoding the bearer envelope
- `react` (peer)
- `ajv` (peer) — `PinSchema` is typed as `JSONSchemaType<PinForm>`
