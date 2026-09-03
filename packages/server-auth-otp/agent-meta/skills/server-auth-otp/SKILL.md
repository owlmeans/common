---
name: server-auth-otp
description: "How to use @owlmeans/server-auth-otp — email OTP AuthPlugin and OtpService. Use when wiring passwordless email login in an OwlMeans server context. Applies to files matching **/context.ts, **/app/auth/*, **/services/otp*."
metadata:
  applyTo: "**/context.ts, **/app/auth/*, **/services/otp*"
---
<!-- AUTO-GENERATED — do not edit. Regenerate via sync-agent-meta. -->

# Using `@owlmeans/server-auth-otp`

**Install:** `"@owlmeans/server-auth-otp": "^0.1.18-rc.18"` in `dependencies`

Email OTP authentication plugin for the OwlMeans auth-manager plugin system. Relies on `@owlmeans/auth-otp` for the OTP service interface, a Redis resource for code storage, and a `MailerService` to send codes.

## Public API surface

| Symbol | Kind | Purpose |
|--------|------|---------|
| `makeOtpService(alias?)` | fn | Service factory — stores/verifies OTP codes |
| `appendOtpPlugin(context)` | fn | Registers the OTP `AuthPlugin` into the server-auth plugin registry |
| `OTP_AUTH_TYPE` | const | `'email-otp'` — the auth type string to pass in `init` requests |
| `OTP_RESOURCE` | const | Redis resource alias for code storage |
| `OTP_TTL_SECONDS` | const | Code TTL (600 s = 10 min) |
| `OTP_CODE_LENGTH` | const | 6 |

## Registration requirements

```ts
import { makeOtpService, appendOtpPlugin, OTP_RESOURCE } from '@owlmeans/server-auth-otp'
import { makeRedisResource } from '@owlmeans/redis-resource'
import { makeConsoleMailerService, CONSOLE_MAILER, MAILER_SERVICE } from '@owlmeans/mailer'
import { makeMailgunMailerService } from '@owlmeans/server-mailer-mailgun'

// 1. Register the Redis code-cache resource.
context.registerResource(makeRedisResource(OTP_RESOURCE))

// 2. Register a MailerService (console for dev/tests, Mailgun for prod).
context.registerService(makeConsoleMailerService(MAILER_SERVICE))
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
- `IdentityLinkingService` finds or creates the user profile scoped to `entityId`.
- Sets `credential.type = AuthenticationType.OneTimeToken` and returns the signed auth token.
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
- The `credential.entityId` in the authenticate request determines which entity the resulting identity profile is scoped to. Pass it from the OIDC interaction.
- Errors from this plugin are `AuthenFailed` (from `@owlmeans/auth`) — callers catch that, not raw `Error`.
- For tests, use `makeConsoleMailerService()` and read `svc.captured[n].text` to extract the code.

## Gotchas

- **The challenge must never be just the plaintext email.** The auth manager's anti-replay guard
  (`AUTH_CACHE` in `@owlmeans/server-auth`) burns the *decoded* challenge into a Redis
  create-once record before the plugin's own credential check runs. If `init()` returned the bare
  email, that decoded value would be identical across every independent login attempt for the same
  address, so a second legitimate login within the cache TTL (`AUTHEN_TIMEFRAME`, 10 min) — right
  code or wrong — collides with the still-cached prior attempt and throws
  `AuthenFailed('challenge')` (a `RecordExists` underneath), not an OTP-specific error. Fix: `init()`
  appends a fresh `createIdOfLength(16, IdStyle.Base58)` nonce (`'<email>::<nonce>'`); `authenticate()`
  splits it back apart. Never revert to a bare-email challenge.
- **`AuthCredentialsSchema.credential` has a `minLength` floor** (from `@owlmeans/auth`) sized for
  long tokens/signatures from other plugins (Ed25519 signature, OAuth code). A 6-digit OTP code is
  legitimately shorter — the schema's floor must stay low enough (`minLength: 1` as of this
  writing) to admit it, or every authenticate call 400s before the plugin ever runs.
- **`scopes`/`role`/`type` are schema-required on the authenticate body**, spread from
  `AuthPayloadSchema.required` into `AuthCredentialsSchema` — even though this plugin overwrites
  all three on success. A caller built without going through `@owlmeans/client-auth`'s
  `AuthenticationControl` (which fills them automatically) must set them explicitly or the request
  fails Fastify schema validation (`FST_ERR_VALIDATION`) before reaching this plugin at all.
- **The resulting auth token can exceed 1024 characters** — it wraps the full `AuthCredentials`
  envelope, including the original allowance challenge, base64-encoded. A consumer route that
  accepts this token (e.g. an OIDC `PROVIDER_INTERACTION` finalizer) must size its own `token`
  field schema accordingly; the generic `AuthTokenSchema` (`maxLength: 1024`) is too small.

## Related instructions

- `@owlmeans/auth-otp` (common) — `OtpService` interface and constants
- `@owlmeans/mailer` (common) — `MailerService` interface, console transport
- `@owlmeans/server-mailer-mailgun` (common) — production Mailgun transport
- `@owlmeans/server-auth` (common) — auth-manager plugin system
- `auth-protocol` instructions — error hierarchy, identity read rules
