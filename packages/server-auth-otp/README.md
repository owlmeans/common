# @owlmeans/server-auth-otp

Email one-time-code login for an OwlMeans server: the `OtpService` implementation that issues and
verifies codes, the `'email-otp'` `AuthPlugin` for the `@owlmeans/server-auth` plugin registry,
atomic challenge stores and sliding-window throttles (Redis for production, memory for development
and tests), and the OTP errors. A server uses it to offer passwordless sign-in by e-mail; the
verified address is resolved to an account through `@owlmeans/server-auth-identity`. It does not send
mail itself — a `MailerService` must be registered — and it is not the place for shared constants or
the `OtpService` type: depend on `@owlmeans/auth-otp` from a package that only names the auth type or
types the service, and on this package only where the server wires itself up.

## Installation

```bash
bun add @owlmeans/server-auth-otp@^0.1.18-rc.55
```

## Concepts

- **Issuance** — `issueChallenge(email)` creates a random 6-digit code (`OTP_CODE_LENGTH`), stores it
  for `OTP_TTL_SECONDS` (600 s) under an opaque issuance id, mails it and returns the id. The id
  never contains the address or the code.
- **Challenge store** — `OtpChallengeStore`, keyed by digests from `otpKeyHelper`. `verify`
  compares, counts failures and consumes in one operation; after `OTP_MAX_FAILED_ATTEMPTS` (5) the
  issuance is exhausted.
- **Throttle** — `AuthThrottleService.consume(key, rules, token?)` applies every `ThrottleRule`
  (`{ limit, windowSeconds }`) together. Enabled only when `cfg.otp.throttleAlias` and
  `cfg.otp.throttleRules` are both set.
- **Plugin** — `appendOtpPlugin` registers the plugin factory under `OTP_AUTH_TYPE` in the
  server-auth registry. `init` issues a challenge `"<email>::<issuanceId>"`; `authenticate`
  verifies the code, links or finds the profile and fills the credential
  (`AuthenticationType.OneTimeToken`).

## Usage

### Wire the server

```typescript
import { MAILER_SERVICE } from '@owlmeans/mailer'
import { makeMailgunMailerService } from '@owlmeans/server-mailer-mailgun'
import { makeRedisResource } from '@owlmeans/redis-resource'
import {
  OTP_RESOURCE, appendOtpPlugin, makeOtpService, makeRedisOtpChallengeStore, makeRedisThrottleService,
} from '@owlmeans/server-auth-otp'

context.registerResource(makeRedisResource(OTP_RESOURCE))          // challenge and throttle storage
context.registerService(makeRedisOtpChallengeStore())               // OTP_CHALLENGE_STORE
context.registerService(makeRedisThrottleService())                 // OTP_THROTTLE_SERVICE
context.registerService(makeMailgunMailerService(MAILER_SERVICE))   // delivers the code
context.registerService(makeOtpService())                           // OTP_SERVICE

appendOtpPlugin(context)                                            // plugin under 'email-otp'
```

### Configure

```typescript
import { OTP_EMAIL_THROTTLE_RULES, OTP_THROTTLE_SERVICE } from '@owlmeans/server-auth-otp'
import type { OtpConfig } from '@owlmeans/server-auth-otp'

const otp: OtpConfig['otp'] = {
  throttleAlias: OTP_THROTTLE_SERVICE,
  throttleRules: OTP_EMAIL_THROTTLE_RULES,   // 1 per minute, 10 per hour
  // mailerAlias, resourceAlias, challengeStoreAlias, identityAlias override the defaults
}
```

### Test with in-memory stores and the console mailer

```typescript
import type { OtpService } from '@owlmeans/auth-otp'
import { makeDefaultConsoleMailerService } from '@owlmeans/mailer'
import {
  OTP_SERVICE, makeMemoryOtpChallengeStore, makeMemoryThrottleService, makeOtpService,
} from '@owlmeans/server-auth-otp'

const mailer = makeDefaultConsoleMailerService()
context.registerService(mailer)
context.registerService(makeMemoryOtpChallengeStore())
context.registerService(makeMemoryThrottleService())
context.registerService(makeOtpService())
await context.configure().init()

const otp = context.service<OtpService>(OTP_SERVICE)
const issuanceId = await otp.issueChallenge('user@example.com')
const code = mailer.captured[0].text?.match(/\d{6}/)?.[0] ?? ''
await otp.verifyChallenge('user@example.com', issuanceId, code)   // throws AuthenFailed('otp:code') on a mismatch
```

`OtpService` and `OTP_SERVICE` come from `@owlmeans/auth-otp` (the constant is also re-exported
here). The memory factories accept a clock as their second argument for deterministic tests.

## API

### Services and plugin

| Symbol | Purpose |
|---|---|
| `makeOtpService(alias = OTP_SERVICE)` | `OtpService`: `issueChallenge(email) → issuanceId`, `verifyChallenge(email, issuanceId, code)` |
| `appendOtpPlugin(context)` | registers the `'email-otp'` plugin factory; returns the context |
| `makeRedisOtpChallengeStore(alias?, resourceAlias?)` | atomic Redis store (`SET NX EX` + one Lua verify) |
| `makeMemoryOtpChallengeStore(alias?, now?)` | in-memory store for a single process or tests |
| `makeRedisThrottleService(alias?, resourceAlias?)` | every window checked and consumed in one Lua call |
| `makeMemoryThrottleService(alias?, now?)` | in-memory sliding-window throttle |
| `otpKeyHelper` (`createOtpKeyHelper()`) | `otpChallengeKey`, `otpEmailKey`, `otpCodeHash` — SHA-256 digests |
| `throttleKeyHelper` (`createThrottleKeyHelper()`) | `emailThrottleKey`, `ipThrottleKey` — digests, never raw values |
| `emailThrottleKey`, `ipThrottleKey` | deprecated standalone forms of the helper members |

### Constants

| Symbol | Value |
|---|---|
| `SERVER_AUTH_OTP` | `'server-auth-otp'` |
| `OTP_CHALLENGE_STORE` | `'auth-otp-challenge-store'` |
| `OTP_THROTTLE_SERVICE` | `'auth-otp-throttle'` |
| `OTP_EMAIL_THROTTLE_RULES` | `[{ limit: 1, windowSeconds: 60 }, { limit: 10, windowSeconds: 3600 }]` |
| `OtpChallengeOutcome` | `Verified`, `Invalid`, `Exhausted`, `Missing` |
| re-exported from `@owlmeans/auth-otp` | `OTP_AUTH_TYPE` (`'email-otp'`), `OTP_SERVICE`, `OTP_RESOURCE` (`'auth-otp-cache'`), `OTP_TTL_SECONDS`, `OTP_CODE_LENGTH`, `OTP_MAX_FAILED_ATTEMPTS` |

### Types

`OtpConfig` (`cfg.otp`: `mailerAlias?`, `resourceAlias?`, `challengeStoreAlias?`, `throttleAlias?`,
`throttleRules?`, `identityAlias?`), `OtpContext`, `OtpChallenge`, `OtpChallengeStore`,
`AuthThrottleService`, `ThrottleRule`, `ThrottleDecision`, `OtpKeyHelper`, `ThrottleKeyHelper`.

### Errors

| Class | Status | Meaning |
|---|---|---|
| `OtpError` | — | base, message `otp:<reason>` |
| `OtpThrottled` | 429 | issuance refused by the throttle; `retryAfter` in seconds |
| `OtpUnavailable` | 503 | the store or throttle backend failed, or an issuance id collided |

A wrong, expired or exhausted code is `AuthenFailed('otp:code')` from `@owlmeans/auth`; a missing or
malformed address is `AuthenFailed('otp:email')`.

## Auth flow

1. **Init** — the client sends `{ type: 'email-otp', userId: <email> }`; the plugin lowercases the
   address, issues a code and returns the challenge in the signed envelope.
2. **Authenticate** — the client sends the envelope as `challenge`, the code as `credential`, plus
   `type`, `role` and `scopes` (required by `AuthCredentialsSchema`). The plugin verifies the
   issuance, resolves the profile through the `IdentityLinkingService` under
   `cfg.otp.identityAlias ?? AUTH_IDENTITY_LINKING` (linking a new one when absent) and copies
   `userId`, `profileId`, `entitySlug`, `role` and `scopes` from it onto the credential.

## Common pitfalls

- `makeConsoleMailerService()` registers under `'console-mailer'`; the OTP service resolves
  `cfg.otp.mailerAlias ?? MAILER_SERVICE`. Use `makeDefaultConsoleMailerService()` in tests.
- Without a registered challenge store the service falls back to a Redis store over `OTP_RESOURCE`;
  register that resource or an explicit store.
- Throttling is off unless both `throttleAlias` and `throttleRules` are configured.
- `appendOtpPlugin` writes into a module-level registry — call it once; the context argument is only
  returned for chaining.
- `credential.entitySlug` on the authenticate request selects nothing: the linked payload's own slug
  overwrites it, so the address alone decides the account and organization entity.
- The resulting auth token can exceed 1024 characters; a route accepting it must size its schema
  beyond the generic `AuthTokenSchema`.
- Never encode the address or code into the issuance id, and never replace the attempt counter with
  a bare replay key.

## Related packages

- [`@owlmeans/auth-otp`](../auth-otp) — `OtpService` type and the shared OTP constants
- [`@owlmeans/server-auth`](../server-auth) — the auth-manager plugin registry this plugin joins
- [`@owlmeans/server-auth-identity`](../server-auth-identity) — `IdentityLinkingService`, which maps the address to an account
- [`@owlmeans/mailer`](../mailer) — `MailerService` and the console transport for tests
- [`@owlmeans/server-mailer-mailgun`](../server-mailer-mailgun) / [`@owlmeans/mailer-smtp`](../mailer-smtp) — production transports
- [`@owlmeans/redis-resource`](../redis-resource) — the Redis resource behind the stores and throttle

The `server-auth-otp` skill covers the flow and its schema gotchas for agents.

<!-- owlmeans:agent-guidance:start -->
## Agent guidance

This package ships embedded agent skills under `agent-meta/`. After installing your
`@owlmeans/*` packages, run the OwlMeans agent-skills installer to place them into
your project's skill store (`.agents/skills/`):

```sh
npx @owlmeans/agent-skills@^0.1.18-rc.52
```

The embedded files are version-matched to this package release. Do not edit them
directly — they are regenerated on each publish. To contribute guidance edits,
open a PR against the source monorepo.
<!-- owlmeans:agent-guidance:end -->
