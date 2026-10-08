# @owlmeans/auth-otp

The shared contract of OwlMeans passwordless email login: the `OtpService` interface and the
constants both sides of an email-OTP flow agree on — the service alias, the auth type a client
selects, the code-store alias, the code length, its lifetime and the failed-attempt limit. A shared
(common) package depends on it when it must name the `'email-otp'` auth type or type the service. It
contains no runtime code beyond those constants: it generates, stores and mails nothing. A server
wires the actual flow with `@owlmeans/server-auth-otp`, which implements `OtpService`, the challenge
stores, throttles and the auth plugin.

## Installation

```bash
bun add @owlmeans/auth-otp@^0.1.18-rc.34
```

## Concepts

- **Contracts half** — this package is the producer/consumer contract; `@owlmeans/server-auth-otp`
  is the implementation. A new constant or method signature is added here, never only in the
  implementation.
- **Challenge** — one issuance of a code. `issueChallenge(email)` generates a code, persists it with
  a TTL, mails it and returns an **opaque issuance id** that contains neither the email nor the code.
- **Verification** — `verifyChallenge(email, issuanceId, code)` checks and atomically consumes that
  exact issuance; it resolves on success and throws otherwise.
- **Attempt limit** — a challenge is invalidated on its `OTP_MAX_FAILED_ATTEMPTS`-th (fifth) failed
  guess.

## Usage

### Select the email-OTP auth type on a client

A client names the plugin by its auth type when it starts an authentication; the constant keeps the
string identical on both sides.

```typescript
import { OTP_AUTH_TYPE, OTP_CODE_LENGTH } from '@owlmeans/auth-otp'

const init = { type: OTP_AUTH_TYPE, userId: email }  // 'email-otp'

const isComplete = (code: string) => code.length === OTP_CODE_LENGTH && /^\d+$/.test(code)
```

### Type the service in shared code

```typescript
import type { BasicContext, BasicConfig } from '@owlmeans/context'
import { OTP_SERVICE } from '@owlmeans/auth-otp'
import type { OtpService } from '@owlmeans/auth-otp'

export const otpService = (ctx: BasicContext<BasicConfig>) => ctx.service<OtpService>(OTP_SERVICE)

// server side, after @owlmeans/server-auth-otp registered the implementation
const issuanceId = await otpService(ctx).issueChallenge('user@example.com')
await otpService(ctx).verifyChallenge('user@example.com', issuanceId, '123456')
```

## API

### Types

| Symbol | Kind | Purpose |
|---|---|---|
| `OtpService` | interface | extends `InitializedService` (`@owlmeans/context`) |
| `OtpService.issueChallenge(email)` | method | `→ Promise<string>` — generate, persist with TTL, email; returns the opaque issuance id |
| `OtpService.verifyChallenge(email, issuanceId, code)` | method | `→ Promise<void>` — verify and atomically consume one issuance |

### Constants

| Symbol | Value | Purpose |
|---|---|---|
| `OTP_SERVICE` | `'auth-otp-service'` | service alias the implementation registers under |
| `OTP_AUTH_TYPE` | `'email-otp'` | auth plugin type string a client sends |
| `OTP_RESOURCE` | `'auth-otp-cache'` | resource alias for pending codes |
| `OTP_TTL_SECONDS` | `600` | code lifetime (10 minutes) |
| `OTP_CODE_LENGTH` | `6` | numeric digits per code |
| `OTP_MAX_FAILED_ATTEMPTS` | `5` | a challenge is invalidated on its fifth failed guess |

The barrel exports only these string and number constants plus the type; the package tests pin every
value, because changing one changes what server and clients agree on.

## Common pitfalls

- Do not import this package expecting an implementation — `makeOtpService`, `appendOtpPlugin` and
  the stores live in `@owlmeans/server-auth-otp`.
- Never encode the email or the code into the issuance id; it stays opaque and owned by the OTP
  store, which counts attempts and consumes it.
- Do not hard-code `'email-otp'` or `6` in clients — import `OTP_AUTH_TYPE` and `OTP_CODE_LENGTH`.
- Depend on `@owlmeans/server-auth-otp` only where the server wires itself up; shared packages depend
  on this one.

The `server-auth-otp` skill covers this package together with its implementation: registration
order, the auth flow, config overrides and throttling.

## Related packages

- [`@owlmeans/server-auth-otp`](../server-auth-otp) — the `OtpService` implementation, challenge stores, throttles and the `AuthPlugin`
- [`@owlmeans/context`](../context) — `InitializedService`, the base of `OtpService`
- [`@owlmeans/auth`](../auth) — the auth payload and credential types the OTP flow produces
- [`@owlmeans/mailer`](../mailer) — the `MailerService` that delivers the codes
