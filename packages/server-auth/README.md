# @owlmeans/server-auth

The server side of OwlMeans authentication, in two halves. The root export is what every protected
API service needs: the guard that verifies an Ed25519-signed bearer token and resolves
`request.auth`, and the dispatcher bindings that exchange a credential issued by the auth manager
for a bearer of this service. The `./manager` subpath is the auth manager application itself — the
challenge endpoints, the authentication plugin registry, the signed credential envelope and the rely
handshake. An ordinary service imports the root (usually implicitly, through
`@owlmeans/server-app`'s `makeContext`); only the auth manager imports `./manager`. OIDC tokens are
`@owlmeans/server-oidc-rp`, long-lived API keys `@owlmeans/server-auth-token`, local
account/profile records `@owlmeans/server-auth-identity`, and the browser side `@owlmeans/client-auth`.

## Installation

```bash
bun add @owlmeans/server-auth@^0.1.18-rc.28
```

## Concepts

- **Guard** — the `AuthService` registered as `auth` (the value of `DEFAULT_GUARD`). `match` hits a
  request carrying an `ed25519-basic-token`; `handle` verifies it against this service's own trusted
  key (`cfg.alias ?? cfg.service`) and resolves the `Auth`. It authenticates only — authorization is
  gates and handlers.
- **Token exchange** — `authenticate(token)` verifies a credential envelope against the
  `auth-service` trusted record (`AUTH_SRV_KEY`), burns its challenge into `AUTH_CACHE`, and returns
  a bearer signed by this service.
- **`AUTH_CACHE`** — the anti-replay store: each challenge is created once with an
  `AUTHEN_TIMEFRAME` TTL. A static in-process resource by default.
- **Auth manager** — the `./manager` application: `init(request)` returns a challenge,
  `authenticate(credential)` returns a signed credential envelope, and the slug on the credential is
  canonicalized through the entity resolver before signing.
- **Authentication plugin** — `{ type, init, authenticate }` registered under an
  `AuthenticationType`; the manager dispatches by the request's `type`.
- **Rely** — the wallet handshake that lets one authenticated party vouch for another over a socket
  (`DEFAULT_RELY` guard, `RELY_TUNNEL`).

## Usage

### Protect routes on an ordinary service

`@owlmeans/server-app`'s `makeContext(cfg)` registers the guard. A protocol opts in with `guards`,
and everything declared under it inherits them.

```ts
import { contract, openProtocol, protocol, typed } from '@owlmeans/entrypoint'
import { route, RouteMethod } from '@owlmeans/route'
import { DEFAULT_GUARD } from '@owlmeans/auth-common'

const invoiceBase = openProtocol(route('my-app:api:invoice', '/invoice'), { guards: DEFAULT_GUARD })

export const invoiceProtocols = {
  base: invoiceBase,
  list: protocol(
    route('my-app:api:invoice:list', '/', { parent: invoiceBase, method: RouteMethod.GET }),
    contract(typed<Invoice[]>()),
  ),
}
```

```ts
import { handlers } from '@owlmeans/server-app'
import { requireEntityKey } from '@owlmeans/auth-common'

const api = handlers<Context>()

export const list = api.request(invoiceProtocols.list, async (request, context) => {
  // request.auth is the verified Auth: userId, profileId, role, scopes, entitySlug
  const { items } = await context.invoice().list({ entityId: requireEntityKey(request) })
  return items
})
```

### Scaled deployment

Replace the in-process cache with a shared one before registering the guard, and declare the trusted
keys the guard verifies against.

```ts
import { makeContext as makeAppContext } from '@owlmeans/server-app'
import { appendRedis } from '@owlmeans/redis'
import { makeRedisResource } from '@owlmeans/redis-resource'
import { appendAuthService, AUTH_CACHE, AUTH_SRV_KEY } from '@owlmeans/server-auth'
import { appendAuthIdentityResources } from '@owlmeans/server-auth-identity'

// config.ts — keys are loaded from the environment, never committed
cfg.trusted.push({
  id: process.env.AUTH_SERVICE_DID!, name: AUTH_SRV_KEY,
  credential: process.env.AUTH_SERVICE_PUB!, scopes: ['*'],
})
cfg.trusted.push({
  id: process.env.MY_APP_API_DID!, name: MY_APP_API,
  credential: process.env.MY_APP_API_PUB!, secret: process.env.MY_APP_API_PK!, scopes: ['*'],
})

// context.ts
export const makeContext = <C extends Config, T extends Context<C>>(cfg: C): T => {
  const context = makeAppContext<C, T>(cfg, true)
  appendRedis<C, T>(context)

  context.registerResource(makeRedisResource(AUTH_CACHE))
  appendAuthService<C, T>(context)
  appendAuthIdentityResources(context)

  return context
}
```

### Verify a token outside the HTTP pipeline

```ts
import type { AuthServiceAppend } from '@owlmeans/server-auth'

const readAuth = async (context: Context & AuthServiceAppend, authorization: string) =>
  context.auth().unpack(authorization) // 'ED25519-BASIC-TOKEN <envelope>' -> Auth, or throws
```

### Run the auth manager

```ts
import { config, makeContext, main } from '@owlmeans/server-auth/manager'
import type { AppConfig } from '@owlmeans/server-auth/manager'
import '@owlmeans/server-oidc-rp/auth/plugins' // optional: OIDC and Google login plugins

const cfg = config<AppConfig>(MY_APP_AUTH, commonConfig as AppConfig)
const context = makeContext(cfg)

await main(context)
```

### Add an authentication method

```ts
import { registerPlugin } from '@owlmeans/server-auth/manager/plugins'
import type { AuthPlugin } from '@owlmeans/server-auth/manager/plugins'

registerPlugin('my-method', context => ({
  type: 'my-method',
  init: async request => ({ challenge: /* unique per request */ '' }),
  authenticate: async credential => {
    // verify credential.credential, then set userId / profileId / entitySlug / role / scopes
    return { token: '' } // '' keeps the manager's own challenge as the credential token
  },
}) as AuthPlugin)
```

## API

### Root export

| Symbol | Kind | Purpose |
|---|---|---|
| `appendAuthService(ctx, alias = DEFAULT_ALIAS)` | function | Register the guard as `context.auth()`; registers a static `AUTH_CACHE` when the context has none |
| `makeAuthService(alias?)` | function | The guard: `match`, `handle`, `unpack(token)`, `authenticate(token)` |
| `entrypoints` | const | Server bindings of `authProtocols.dispatcher` and `authProtocols.dispatcherAuthenticate` |
| `DEFAULT_ALIAS` | const | `'auth'` — equals `DEFAULT_GUARD`; re-exported as `DAUTH_GUARD` by `@owlmeans/server-app` |
| `AUTH_CACHE` | const | `'auth-cache'` — the single-use challenge store |
| `AUTH_SRV_KEY` | const | `'auth-service'` — the trusted record whose key signs credential envelopes |
| `AUTHEN_TIMEFRAME` | const | `15 * 60 * 1000` ms — challenge lifetime and anti-replay window |
| `makeRelyModel`, `makeProviderRely`, `makeConsumerRely` | function | Rely envelope models |
| `AuthService`, `AuthServiceAppend`, `AuthSpent`, `RelyOptions` | type | Guard service, context mixin, cache record, rely options |

### `./manager`

| Symbol | Kind | Purpose |
|---|---|---|
| `makeContext(cfg, customize?)` | function | Server context with API server, API client, socket service, rely guard and static `AUTH_CACHE` |
| `main(ctx)` | function | Register the manager entrypoints, init and listen |
| `entrypoints` | const | Bindings for authen, init, authenticate, rely, api-config and reCAPTCHA siteverify |
| `authenticationInit`, `authenticate`, `rely` | function | Implementations bound to the auth protocols |
| `plugins`, `registerPlugin(type, factory)` | const / function | The plugin registry |
| `appendSupervisorAuth(ctx, opts?)`, `setupInternalTokenCoguard(entrypoints, guard?)` | function | PK supervisor login (development only by default) |
| `createRelyService(alias?)`, `createRelyFlow(context, conn, auth?)` | function | Rely guard service and socket authentication flow |
| `DEFAULT_RELY`, `RELY_TUNNEL` | const | `'auth-rely'`, `'rely-tunnel'` |
| `config`, `service`, `TRUSTED`, `addWebService`, `AppType`, `assertContext`, `klusterize`, `stab`, `backend`, `filterObject` | re-export | Config and context helpers for a manager app |
| `handleIntermediate`, `handleBody`, `handleRequest`, `handleParams` | re-export | `@owlmeans/server-api` wrappers |
| `AUTHEN`, `AUTHEN_AUTHEN`, `AUTHEN_INIT`, `GUARD_ED25519`, `BED255_CASHE_RESOURCE` | re-export | Auth aliases |
| `AppConfig`, `AppContext`, `AuthModel`, `RelyService`, `RelyAllowanceRequest`, `RelyLinker`, `RelyCarrier` | type | Manager shapes |
| `SupervisorAuthOptions`, `SupervisorUserResolver`, `SupervisorUserResolution`, `SupervisorPluginOptions` | type | Supervisor options |
| `TrustedRecord`, `RefedEntrypointHandler`, `AbstractRequest`, `AbstractResponse` | type | Re-exported types |

### `./manager/plugins`

| Symbol | Kind | Purpose |
|---|---|---|
| `registerPlugin(type, factory)`, `plugins` | function / const | The module-level registry |
| `getPlugin(type, context)`, `assertType(type, plugin)` | function | Resolution; `getPlugin` throws `AuthUnknown(type)` for an unregistered type |
| `basicEd25519`, `reCaptcha`, `basicRely` | function | Built-in plugins |
| `makeSupervisorPlugin(context, opts)` | function | PK supervisor plugin factory |
| `AuthPlugin`, `RecpatchaResponse`, `RecaptchaRequest`, `RelyRecord`, `AuthRedisResource` | type | Plugin shapes |

## Common pitfalls

- The guard verifies a bearer and sets `request.auth`; it decides nothing about ownership. Pair it
  with gates and keep a handler-level organization check.
- The default static `AUTH_CACHE` is correct for one replica only. Register a Redis resource under
  the same alias before `appendAuthService` in any scaled deployment.
- A plugin's `init` must return a challenge unique per request; a repeated challenge collides in
  `AUTH_CACHE` and fails as `AuthenFailed('challenge')`.
- The manager replaces whatever slug a plugin sets on `credential.entitySlug` with the current slug;
  an unresolvable value fails as `AuthenFailed('entity')`. A token carries `entitySlug`, never an
  entity id.
- Register `appendAuthService` before `appendAuthIdentityResources` and product gate services.
- Import `./manager` only in the auth manager process.

## Related packages

- [`@owlmeans/auth`](../auth) — `Auth`, `AuthCredentials`, error classes
- [`@owlmeans/auth-common`](../auth-common) — `DEFAULT_GUARD`, `authProtocols`, `trust()`, entity helpers
- [`@owlmeans/server-auth-identity`](../server-auth-identity) — local identity records and the entity resolver
- [`@owlmeans/server-oidc-rp`](../server-oidc-rp) — OIDC login plugins and guard
- [`@owlmeans/server-auth-otp`](../server-auth-otp) — email OTP plugin
- [`@owlmeans/server-auth-token`](../server-auth-token) — long-lived access tokens
- [`@owlmeans/server-app`](../server-app) — `makeContext` calls `appendAuthService` by default
- [`@owlmeans/client-auth`](../client-auth) — the browser side

<!-- owlmeans:agent-guidance:start -->
## Agent guidance

This package ships embedded agent skills under `agent-meta/`. After installing your
`@owlmeans/*` packages, run the OwlMeans agent-skills installer to place them into
your project's skill store (`.agents/skills/`):

```sh
npx @owlmeans/agent-skills@^0.1.18-rc.21
```

The embedded files are version-matched to this package release. Do not edit them
directly — they are regenerated on each publish. To contribute guidance edits,
open a PR against the source monorepo.
<!-- owlmeans:agent-guidance:end -->
