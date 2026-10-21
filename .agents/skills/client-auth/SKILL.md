---
name: client-auth
description: How to use @owlmeans/client-auth — the browser side of OwlMeans authentication. Root exports the auth service, the shared client entrypoints and the dispatcher HOC; ./manager holds the authentication screen, its control and the plugin registry; ./manager/plugins holds the authentication-plugin contract a plugin package writes against; ./login holds the login-plugin host, the sign-in method registry, the terms confirmation and the useLogin/useLogout hooks. Auto-invoked when importing client-auth helpers, registering an authentication plugin, or wiring a sign-in control.
user-invocable: false
---

# @owlmeans/client-auth

**Layer:** Client
**Install:** `"@owlmeans/client-auth": "^0.1.18-rc.65"` in `dependencies`

Five subpaths, five jobs:

| Subpath | Job |
|---------|-----|
| `.` | The client `AuthService`, the shared auth entrypoints, and the dispatcher HOC |
| `./manager` | The registry's four names plus the authentication screen, control and error — *how* a user proves identity. Importing it registers the three shipped browser plugins and `pluginMethodSource` by side effect |
| `./manager/entrypoints` | The manager application's own front-end entrypoint bindings |
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
| `entrypoints` | The shared auth entrypoint list with `DISPATCHER_AUTHEN` bound |
| `DEFAULT_ALIAS` | `'auth'` — the client-side counterpart of `DEFAULT_GUARD` |
| `AUTH_RESOURCE` | `'auth'` — the resource the token record is stored in |
| `USER_ID` | `'user'` — the id of that single record |
| `DEFAULT_ENTITY` | `'owlmeans'` |
| `DispatcherHOC` | The return-leg HOC. It wraps a `DispatcherRenderer`, hands it `provideToken(token, query)` and `navigate()`, adopts the supplied token through the auth service, and strips `AUTH_QUERY` before navigating on. Reading the return-leg query is the renderer's job — `@owlmeans/web-client` reads `AUTH_QUERY`, `@owlmeans/web-oidc-rp` also reads `OIDC_ERROR_QUERY` and forwards the remaining params |
| `DispatcherProps`, `TDispatcherHOC`, `DispatcherRenderer`, `DispatcherRendererProps` | Dispatcher types |
| `useWs(entrypoint, request?, options?)` | A socket hook that attaches the current token as the `AUTH_QUERY` param and refreshes it on every reconnect attempt (via `WsOptions.beforeConnect`), unless the request already carried its own token — in which case that stays untouched across reconnects too. `options` passes straight through to `@owlmeans/client-socket`'s `useWs`, so `{ reconnect: false }` still opts a stateful one-shot handshake out of retries (see `manager/plugins/tunnel-consumer.tsx`) |
| `useSelfAuth(force?)` | Whether this context is authenticated; navigates to `DISPATCHER` when it is not and `force` |
| `AuthServiceAppend`, `ClientAuthRecord`, `ClientAuthResource` | Types |

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

- An application's translated legal destinations are opt-in `login.terms.localizedHrefs`, keyed by
  document/notice key, then locale. `loginTermsHelper.termsHrefOf(doc, locale?)` selects the exact
  configured locale, then its base language, then `doc.href`. `termsSentence` and `termsAcceptanceOf`
  share that resolver: pass the same live UI language to both. The canonical href and revisions still
  determine the agreement digest; translations alone never ask for a new acceptance. Supply known
  published destinations, never infer another application's URL layout. Omitted maps preserve defaults.
- The bearer token lives in the `AUTH_RESOURCE` resource under the single id `USER_ID`. Read and
  write it through the auth service or through `loginTokenOf(ctx).adoptToken` / `.revokeToken`;
  hand-written storage access drifts from the envelope decoding that happens beside it.
- A plugin that persists state across a provider redirect drives the control's own
  `persist()` / `restore()` / `hasPersistentState()` / `cleanUpState()`. They keep the type, stage
  and allowance in the `FLOW_STATE` resource under an id this package owns and does not export —
  restore before submitting the credential, and clean up after.
- After a sign-in, `DispatcherHOC.navigate` calls `loginLandingOf(ctx).landAfterLogin` — a pending
  `LoginStep`, else a landing suspended in `@owlmeans/client-flow`
  (`flowLandingOf(ctx).resumeSuspendedFlow`, one-shot, an entrypoint alias plus its query — parked
  by a flow's `.suspendFlow` or by `useLogin(target)`), else `HOME` — read BEFORE `alias` is
  defaulted to `HOME`. Login plugins that navigate on their own do the same — see `login-plugins`.
- A control that leads to a screen through sign-in is `useLogin(target)`. Never navigate to a guarded
  screen to start a sign-in, and never hand a plugin a continuation that goes anywhere but the
  dispatcher: the landing is the dispatcher's decision.
- The browser ends up holding an ordinary OwlMeans bearer token whichever provider issued the
  login. Product authorization stays server-side, in entrypoint gates and handler checks — never in
  client-only state.
- The organization entity a token names is its `entitySlug`, the renameable public name. Read it
  with `authHelper.entitySlugOf` from `@owlmeans/auth`; the stable `entityId` never reaches the
  browser.

## Depends On

- `@owlmeans/auth`, `@owlmeans/auth-common` — types, aliases, `authMiddleware`
- `@owlmeans/client`, `@owlmeans/client-context`, `@owlmeans/client-entrypoint`, `@owlmeans/client-socket`
- `@owlmeans/config` — the login screen, terms and credit configuration
- `@owlmeans/basic-envelope` — decoding the bearer envelope
- `react` (peer)
- `ajv` (peer) — `PinSchema` is typed as `JSONSchemaType<PinForm>`

## Parts

| Part | Load it when |
|---|---|
| [manager](parts/manager.md) | registering or writing an authentication plugin, or rendering the authentication screen |
| [login](parts/login.md) | wiring a sign-in or sign-out control, a login step, the terms confirmation, or the post-login landing |
