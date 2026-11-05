# @owlmeans/server-auth-email

The server half of OwlMeans e-mail sign-in, serving the routes of `@owlmeans/auth-email`'s
`makeEmailAuthProtocols`. A person signs in (or registers) with a PIN mailed to their address, may
add a password, and uses it on devices they signed in on during the last 30 days. A password
sign-in on any other device gets a PIN as well — unless the deployment (`devicePin: false`) or the
account itself, from its password panel, turned that new-device PIN off. An optional reCAPTCHA v3 check (`@owlmeans/captcha`) guards send-PIN and password sign-in,
and throttles count requests per address, client IP, account and in total. Developer routes rewrite a
pending PIN and sign a waiver that skips the captcha and the throttles, so end-to-end tests can sign
in. The browser half is `@owlmeans/web-auth-email`.

## Installation

```bash
bun add @owlmeans/server-auth-email@^0.1.21
```

## Wiring

```typescript
import { DEFAULT_GUARD } from '@owlmeans/auth-common'
import { makeEmailAuthProtocols } from '@owlmeans/auth-email'
import { makeRedisResource } from '@owlmeans/redis-resource'
import { AUTH_IDENTITY_DB_ALIAS, appendAuthIdentityResources } from '@owlmeans/server-auth-identity'
import {
  makeOtpService, makeRedisOtpChallengeStore, makeRedisThrottleService, OTP_CHALLENGE_STORE, OTP_THROTTLE_SERVICE,
} from '@owlmeans/server-auth-otp'
import { appendEmailAuth, appendEmailAuthResources, serveEmailAuthEntrypoints } from '@owlmeans/server-auth-email'

// shared package: the guest routes carry no guards; the password routes need the app's session
export const emailAuthProtocols = makeEmailAuthProtocols({ guards: [DEFAULT_GUARD], gate: { alias: APP_GATE } })

// backend context: AUTH_SRV_KEY trusted record (with its secret), AUTH_CACHE, a mailer, then
context.registerResource(makeRedisResource('auth-email-redis'))
context.registerService(makeRedisOtpChallengeStore(OTP_CHALLENGE_STORE, 'auth-email-redis'))
context.registerService(makeRedisThrottleService(OTP_THROTTLE_SERVICE, 'auth-email-redis'))
context.registerService(makeOtpService())                       // cfg.otp = { mailerAlias, challengeStoreAlias }
appendAuthIdentityResources(context, AUTH_IDENTITY_DB_ALIAS, { service: MY_APP })
appendEmailAuthResources(context, AUTH_IDENTITY_DB_ALIAS)
appendEmailAuth(context, {
  password: true,
  captcha: { siteKey, secret, hostnames: 'example.org', minScore: 0.5 },   // null = off
  tech: { enabled: () => cfg.debug?.supervisor === true, signers: ['supervisor'] },
  ipOf: req => clientIpOf(req),
  throttleAlias: OTP_THROTTLE_SERVICE,
  ticketResourceAlias: 'auth-email-redis',
})

// API process
context.registerEntrypoints(serveEmailAuthEntrypoints(emailAuthProtocols))
```

`serveEmailAuthEntrypoints` binds the three parent routes (guest base, `password`, `tech`) and
every server route. It does not bind the `offer` screen, which belongs to the browser. Do not
configure `cfg.otp.throttleRules` on the OTP service this package uses. Those rules would apply
under a valid waiver too.

## Options — `EmailAuthServerOptions`

| Option | Default | Meaning |
|---|---|---|
| `password` | off | `true` or `{ minLength?, maxLength? }` (default 8…128 characters, NFKC) turns password sign-in and the password routes on |
| `captcha` | off | `CaptchaSettings` `{ siteKey, secret, hostnames, minScore }`; an empty `siteKey` = off; enabled but incomplete fails closed (503) |
| `tech` | off | `{ enabled: boolean \| () => boolean, signers: string[] }` — the developer routes; `signers` are `TRUSTED` record NAMES |
| `ipOf` | none | `(req) => string \| null` — the client address; without it no IP throttles and no `remoteip` for the captcha |
| `identityAlias` | `cfg.otp.identityAlias ?? AUTH_IDENTITY_LINKING` | the `IdentityLinkingService` |
| `otpAlias` | `OTP_SERVICE` | the `OtpService` |
| `throttleAlias` | none | an `AuthThrottleService`; without it there are no throttles at all |
| `throttle` | `EMAIL_AUTH_THROTTLE_RULES` | replaces single rules: `pinEmail` 1/60 s + 10/h, `pinIp` 20/600 s, `pinGlobal` 600/60 s, `passwordEmail` 10/900 s, `passwordIp` 50/900 s, `confirmAccount` 1/60 s + 10/h |
| `ticketResourceAlias` | in-process store | a Redis resource for the offer tickets (needed with more than one replica) |
| `devices` | 30 days, 10 | `{ ttlDays?, limit? }` — how long and how many devices stay remembered |
| `devicePin` | `true` | a password sign-in on a device the account does not remember gets a mailed PIN; `false` lets the password alone sign it in. Each account may choose otherwise from its password panel |
| `mail` | built-in | `{ [purpose]: { [locale]: OtpMessage } }` — replaces a mail; purposes `sign-in`, `confirm-set`, `confirm-change`, `confirm-remove`, `confirm-device-pin` |

## Routes

| Route | Service member | Answer |
|---|---|---|
| `GET options` | `options` | `{ password, captcha: { provider, siteKey } \| null, pinLength }`; `captcha` is `null` under a valid waiver |
| `POST pin` | `sendPin` | `{ challenge }` — the same answer for a known and an unknown address |
| `POST sign-in` | `signIn` | PIN mode → `{ token, offer? }`; password mode → `{ token }` on a remembered device or while the new-device PIN is off, otherwise `{ challenge, reason: 'device' }` |
| `GET password` | `status` | `{ enabled, set, declined, updatedAt?, devicePin? }` (`enabled: false` while passwords are off; `devicePin`, the new-device PIN in effect, while they are on) |
| `POST password/pin` | `confirmPin` | `{ challenge }` — mails a confirmation PIN to the account's own address |
| `POST password/set` | `setPassword` | status — confirmed by `offer` (no password yet) or `challenge` + `pin` (purpose `set` / `change`) |
| `POST password/remove` | `removePassword` | status — confirmed by `challenge` + `pin` (purpose `remove`); counts as declined |
| `POST password/decline` | `decline` | status |
| `POST password/device-pin` | `setDevicePin` | `{ enabled }` → `{ challenge }` (a confirmation PIN mailed); `{ enabled, challenge, pin }` → `{ status }`. Needs a set password |
| `POST tech/pin` | `techPin` | `{ ok }` — rewrites the PIN of a pending sign-in or confirmation challenge |
| `POST tech/waiver` | `techWaiver` | `{ waiver, expiresAt }` — send it in `x-owlmeans-email-waiver` for two hours |

Refusals: a wrong PIN, password or challenge on the guest routes → `EmailCredentialRefused` (an
`AuthenFailed`, 401); a refused captcha or confirmation → `EmailVerificationRefused` (an
`AuthenFailed`, 403, never 401, so a signed-in client keeps its session); throttled → `OtpThrottled`
(429, `retryAfter`); passwords off → `EmailPasswordDisabled` (404); developer routes off →
`EmailTechDisabled` (404); a weak password → `EmailPasswordWeak` (422); a spent, expired or foreign
offer → `EmailOfferExpired` (409); not exactly one mode, or a challenge of another sign-in method →
`AuthUnknown` (400).

## Storage

`appendEmailAuthResources(context, dbAlias?)` registers two Mongo resources, usually on the
identity store's db config:

| Alias | Collection | Record | Indexes |
|---|---|---|---|
| `auth-email:password` | `email-password` | `{ accountId, hash?, declined, devicePin?, createdAt, updatedAt }` | `accountId` unique |
| `auth-email:device` | `email-device` | `{ accountId, key, createdAt, lastSeenAt, expiresAt }` | `(accountId, key)` unique; TTL on `expiresAt` |

`accountId` is the identity store's account id (the token's `userId`). A device `key` is
`sha256("{accountId}:{device id}")`. Reads also filter `expiresAt > now`, and a sign-in keeps only
the 10 most recently seen devices. A hash is `scrypt$32768$8$1$<salt>$<key>` (`node:crypto` scrypt,
16-byte salt, 32-byte key, base64url parts).

## Security notes

- **Private plugins.** Each sign-in runs through `makeAuthModel(ctx, { plugins })` from
  `@owlmeans/server-auth/manager`, with this request's plugins as an EXCLUSIVE list. The plugins
  are never registered globally. The auth manager's own `/authentication/*` routes cannot reach
  `email-pin` / `email-password`, and a challenge of a global type (`email-otp`, `pk-supervisor`,
  `re-captcha`) is refused here.
- **Token types.** Tokens are stamped `email-pin` or `email-password`, never `email-otp` or
  `one-time-token`, so the integrated IAM's finalizer keeps refusing them. The identity credential
  is still type `email-otp`, so OTP and e-mail sign-in land on one account per address.
- **No oracle.** Send-PIN answers the same for every address. A wrong password and an address
  with no account always get the answer of the deployment's `devicePin`: while it is on,
  `{ challenge, reason: 'device' }` on an unknown device, the password unchecked; while it is off,
  `AuthenFailed('email:password')`. On a known device, "no password" and "wrong password" are the
  same `AuthenFailed('email:password')` after the same scrypt work. Password sign-in never registers
  an account.
- **New-device PIN.** An account's own choice (`devicePin` on its password record, set through
  `password/device-pin` and confirmed by a mailed PIN) overrides the deployment's, and counts only
  behind the account's correct password. It survives a password change and is dropped with the
  password.
- **Order.** IP and global throttles run first, then the captcha, then the per-address throttle,
  then the account and device lookup, then scrypt. A failed captcha never spends a person's
  per-address budget.
- **Confirmations.** A confirmation challenge is an `email-confirm` envelope signed with
  `AUTH_SRV_KEY`. It binds the purpose (`set`, `change`, `remove`, or `device-pin` for the switch),
  the account, the address and the mailed PIN, and lives as long as the PIN. A sign-in challenge is no confirmation, and a confirmation is no sign-in
  challenge.
- **Offer tickets.** A ticket is 32 random bytes, stored as a digest and bound to its account for
  15 minutes. It is spent once and only by that account, and only while the account has no
  password. Another account's attempt leaves it unspent.
- **Devices.** A password set, change or removal forgets every other remembered device but the
  request's `device`. Sessions are not revoked.
- **Developer routes.** They need `GUARD_ED25519` with the Service role, from a signer in
  `tech.signers`. The flag is re-read on every request. A waiver counts only while the routes are
  on. It skips the captcha and the throttles, never the five-attempt limit of a PIN.
- **Logs.** Logs carry an address's domain only, never a PIN, password, device id, waiver or token.
  Events are `auth.email.*`, beside `makeAuthModel`'s `auth.signed-in` / `auth.refused`.

<!-- owlmeans:agent-guidance:start -->
## Agent guidance

This package ships embedded agent skills under `agent-meta/`. After installing your
`@owlmeans/*` packages, run the OwlMeans agent-skills installer to place them into
your project's skill store (`.agents/skills/`):

```sh
npx @owlmeans/agent-skills@^0.1.21
```

The embedded files are version-matched to this package release. Do not edit them
directly — they are regenerated on each publish. To contribute guidance edits,
open a PR against the source monorepo.
<!-- owlmeans:agent-guidance:end -->
