---
name: server-auth-otp
description: "How to use @owlmeans/server-auth-otp — email OTP AuthPlugin and OtpService. Use when wiring passwordless email login in an OwlMeans server context. Applies to files matching **/context.ts, **/app/auth/*, **/services/otp*."
metadata:
  applyTo: "**/context.ts, **/app/auth/*, **/services/otp*"
---

# Using `@owlmeans/server-auth-otp`

**Install:** `"@owlmeans/server-auth-otp": "^0.1.18-rc.17"` in `dependencies`

Email OTP authentication plugin for the OwlMeans auth-manager plugin system. Relies on `@owlmeans/auth-otp` for the OTP service interface, a Redis resource for code storage, and a `MailerService` to send codes.

## `@owlmeans/auth-otp` — the contracts

`@owlmeans/auth-otp` has no skill of its own because it has no behaviour: it is the contract half of
this pair, and everything it declares is implemented here. It carries the `OtpService` interface —
`issueChallenge(email)`, which generates a code, persists it with a TTL and mails it, and
`verifyChallenge(email, code)`, which verifies and consumes it — plus the names both halves agree
on: `OTP_SERVICE`, `OTP_AUTH_TYPE` (`'email-otp'`), `OTP_RESOURCE`, `OTP_TTL_SECONDS` (600) and
`OTP_CODE_LENGTH` (6). Nothing else; no Redis, no mailer, no plugin.

Depend on it from a shared package that must name the auth type or type the service, and depend on
`@owlmeans/server-auth-otp` only where the server wires itself up — the same producer/consumer split
every other contracts-and-driver pair in the framework uses. Add a constant or a method signature to
the contracts package, never to the implementation.

## Public API surface

| Symbol | Kind | Purpose |
|--------|------|---------|
| `makeOtpService(alias?)` | fn | Service factory — stores/verifies OTP codes |
| `appendOtpPlugin(context)` | fn | Registers the OTP `AuthPlugin` into the server-auth plugin registry |
| `OTP_SERVICE` | const | `'auth-otp-service'` — the service alias `makeOtpService` registers under |
| `OTP_AUTH_TYPE` | const | `'email-otp'` — the auth type string to pass in `init` requests |
| `OTP_RESOURCE` | const | Redis resource alias for code storage |
| `OTP_TTL_SECONDS` | const | Code TTL (600 s = 10 min) |
| `OTP_CODE_LENGTH` | const | 6 |
| `SERVER_AUTH_OTP` | const | `'server-auth-otp'` — this package's own alias |
| `OtpConfig`, `OtpContext` | type | The `cfg.otp` overrides below, as a server config/context |

## Registration requirements

```ts
import { makeOtpService, appendOtpPlugin, OTP_RESOURCE } from '@owlmeans/server-auth-otp'
import { makeRedisResource } from '@owlmeans/redis-resource'
import { makeDefaultConsoleMailerService, MAILER_SERVICE } from '@owlmeans/mailer'
import { makeMailgunMailerService } from '@owlmeans/server-mailer-mailgun'

// 1. Register the Redis code-cache resource.
context.registerResource(makeRedisResource(OTP_RESOURCE))

// 2. Register a MailerService under MAILER_SERVICE (console for dev/tests, Mailgun for prod).
context.registerService(makeDefaultConsoleMailerService())
// or:
context.registerService(makeMailgunMailerService(MAILER_SERVICE))

// 3. Register the OTP service (reads from Redis + Mailer).
context.registerService(makeOtpService())

// 4. Register the OTP AuthPlugin into the auth-manager plugin registry.
appendOtpPlugin(context)
```

## Auth flow

**Init** — client sends `{ type: 'email-otp', userId: 'user@email.com' }`:
- OTP service generates a 6-digit code, stores it in Redis with 10 min TTL, emails it.
- Returns `{ challenge: '<email>::<nonce>' }` in a signed envelope — see Gotchas below for why the
  nonce is required, not optional.

**Authenticate** — client sends `{ challenge: <signed-envelope>, userId: email, credential: '123456', type: 'email-otp', role: AuthRole.User, scopes: [ALL_SCOPES] }`:
- Envelope is opened → `email::nonce` is extracted, split on `::` to recover the email (the nonce
  itself is discarded — it only exists to make the challenge unique, see Gotchas).
- OTP service verifies the code (throws `AuthenFailed` if wrong or expired), then deletes it.
- `IdentityLinkingService` finds the linked profile, or links this email to the person's platform
  identity — registering an account, a profile and an organization entity only when the address is
  new to the platform.
- Copies `userId`, `profileId`, `entitySlug`, `role` and `scopes` from the resolved payload onto the
  credential, sets `credential.type = AuthenticationType.OneTimeToken`, and returns the signed auth
  token.
- `type`, `role`, `scopes` are required by the shared `AuthCredentialsSchema` (spread from
  `AuthPayloadSchema.required`) even though the OTP plugin overwrites `role`/`scopes`/`type` on
  success — a caller that omits them never reaches the plugin at all (see Gotchas).

## Config overrides (optional)

Pass `ctx.cfg.otp` to override defaults:

```ts
cfg.otp = {
  mailerAlias: 'my-mailer',       // default: MAILER_SERVICE ('mailer-service')
  resourceAlias: 'my-otp-cache',  // default: OTP_RESOURCE  ('auth-otp-cache')
  identityAlias: 'my-identity',   // default: AUTH_IDENTITY_LINKING
}
```

## Rules

- Always register the Redis resource AND the mailer service BEFORE the OTP service.
- Call `appendOtpPlugin(context)` once per context — it adds to the shared plugin registry singleton.
- `credential.entitySlug` on the authenticate request **selects nothing**. The plugin copies it into
  the linking details as `clientId` (defaulting to `'default'`) and `entityId`, and
  `@owlmeans/server-auth-identity` reads neither: `getLinkedProfile` keys on the external login key
  built from the auth type, the `'email'` service and the address, and `linkProfile` either reuses
  the person's existing platform profile — matched on the account name — or mints a brand-new
  organization entity. Whatever the caller sent is then overwritten with the linked profile's own
  slug before the envelope is signed, so the address alone decides which identity and which
  organization the token names.
- Errors from this plugin are `AuthenFailed` (from `@owlmeans/auth`) — callers catch that, not raw `Error`.
- For tests, register `makeDefaultConsoleMailerService()` and read `svc.captured[n].text` to extract
  the code. Bare `makeConsoleMailerService()` registers under `CONSOLE_MAILER` (`'console-mailer'`),
  which is not the alias `makeOtpService` resolves — it looks up `cfg.otp?.mailerAlias ?? MAILER_SERVICE`.

## Gotchas

- **The challenge must never be just the plaintext email.** The auth manager's anti-replay guard
  (`AUTH_CACHE` in `@owlmeans/server-auth`) burns the *decoded* challenge into a create-once record
  before the plugin's own credential check runs. `AUTH_CACHE` defaults to a **static, in-memory**
  resource — the manager's context appends it, and nothing here upgrades it to Redis; the OTP codes
  are the only thing this package keeps in Redis. If `init()` returned the bare email, that decoded
  value would be identical across every independent login attempt for the same address, so a second
  legitimate login within the cache TTL (`AUTHEN_TIMEFRAME`, 15 min) — right code or wrong —
  collides with the still-cached prior attempt and throws `AuthenFailed('challenge')` (the
  resource's `RecordExists` underneath), not an OTP-specific error. Fix: `init()` appends a fresh
  `createIdOfLength(16, IdStyle.Base58)` nonce (`'<email>::<nonce>'`); `authenticate()` splits it
  back apart. Never revert to a bare-email challenge.
- **`AuthCredentialsSchema.credential` has a `minLength` floor** (from `@owlmeans/auth`) sized for
  long tokens/signatures from other plugins (Ed25519 signature, OAuth code). A 6-digit OTP code is
  legitimately shorter — the floor is `minLength: 1` and must stay low enough to admit it, or every
  authenticate call 400s before the plugin ever runs.
- **`scopes`/`role`/`type` are schema-required on the authenticate body**, spread from
  `AuthPayloadSchema.required` into `AuthCredentialsSchema` — even though this plugin overwrites
  all three on success. A caller built without going through `@owlmeans/client-auth`'s
  `AuthenticationControl` (which fills them automatically) must set them explicitly or the request
  fails Fastify schema validation (`FST_ERR_VALIDATION`) before reaching this plugin at all.
- **The resulting auth token can exceed 1024 characters** — it wraps the full `AuthCredentials`
  envelope, including the original allowance challenge, base64-encoded. A consumer route that
  accepts this token (e.g. an OIDC `PROVIDER_INTERACTION` finalizer) must size its own `token`
  field schema accordingly; the generic `AuthTokenSchema` (`maxLength: 1024`) is too small.

## Related

- `@owlmeans/auth-otp` — the `OtpService` interface and the shared constants
- `@owlmeans/mailer` — `MailerService`, the console transport
- `@owlmeans/server-mailer-mailgun` — the production Mailgun transport
- `server-auth` skill — the auth-manager plugin system this plugin registers into
- `server-auth-identity` skill — how the linked profile and its organization entity are stored
- `auth-protocol` skill — error hierarchy and identity read rules
