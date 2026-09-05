---
name: server-auth
description: How to use @owlmeans/server-auth — the server side of OwlMeans authentication. Two halves in one package - appendAuthService/makeAuthService, which verify Ed25519 bearer tokens on an ordinary API server, and the ./manager subpath, which IS the auth manager service (challenge, plugin registry, credential envelope, rely). Auto-invoked when importing the server auth guard, registering an auth plugin, or building the auth manager.
user-invocable: false
---

# @owlmeans/server-auth

**Layer:** Server
**Install:** `"@owlmeans/server-auth": "^0.1.18-rc.17"` in `dependencies`

Two halves, deliberately split by subpath:

- the **root** export is what every protected API server needs — the guard that verifies an
  `Ed25519BasicToken` bearer and resolves an `Auth`;
- **`./manager`** is the auth manager application itself — it serves `/authentication/init` and
  `/authentication/authenticate`, owns the plugin registry, and signs the credential envelope.

An ordinary service imports the root. Only the auth manager imports `./manager`.

## Key Exports — root

| Export | Description |
|--------|-------------|
| `appendAuthService(ctx, alias?)` | Register the guard on a server context and expose it as `context.auth()`. Registers a static `AUTH_CACHE` resource when the context has none |
| `makeAuthService(alias?)` | The guard service itself: `match`, `handle`, `unpack(token)`, `authenticate(token)` |
| `entrypoints` | `DISPATCHER` and `DISPATCHER_AUTHEN`, elevated — spread these into a service that accepts a manager-issued credential and exchanges it for a bearer |
| `DEFAULT_ALIAS` | `'auth'` — the guard's service alias, matching `DEFAULT_GUARD` |
| `AUTH_CACHE` | `'auth-cache'` — the single-use challenge store |
| `AUTH_SRV_KEY` | `'auth-service'` — the TRUSTED record whose key signs credential envelopes |
| `AUTHEN_TIMEFRAME` | `15 * 60 * 1000` — challenge lifetime and anti-replay window, in ms |
| `AuthService`, `AuthServiceAppend`, `AuthSpent` | Types |
| `makeRelyModel`, `makeProviderRely`, `makeConsumerRely`, `RelyOptions` | The rely (wallet handshake) models |

## Key Exports — `./manager`

| Export | Description |
|--------|-------------|
| `makeContext(cfg, customize?)` | A server context preconfigured with the API server, API client, socket service and static `AUTH_CACHE` |
| `main(ctx)` | Register the manager entrypoints, configure, init and listen |
| `entrypoints` | `AUTHEN`, `AUTHEN_INIT`, `AUTHEN_AUTHEN`, `AUTHEN_RELY`, the api-config entrypoints and the reCAPTCHA siteverify entrypoint |
| `authenticationInit`, `authenticate`, `rely` | The handlers those entrypoints elevate to: `init(request)` → challenge, `authenticate(credential)` → signed credential envelope, and the rely socket |
| `plugins`, `registerPlugin(type, factory)` | The plugin registry (also on `./manager/plugins`) |
| `appendSupervisorAuth(ctx, opts?)`, `setupInternalTokenCoguard(entrypoints, guard?)` | PK supervisor login — see the `supervisor-auth` skill |
| `createRelyService(alias?)`, `DEFAULT_RELY`, `RELY_TUNNEL` | The rely guard service |
| `AppConfig`, `AppContext`, `AuthModel`, `RelyService`, `RelyAllowanceRequest`, `RelyLinker`, `RelyCarrier` | Types |

`./manager` also re-exports the handful of symbols a manager application needs from elsewhere
(`config`, `service`, `TRUSTED`, `elevate`, `handleBody` / `handleRequest`, `backend`,
`GUARD_ED25519`, `AUTHEN*` aliases, `TrustedRecord`), so a manager app can be written against this
one import.

## Key Exports — `./manager/plugins`

| Export | Description |
|--------|-------------|
| `AuthPlugin` | `{ type, init(request), authenticate(credential) }` — `AuthModel` minus `rely` |
| `registerPlugin(type, factory)` | Add a plugin under a type string. The registry is a module-level singleton |
| `plugins` | The registry map |
| `getPlugin(type, context)`, `assertType(type, plugin)` | Resolution; `getPlugin` throws `AuthUnknown(type)` for an unregistered type |
| `basicEd25519`, `reCaptcha`, `basicRely` | The plugins registered out of the box, for `AuthenticationType.BasicEd25519`, `ReCaptcha` and `RelyHandshake` |
| `makeSupervisorPlugin(context, opts)` | The PK supervisor plugin factory |
| `RecpatchaResponse`, `RecaptchaRequest`, `RelyRecord`, `AuthRedisResource` | Types |

## Usage

Protect an ordinary API server:

```typescript
import { appendAuthService } from '@owlmeans/server-auth'
import { appendAuthIdentityResources } from '@owlmeans/server-auth-identity'

// in makeContext, after the db/cache services are appended:
appendAuthService(context)
appendAuthIdentityResources(context)
```

Add an authentication method to the manager:

```typescript
import { registerPlugin } from '@owlmeans/server-auth/manager/plugins'
import type { AuthPlugin } from '@owlmeans/server-auth/manager/plugins'

registerPlugin('my-method', context => ({
  type: 'my-method',
  init: async request => ({ challenge: /* unique per request */ '' }),
  authenticate: async credential => {
    // verify credential.credential, then set userId / profileId / entitySlug / role / scopes
    return { token: '' }   // '' keeps the manager's own challenge as the credential token
  },
}) as AuthPlugin)
```

## Rules

- The guard verifies a bearer token and populates `req.auth`. It decides nothing about ownership or
  permissions — pair it with `@owlmeans/entrypoint` gates, and keep a handler-level organization
  check as a second line of defence.
- `AUTH_CACHE` is the anti-replay store: the manager burns each decoded challenge into it as a
  create-once record with `AUTHEN_TIMEFRAME` TTL. `appendAuthService` registers a **static**
  (in-process) resource when the context has none, which is correct for a single replica only —
  register a Redis resource under the same alias before calling it in any scaled deployment.
- A plugin's `init` must return a challenge that is unique per request. A challenge that repeats
  across independent attempts collides in `AUTH_CACHE` and surfaces as `AuthenFailed('challenge')`.
- The manager canonicalizes the organization entity: whatever slug (current, retired, or the frozen
  key) a plugin leaves on `credential.entitySlug` is resolved through `ENTITY_RESOLVER` and replaced
  with the current slug before the envelope is signed. An unresolvable value throws
  `AuthenFailed('entity')`. Where no resolver is registered the value is passed through untouched.
- Pair this package with `@owlmeans/server-auth-identity` when an external provider (Google, OIDC,
  email OTP) must map onto local account/profile/credential records.

## Depends On

- `@owlmeans/auth`, `@owlmeans/auth-common` — types, aliases, `trust()`, `extractAuthToken`
- `@owlmeans/basic-envelope`, `@owlmeans/basic-keys` — envelope signing and Ed25519 verification
- `@owlmeans/server-context`, `@owlmeans/server-entrypoint`, `@owlmeans/server-api`
- `@owlmeans/config` — the `TRUSTED` config resource
- `@owlmeans/static-resource` — the default `AUTH_CACHE` backing
