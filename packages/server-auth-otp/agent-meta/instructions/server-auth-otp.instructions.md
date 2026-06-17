---
description: "How to use @owlmeans/server-auth-otp — email OTP AuthPlugin and OtpService. Use when wiring passwordless email login in an OwlMeans server context."
applyTo: "**/context.ts, **/app/auth/*, **/services/otp*"
---
<!-- AUTO-GENERATED — do not edit. Regenerate via sync-agent-meta. -->

# Using `@owlmeans/server-auth-otp`

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
- Returns `{ challenge: email }` in a signed envelope.

**Authenticate** — client sends `{ challenge: <signed-envelope>, userId: email, credential: '123456', entityId: 'the-entity' }`:
- Envelope is opened → email is extracted.
- OTP service verifies the code (throws `AuthenFailed` if wrong or expired), then deletes it.
- `IdentityLinkingService` finds or creates the user profile scoped to `entityId`.
- Sets `credential.type = AuthenticationType.OneTimeToken` and returns the signed auth token.

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

## Related instructions

- `@owlmeans/auth-otp` (common) — `OtpService` interface and constants
- `@owlmeans/mailer` (common) — `MailerService` interface, console transport
- `@owlmeans/server-mailer-mailgun` (common) — production Mailgun transport
- `@owlmeans/server-auth` (common) — auth-manager plugin system
- `auth-protocol` instructions — error hierarchy, identity read rules
