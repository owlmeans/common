# @owlmeans/client-auth

The browser side of OwlMeans authentication: the client `AuthService` that holds the bearer token,
the dispatcher HOC that handles the authentication return leg, the authentication-plugin registry
and screen (`./manager`), and the login-plugin host with its sign-in method registry, terms
confirmation and `useLogin` / `useLogout` hooks (`./login`). A web app normally gets the auth
service and the login host from `@owlmeans/web-client`'s `makeContext`, and the styled sign-in
screen from `@owlmeans/web-panel`. It imports this package for the hooks, the dispatcher contract
and plugin authoring. The OIDC relying party is `@owlmeans/web-oidc-rp` (`@owlmeans/mui-oidc-rp` is
legacy). The server-side counterpart is `@owlmeans/server-auth`.

## Installation

```bash
bun add @owlmeans/client-auth@^0.1.18-rc.45
```

## Concepts

- **Auth service** — `context.auth()`. The token lives in the `AUTH_RESOURCE` resource under the
  single id `USER_ID`. `authenticated()` resolves to the token or `null`, `user()` returns the
  decoded `Auth` (throwing `AuthorizationError` when there is none), and `update(token | undefined)`
  adopts or drops a session.
- **Dispatcher** — `DispatcherHOC` wraps a renderer that reads the return-leg query. It hands the
  renderer `provideToken(token, query)` and `navigate()`, adopts the token, and strips `AUTH_QUERY`
  before navigating on.
- **Authentication plugin** (`./manager/plugins`) — *how* a person proves identity: `type`,
  `Implementation`, an optional `Renderer` a UI package supplies, and `method` metadata when it is
  offered on the sign-in screen.
- **Login plugin** (`./login`) — *where* the round trip runs. Plugins are selected by `LoginEnv`
  (embedded, surrogate) and priority. `@owlmeans/web-client` registers the redirect and surrogate
  plugins.
- **Login method** — one offerable button. `LoginMethodSource`s produce candidates;
  `resolveLoginMethods` drops restricted ones the config did not name and applies the configured
  order.
- **Login outcome** — `LoginOutcome` (`Handled`, `Passed`, `Redirected`, `Gesture`, `Orphaned`,
  `Failed`) tells the caller what to do next. `resumeAction` and `loginAttemptError` are the only
  readings of it.

## Usage

### 1. A context built by hand

`@owlmeans/web-client`'s `makeContext` already does this. Only a context composed without it
registers the pieces itself.

```ts
import { makeClientContext } from '@owlmeans/client'
import { appendAuthService, bindExternalAuthentication, entrypoints as authEntrypoints } from '@owlmeans/client-auth'
import { appendLogin } from '@owlmeans/client-auth/login'
import { MY_APP_WEB } from 'my-app-common'
import type { Config, Context } from './types.js'

export const makeContext = <C extends Config, T extends Context<C>>(cfg: C): T => {
  const context = makeClientContext(cfg) as T
  appendAuthService<C, T>(context)   // registers under DEFAULT_ALIAS ('auth'), exposes context.auth()
  appendLogin<C, T>(context)         // registers the login host, exposes context.login()

  return context
}

export const clientBindings = [
  ...authEntrypoints,
  // The screen an external provider redirects into, pinned to this app's service.
  bindExternalAuthentication(MY_APP_WEB),
]
```

### 2. Guarding a layout and reading the identity

```tsx
import { entitySlugOf } from '@owlmeans/auth'
import { useSelfAuth } from '@owlmeans/client-auth'
import type { FC, PropsWithChildren } from 'react'
import { useContext } from '../context.js'

export const UserLayout: FC<PropsWithChildren> = ({ children }) => {
  // `true` navigates to DISPATCHER when there is no session.
  const authenticated = useSelfAuth(true)
  const context = useContext()

  if (!authenticated) {
    return null
  }

  const auth = context.auth().user()
  // The organization is its renameable entitySlug; the stable entityId never reaches the browser.
  const organization = entitySlugOf(auth)

  return <main data-organization={organization}>{children}</main>
}
```

### 3. Sign-in and sign-out controls

```tsx
import type { FC } from 'react'
import { useLogin, useLogout } from '@owlmeans/client-auth/login'

export const HeaderActions: FC<{ authenticated: boolean | null }> = ({ authenticated }) => {
  const [loginPath, onLogIn] = useLogin()
  const onLogOut = useLogout()

  if (authenticated == null) {
    return null
  }

  return authenticated
    ? <button type="button" onClick={onLogOut}>Log out</button>
    : <a href={loginPath} onClick={onLogIn}>Log in</a>
}
```

One control and one handler, with no conditions around them. The login service decides whether the
flow redirects this tab or runs one window up, because the app is framed.

### 4. Offering a sign-in method and gating the flow

```ts
import { ensureLoginService, LoginOutcome } from '@owlmeans/client-auth/login'
import type { LoginMethodSource, LoginPrecondition } from '@owlmeans/client-auth/login'

const partnerMethods: LoginMethodSource = {
  alias: 'my-app-partner-methods',
  list: () => [{
    id: 'partner-sso',
    label: 'Partner SSO',
    i18nKey: 'partner',
    icon: 'building',
    order: 20,
    // Callable synchronously from the click: leave before the first await.
    start: () => {
      window.location.href = partnerAuthorizeUrl()

      return Promise.resolve(LoginOutcome.Redirected)
    },
  }],
}

const maintenanceWindow: LoginPrecondition = {
  alias: 'my-app-maintenance',
  // Synchronous by contract — a precondition that asks a server belongs elsewhere.
  check: () => !isMaintenanceBannerOpen(),
}

export const appendPartnerLogin = <C extends Config, T extends Context<C>>(context: T): T => {
  const login = ensureLoginService(context)
  login.registerMethodSource(partnerMethods)
  login.registerPrecondition(maintenanceWindow)

  return context
}
```

### 5. Authoring an authentication plugin

```tsx
import { AuthenticationStage } from '@owlmeans/auth'
import type { AuthenticationRendererProps } from '@owlmeans/client-auth/manager'
import { registerAuthPlugin } from '@owlmeans/client-auth/manager/plugins'
import type { AuthenticationPlugin } from '@owlmeans/client-auth/manager/plugins'
import { useEffect } from 'react'

const MY_APP_PASSKEY = 'my-app-passkey'

export const passkeyPlugin: AuthenticationPlugin = {
  type: MY_APP_PASSKEY,
  method: { label: 'Passkey', icon: 'key', order: 50 },
  // The form comes from a UI package; without one the screen must not offer the method.
  requiresRenderer: true,
  Implementation: Renderer => ({ type, stage, control, params }: AuthenticationRendererProps) => {
    useEffect(() => {
      if (control.stage === AuthenticationStage.Init) {
        void control.requestAllowence()
      }
    }, [type])

    if (Renderer == null) {
      throw new SyntaxError(`Renderer is not defined for ${MY_APP_PASSKEY}`)
    }

    return <Renderer type={type} stage={stage} control={control} params={params} />
  },
}

registerAuthPlugin(passkeyPlugin)
```

A UI package then assigns `plugins[MY_APP_PASSKEY].Renderer`, and the renderer calls
`control.authenticate({ userId, credential })` once the person has answered the challenge.

## API

### `@owlmeans/client-auth`

| Symbol | Kind | Purpose |
|---|---|---|
| `makeAuthService(alias?)` | function | The client `AuthService` — `authenticate`, `update`, `authenticated`, `user`, `store` |
| `appendAuthService(ctx, alias?)` | function | Register it and `authMiddleware`; expose `context.auth()` |
| `entrypoints` | const | `[bind(authProtocols.dispatcherAuthenticate)]` |
| `bindExternalAuthentication(service)` | function | Bind `authProtocols.flowEnter` as a URL-only screen on the given service |
| `useSelfAuth(force = true)` | hook | Resolves to `boolean`; navigates to `DISPATCHER` when unauthenticated and `force` is set |
| `useWs(entrypoint, request?, options?)` | hook | `@owlmeans/client-socket`'s `useWs` with the token in `AUTH_QUERY`, refreshed before every reconnect unless the caller supplied its own |
| `DispatcherHOC` | HOC | The return-leg wrapper — see *Concepts* |
| `DispatcherProps`, `TDispatcherHOC`, `DispatcherRenderer`, `DispatcherRendererProps` | type | Dispatcher contract |
| `DEFAULT_ALIAS` | const | `'auth'` — the service alias and the client guard alias |
| `AUTH_RESOURCE`, `USER_ID` | const | `'auth'` resource and `'user'` record id holding the token |
| `DEFAULT_ENTITY` | const | `'owlmeans'` |
| `AuthServiceAppend`, `ClientAuthRecord`, `ClientAuthResource` | type | `context.auth()` and the stored record |

### `@owlmeans/client-auth/manager`

Importing it registers `basic-ed25519`, `re-captcha` and `wallet-consumer`, plus
`pluginMethodSource`, by side effect.

| Symbol | Kind | Purpose |
|---|---|---|
| `plugins`, `registerAuthPlugin`, `getAuthPlugin`, `listAuthPlugins` | registry | The module-global authentication-plugin registry |
| `AuthenticationHOC(Renderer?, type?)` | HOC | The authentication screen hosting a plugin |
| `AuthenticationProps`, `TAuthenticationHOC` | type | Screen props (`type?`, `callback?`, `source?`) |
| `makeControl(context, callback?)` | function | The control a plugin drives: `requestAllowence`, `authenticate`, `persist` / `restore` / `hasPersistentState` / `cleanUpState`, `setError`, `flow` |
| `AuthenticationControl`, `AuthenticationControlState` | type | Control shape and the state persisted across a provider redirect |
| `AuthenticationRenderer`, `AuthenticationRendererProps`, `ClientAuthType`, `ClientAuthenticationMethod`, `AuthenticationCallback` | type | Rendering contract |
| `TunnelConsumer`, `TunnelAuthenticationProps`, `TunnelAuthCallback` | component, type | Wallet-tunnel consumer screen |
| `AuthenCredError` | class | The entered credential cannot be used |
| `CONTROL_STATE_ID` | const | Resource id of the persisted control state |

### `@owlmeans/client-auth/manager/entrypoints`

| Symbol | Kind | Purpose |
|---|---|---|
| `entrypoints` | const | The authentication manager app's bindings: `authen`, `init`, `authenticate`, `rely`, `client`, `login`, the `loginDefault` / `loginTyped` screens and the dispatcher |

### `@owlmeans/client-auth/manager/plugins`

The plugin-authoring surface, with no registration side effect.

| Symbol | Kind | Purpose |
|---|---|---|
| `AuthenticationPlugin` | type | `type`, `Implementation`, `Renderer?`, `requiresRenderer?`, `method?`, `authenticate` / `beforeAuthenticate` / `afterAuthenticate` |
| `PluginImplemnetation` (sic) | type | `(Renderer?) => FC<AuthenticationRendererProps>` |
| `AuthMethodMeta` | type | `id`, `label`, `i18nKey`, `icon`, `order`, `emphasis`, `restricted`, `hidden`, `available(ctx)` |
| `plugins`, `registerAuthPlugin`, `getAuthPlugin`, `listAuthPlugins` | registry | Same registry as `./manager` |
| `pluginMethodSource` | const | The `LoginMethodSource` that offers registered plugins |
| `createWalletFacade`, `PinSchema`, `PinForm`, `TunnelAuthenticationRenderer`, `TunnelAuthenticationRendererProps` | function, const, type | Wallet-tunnel helpers |
| `ed25519BasicUIPlugin`, `reCaptchaPlugin`, `tunnelConsumerUIPlugin` | const | Shipped plugin objects |

### `@owlmeans/client-auth/login`

| Symbol | Kind | Purpose |
|---|---|---|
| `appendLogin(ctx)` | function | Register the host; expose `context.login()` |
| `makeLoginService(alias?)`, `ensureLoginService(ctx)` | function | The lazy login service, and the idempotent getter a plugin package calls first |
| `LoginService`, `LoginServiceAppend`, `LoginContext` | type | `registerPlugin`, `registerPrecondition`, `registerMethodSource`, `registerScreen`, `screen`, `env`, and the `enter` / `begin` / `authorize` / `complete` / `resume` / `logout` / `logoutComplete` / `adopt` / `revoke` facade |
| `LoginPlugin`, `LoginEnv`, `LoginRequest`, `LogoutRequest`, `LoginPrecondition` | type | Plugin contract |
| `LoginOutcome`, `LoginIntent` | enum | Stage results; login or logout surrogate |
| `useLogin(target?)` | hook | `[dispatcherPath, onLogIn]` |
| `useLogout(target?)` | hook | `onLogOut` |
| `registerMethodSource`, `listMethodSources`, `resolveLoginMethods(ctx, cfg?, extra?)`, `primaryLoginMethod(methods)` | function | Global method sources and resolution |
| `LoginMethod`, `LoginMethodSource`, `LoginMethodContext` | type | Method contract |
| `resolveTerms(cfg?)`, `termsAccepted(resolved)`, `acceptTerms(resolved, accepted)`, `ResolvedTerms` | function, type | Terms confirmation, stored in `localStorage` against a version derived from the URLs |
| `resolveCredit(cfg?, brand?, service?)`, `ResolvedCredit` | function, type | The credit and copyright line |
| `FallbackLoginScreen`, `LoginScreenProps`, `LoginScreenComponent` | component, type | The plain screen used when no UI family registered one |
| `surrogatePath(ctx, target)`, `SurrogateTarget` | function, type | Where a surrogate window opens; `null` on an entrypoint list without the surrogate route |
| `resumeAction(outcome)`, `ResumeAction`, `loginAttemptError(outcome)` | function, enum | The shared readings of a `resume` outcome and of a finished attempt |
| `enterOidcAuthorization(model)` | function | Move a flow to the step that can authorize; idempotent |
| `adoptToken(ctx, token)`, `revokeToken(ctx)` | function | The single adoption and de-adoption paths |
| `isEmbedded`, `isSurrogate`, `markSurrogate`, `clearSurrogate`, `defaultLoginEnv` | function | Environment probes behind `LoginEnv` |
| `LOGIN_SERVICE`, `DEFAULT_ALIAS`, `DEFAULT_LOGIN_PRIORITY`, `DEFAULT_METHOD_ORDER`, `LOGIN_SURROGATE_NAME`, `LOGIN_TOKEN_MESSAGE`, `LOGIN_LOGOUT_MESSAGE`, `LOGIN_SURROGATE_MARKER`, `LOGIN_SURROGATE_FEATURES`, `LOGIN_WATCH_INTERVAL`, `LOGIN_INTENT_QUERY`, `LOGIN_NEXT_QUERY`, `LOGIN_METHOD_QUERY`, `LOGIN_TERMS_STORAGE` | const | Service alias, ordering defaults and cross-document wire values |

Importing `./login` also registers the `login` strings of the `auth` library namespace in all
seven supported languages.

## Common pitfalls

- **Keep sign-in handlers synchronous.** `useLogin` and `useLogout` handlers await nothing before
  delegating. Wrapping them in an `async` handler that awaits first makes the popup blocker eat the
  surrogate window. The same rule binds a plugin's `begin` / `logout`, a method's `start` and every
  precondition.
- **Never start login from an effect.** Without a user gesture the window is blocked. Render a
  control and let the person click.
- **Adopt and drop tokens only through the auth service or `adoptToken` / `revokeToken`.**
  Hand-written access to `AUTH_RESOURCE` drifts from the envelope decoding beside it.
- **Import names from the right subpath.** The plugin contract (`AuthenticationPlugin`,
  `AuthMethodMeta`, `pluginMethodSource`, tunnel helpers) resolves only through
  `./manager/plugins`. Rendering types and the registry resolve through `./manager`. Importing
  `./login` registers no authentication plugin.
- **Gate operator methods with `method.restricted`,** so the configuration has to name them. Gate
  dev-only methods on `cfg.debug.supervisor`, never `cfg.debug.all`.
- **Declare `requiresRenderer`** on a plugin whose `Implementation` cannot render without a UI
  package's `Renderer`. Otherwise the screen offers a button that crashes the page it opens.
- **Call `enterOidcAuthorization(model)` before every `authenticate`** in an OIDC flow, rather than
  re-deriving the transition.
- **Authorization stays server-side.** The browser ends up holding an ordinary OwlMeans bearer token
  whichever provider issued it. Product checks live in entrypoint gates and handlers, never in
  client-only state.
- **The organization on the wire is its `entitySlug`.** Read it with `entitySlugOf` from
  `@owlmeans/auth`; the stable `entityId` never reaches the browser.
- **Overrides of the `login` strings cover all seven languages** (`en`, `pl`, `ru`, `be`, `uk`,
  `es`, `de`).

## Related packages

- [`@owlmeans/auth`](../auth) — `Auth`, aliases, `entitySlugOf`, auth errors
- [`@owlmeans/auth-common`](../auth-common) — `authProtocols`, `authMiddleware`, guard aliases
- [`@owlmeans/web-client`](../web-client) — appends the auth service and login host; ships the dispatcher and login plugins
- [`@owlmeans/web-panel`](../web-panel) — the shadcn sign-in screen (`appendLoginScreen`)
- [`@owlmeans/client-panel`](../client-panel) — headless login-method and terms models
- [`@owlmeans/web-oidc-rp`](../web-oidc-rp) — OIDC relying party and its method source
- [`@owlmeans/web-auth`](../web-auth) — supervisor (PK) login plugin
- [`@owlmeans/client-socket`](../client-socket) — the socket hook `useWs` wraps
- [`@owlmeans/server-auth`](../server-auth) — the server-side counterpart

<!-- owlmeans:agent-guidance:start -->
## Agent guidance

This package ships embedded agent skills under `agent-meta/`. After installing your
`@owlmeans/*` packages, run the OwlMeans agent-skills installer to place them into
your project's skill store (`.agents/skills/`):

```sh
npx @owlmeans/agent-skills@^0.1.18-rc.35
```

The embedded files are version-matched to this package release. Do not edit them
directly — they are regenerated on each publish. To contribute guidance edits,
open a PR against the source monorepo.
<!-- owlmeans:agent-guidance:end -->
