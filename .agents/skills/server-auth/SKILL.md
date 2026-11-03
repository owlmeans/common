---
name: server-auth
description: How to use @owlmeans/server-auth — the server side of OwlMeans authentication. Two halves in one package - appendAuthService/makeAuthService, which verify Ed25519 bearer tokens on an ordinary API server, and the ./manager subpath, which IS the auth manager service (challenge, plugin registry, credential envelope, rely). Also makeAuthModel with an exclusive private plugin list, and the reCAPTCHA guest path - the plugin's verifier and policy record (re-exported from @owlmeans/captcha), and makeReCaptchaGuard, which spends a guest token once. Auto-invoked when importing the server auth guard or the reCAPTCHA guard, registering an auth plugin, running private sign-in plugins, or building the auth manager.
user-invocable: false
---

# @owlmeans/server-auth

**Layer:** Server
**Install:** `"@owlmeans/server-auth": "0.1.20-alpha.0"` in `dependencies`

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
| `entrypoints` | `DISPATCHER` and `DISPATCHER_AUTHEN`, server-bound — spread these into a service that accepts a manager-issued credential and exchanges it for a bearer |
| `DEFAULT_ALIAS` | `'auth'` — the guard's service alias, matching `DEFAULT_GUARD` |
| `AUTH_CACHE` | `'auth-cache'` — the single-use challenge store |
| `AUTH_SRV_KEY` | `'auth-service'` — the TRUSTED record whose key signs credential envelopes |
| `AUTHEN_TIMEFRAME` | `15 * 60 * 1000` — challenge lifetime and anti-replay window, in ms |
| `AuthService`, `AuthServiceAppend`, `AuthSpent` | Types |
| `makeRelyModel`, `makeProviderRely`, `makeConsumerRely`, `RelyOptions` | The rely (wallet handshake) models |
| `makeReCaptchaGuard(alias = RECAPTCHA_GUARD)` | The guard of a route a reCAPTCHA guest calls once — see "reCAPTCHA guests" |
| `makeReCaptchaTokenHelper(ctx)`, `reCaptchaTokenOf(ctx)` | `inspect(req)` / `verify(token)` → `ReCaptchaGuest \| null` without spending; `spend(guest)` → `false` when spent before |
| `ReCaptchaGuest`, `ReCaptchaCarrier`, `ReCaptchaTokenHelper` | Types: `{ credential, challenge, expiresAt }`, `{ headers? }`, the helper |
| `authSettingsOf(ctx)` / `makeAuthSettings` | The effective `cfg.auth` (§ Per-deployment keys and lifetime): `tokenKey()`, `authKey()`, `sessionTtl()`, defaults applied at each call |
| `appendAuthEventsService(ctx, alias?)`, `makeAuthEventsService`, `authEvents(ctx)` | The sign-in events seam (§ Sign-in events); `authEvents(ctx)` is `null` in a context without it |
| `AUTH_EVENTS` | `'auth-events'` — the events service alias |
| `AuthServiceSettings`, `AuthServiceConfig`, `AuthSettings`, `AuthEventsService`, `AuthenticatedListener` | Types |

## Key Exports — `./manager`

| Export | Description |
|--------|-------------|
| `makeContext(cfg, customize?)` | A server context preconfigured with the API server, API client, socket service and static `AUTH_CACHE` |
| `main(ctx)` | Register the manager entrypoints, configure, init and listen |
| `entrypoints` | `AUTHEN`, `AUTHEN_INIT`, `AUTHEN_AUTHEN`, `AUTHEN_RELY` and the api-config entrypoints |
| `authenticationInit`, `authenticate`, `rely` | Implementations bound to auth protocols: `init(request)` → challenge, `authenticate(credential)` → signed credential envelope, and the rely socket |
| `makeAuthModel(ctx, opts?)`, `AuthModelOptions` | The model those handlers run: `init`, `authenticate`, `rely`. `opts.plugins` = an EXCLUSIVE plugin list — see "Private plugins" |
| `plugins`, `registerPlugin(type, factory)` | The plugin registry (also on `./manager/plugins`) |
| `appendSupervisorAuth(ctx, opts?)`, `setupInternalTokenCoguard(entrypoints, guard?)` | PK supervisor login — see the `supervisor-auth` skill |
| `createRelyService(alias?)`, `DEFAULT_RELY`, `RELY_TUNNEL` | The rely guard service |
| `AppConfig`, `AppContext`, `AuthModel`, `RelyService`, `RelyAllowanceRequest`, `RelyLinker`, `RelyCarrier` | Types |

`./manager` also re-exports the handful of symbols a manager application needs from elsewhere
(`config`, `service`, `TRUSTED`, `bind`, `handlers`, `backend`,
`GUARD_ED25519`, `AUTHEN*` aliases, `TrustedRecord`), so a manager app can be written against this
one import.

## Key Exports — `./manager/plugins`

| Export | Description |
|--------|-------------|
| `AuthPlugin` | `{ type, init(request), authenticate(credential) }` — `AuthModel` minus `rely` |
| `registerPlugin(type, factory)` | Add a plugin under a type string. The registry is a module-level singleton |
| `plugins` | The registry map |
| `authPluginHelper.getPlugin(type, context)`, `authPluginHelper.assertType(type, plugin)` | Resolution; `getPlugin` throws `AuthUnknown(type)` for an unregistered type |
| `makeBasicEd25519Plugin`, `makeReCaptchaPlugin`, `makeBasicRelyPlugin` | The plugin factories registered out of the box, for `AuthenticationType.BasicEd25519`, `ReCaptcha` and `RelyHandshake` |
| `makeSupervisorPlugin(context, opts)` | The PK supervisor plugin factory |
| `createReCaptchaVerifierService(alias = RECAPTCHA_VERIFIER, opts?)`, `appendReCaptchaVerifierService(ctx, alias?, opts?)` | Google siteverify: one `fetch` form POST (`opts.url` must be https, `opts.fetch` injectable, `opts.timeout` default 10 s) |
| `makeReCaptchaPolicyModel(record)` | The `MOD_RECAPTCHA` record's policy: `hostnames()`, `minScore()`, `actions()`, `assert(answer)` |
| `RECAPTCHA_VERIFIER`, `RECAPTCHA_SITEVERIFY_URL`, `RECAPTCHA_VERIFY_TIMEOUT` | `'re-captcha-verifier'`, `https://www.google.com/recaptcha/api/siteverify`, `10_000` |
| `ReCaptchaResponse`, `ReCaptchaRequest`, `ReCaptchaVerifierService`, `ReCaptchaVerifierOptions`, `ReCaptchaFetch`, `ReCaptchaPluginConfig`, `ReCaptchaPolicyModel` | reCAPTCHA types |

The reCAPTCHA verifier, policy, constants and types are `@owlmeans/captcha`'s
(`createCaptchaVerifierService`, `makeCaptchaPolicyModel`, `CAPTCHA_VERIFIER`, `Captcha*`),
re-exported here under these names — same alias, same refusals. New code imports `@owlmeans/captcha`;
a route that must judge a score-based token itself uses its strict `makeCaptchaCheck`, not this
plugin (`captcha` skill).
| `RelyRecord`, `AuthRedisResource` | Types |

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

## Private plugins — `makeAuthModel(ctx, { plugins })`

`registerPlugin` adds to a module-level registry every `/authentication/*` route of the process
reads — the manager's generic sign-in is ungated, so a plugin registered there is reachable by
anyone who can name its type. A sign-in method that must run ONLY behind its own routes (its own
throttles, captcha and request checks) builds the model with an exclusive list instead:

```typescript
import { makeAuthModel } from '@owlmeans/server-auth/manager'

const model = makeAuthModel(context, { plugins: { 'email-pin': pinPluginFor(request) } })
const { challenge } = await model.init({ type: 'email-pin', userId: email })
```

With `opts.plugins`, `init` and `authenticate` resolve a type ONLY from that list — a type it lacks,
a globally registered one included, is `AuthUnknown`; the envelope signing, the replay policy, the
entity canonicalisation and the `auth.signed-in` / `auth.refused` events are the model's as always.
Build the list per request when a factory must close over request data. Without `opts` the model
reads the global registry. `@owlmeans/server-auth-email` is the shipped consumer.

## reCAPTCHA guests

A reCAPTCHA sign-in proves that a person solved a challenge — nothing about who they are.

**Config.** One Backend plugin record `MOD_RECAPTCHA` holds the secret in `value` and the policy in
extra string fields (`''` or absent = no check; each may be a file path the file config reader
resolves); the browser's site key is a separate Frontend record `CMOD_RECAPTCHA`. Only Frontend
records are advertised, so the secret and the policy never reach a browser.

```ts
plugin(cfg, { value: '/etc/master-secret/recaptcha-secret',
  hostnames: 'example.org, example.com', minScore: '0.5', actions: 'inquiry' }, MOD_RECAPTCHA)
clientPlugin(cfg, '/etc/app-config/recaptcha-site-key', CMOD_RECAPTCHA)
```

| Field | Check (refusal) |
|---|---|
| `value` | the siteverify secret; missing or `''` → `PluginMissconfigured('value')` before Google is asked |
| — | Google's `success` (`AuthenFailed('recaptcha:<error-codes>')`, `recaptcha:unknown` without codes) |
| `hostnames` | comma/space list; the answer's `hostname` equals an entry or is its subdomain (`recaptcha:hostname`) |
| `minScore` | 0…1; a score-based answer with `score < minScore` (`recaptcha:score`); a checkbox answer has no score and passes; a non-number → `PluginMissconfigured('minScore')` |
| `actions` | comma/space list; the answer's `action` must be one of them — an answer without one fails (`recaptcha:action`) |

**Plugin.** `makeReCaptchaPlugin` asks the verifier registered under `RECAPTCHA_VERIFIER` (a test
or proxy registers its own; without one the default siteverify `fetch` runs — Google is always
https, `cfg.security.unsecure` does not apply). Google unreachable or answering garbage is
`AuthUnavailable` (503), never a refusal. After a passing answer the credential keeps ONLY `type`,
`role`, `userId`, `scopes`, `challenge`, `credential`, set to a guest: `GUEST_ID`, `AuthRole.Guest`,
`[AUTH_SCOPE]`, type ReCaptcha. A posted `profileId`, `entitySlug`/`entityId`, `permissions`,
`groups`, `expiresAt`, `source` or `publicKey` is dropped; `source` never changes the spend key.

**Token.** The manager signs it as usual: an `AUTHEN_TIMEFRAME` envelope of type `re-captcha` whose
`challenge` is the server-issued wrapped challenge (the spend key) and whose `credential` is the
`AUTH_SRV_KEY` record's id. The browser sends it as `Authorization: RE-CAPTCHA <token>`.

**Guard.** A route takes it with `guards: [RECAPTCHA_GUARD]` and `makeReCaptchaGuard()` registered
in a context holding the `AUTH_SRV_KEY` trusted record (public key is enough) and a shared
`AUTH_CACHE`. `reCaptchaTokenOf(ctx).inspect(req)` checks, without spending: envelope type, a TTL
of at most `AUTHEN_TIMEFRAME`, signature and expiry, the auth record's stamp, type ReCaptcha, role
Guest, `GUEST_ID`, a non-empty challenge. The guard then spends it — an atomic create-once of the
challenge in `AUTH_CACHE` (Redis `SET NX`), the same key a bearer exchange and the integrated IAM's
finalizer claim, so a token is spent once across the platform. A replay, or any failed check, is
401. `req.auth` becomes a guest with `token: ''` and `expiresAt` = the token's expiry. Use
`inspect` for a pre-parse check (before a large body is read); the route still needs the guard.

**Never a session.** `AuthService.authenticate` (the dispatcher's bearer exchange) refuses a
credential whose envelope or `type` is ReCaptcha (`AuthenFailed('guest')`) before spending it. A
service that judges manager tokens itself (a finalizer) must check the method it expects — the
token's type and its challenge's envelope type — not just the signature, since one key signs every
method's token.

## Per-deployment keys and lifetime (`cfg.auth`)

| Key | Default | What it names |
|---|---|---|
| `tokenKey` | `cfg.alias ?? cfg.service` | the `TRUSTED` record that signs this service's bearers and that the guard (`handle`, `unpack`) verifies them with; the service's own service-to-service identity stays `cfg.alias ?? cfg.service` |
| `authKey` | `AUTH_SRV_KEY` (`'auth-service'`) | the auth manager's record: signs the sign-in challenges, the credential envelopes and reCAPTCHA guest tokens; the bearer exchange and the reCAPTCHA guard verify with it |
| `sessionTtl` | `AUTH_SESSION_TTL` (7 days) | a bearer session's absolute lifetime in ms; the session registry clamps anything longer; a non-positive or non-number value throws `SyntaxError('auth:session-ttl')` |

Without `cfg.auth` every value is the default, byte-identical to a deployment that never set it. A
staff area that must not share tokens with the customer area gives both keys a record of its own
(e.g. `{ tokenKey: 'viable-operator', authKey: 'viable-operator', sessionTtl: 12 h }`): nothing one
area signs verifies at the other, while `cfg.alias` keeps the service's signed hops to its peers.

## Sign-in events

`appendAuthService` registers the events service (`AUTH_EVENTS`) unless the context holds one.
`authEvents(ctx)?.onAuthenticated(async (auth, ctx) => …)` is called once per session exchange
(`AuthService.authenticate`), AFTER the session registered and its bearer was signed — never on a
token refresh. Each listener gets a copy of the `Auth` (`userId`, `profileId`, `entitySlug`,
`sessionId`, `expiresAt`), runs in registration order and is awaited; a listener that throws is
logged (`auth.listener-failed`) and the rest still run — a listener never fails the sign-in. Hang
sign-in side effects (a last-sign-in stamp, an audit line) here, never by wrapping the service.

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
- `authenticate`'s `{ token }` becomes the signed token's `challenge` (`''` keeps the issued wrapped
  challenge). A token that a bearer exchange will take must fit the shared `AuthTokenSchema`
  (1024 characters): a plugin whose wrapped challenge is long returns a short single-use digest of
  it instead, which the exchange then spends in `AUTH_CACHE`.
- Bearers issued by this service carry an absolute `cfg.auth.sessionTtl` expiry (seven days by
  default) and an opaque session id. In a context with `AUTH_SESSION_MANAGER`, the guard rejects an
  absent, expired, pending or revoked session and re-signs fresh profile claims after a registry
  revision. Registry or identity-store failure is `AuthUnavailable` (503), never a false 401/logout.
- A session refresh re-reads the profile row and, where the context holds the identity account
  store, `accountStateOf(ctx).refusalOf(row)` (`@owlmeans/server-auth-identity`): a banned account
  or the app's PRIMARY row disabled since the session began ends the session (no re-signed token) —
  the same refusal the sign-in gives. A failing account store is `AuthUnavailable`.
- The session registry (`AUTH_SESSION_MANAGER`) is `@owlmeans/server-auth-session`'s, not exported
  here; `appendAuthService` installs its memory manager only as a single-process default. A
  central or multi-replica issuer registers `appendRedisAuthSessionManager(context)` before it;
  the manager is the authority that fences, refreshes or revokes an organization profile's sessions.
- The manager canonicalizes the organization entity: whatever slug (current, retired, or the frozen
  key) a plugin leaves on `credential.entitySlug` is resolved through `ENTITY_RESOLVER` and replaced
  with the current slug before the envelope is signed. An unresolvable value throws
  `AuthenFailed('entity')`. Where no resolver is registered the value is passed through untouched.
- Pair this package with `@owlmeans/server-auth-identity` when an external provider (Google, OIDC,
  email OTP) must map onto local account/profile/credential records.
- A reCAPTCHA token is a guest token: only `makeReCaptchaGuard` accepts it, once; the bearer
  exchange refuses it (see "reCAPTCHA guests").

## Depends On

- `@owlmeans/auth`, `@owlmeans/auth-common` — types, aliases, `trust()`, `extractAuthToken`
- `@owlmeans/basic-envelope`, `@owlmeans/basic-keys` — envelope signing and Ed25519 verification
- `@owlmeans/server-context`, `@owlmeans/server-entrypoint`, `@owlmeans/server-api`
- `@owlmeans/captcha` — the reCAPTCHA verifier and policy this package re-exports
- `@owlmeans/config` — the `TRUSTED` config resource
- `@owlmeans/static-resource` — the default `AUTH_CACHE` backing
