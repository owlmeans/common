# @owlmeans/auth-email

The shared contracts of OwlMeans e-mail sign-in — a mailed PIN, an optional password, remembered
devices and an optional captcha: the protocol factory `makeEmailAuthProtocols`, the AJV request
schemas, the views, the constants and the error family. Server and browser both depend on it so
they agree on every route, field and value. It contains no runtime behaviour: a server serves the
routes with `@owlmeans/server-auth-email`, a browser signs in with `@owlmeans/web-auth-email`.

## Installation

```bash
bun add @owlmeans/auth-email@^0.1.20-rc.1
```

`ajv` and `ajv-formats` are peer dependencies (the schemas use `format: 'email'`).

## Concepts

- **PIN sign-in** — `pin` mails a 6-digit PIN and answers a signed `challenge`, identically for a
  known and a new address; `signIn` with `challenge` + `pin` signs the person in (registering the
  account on first use) and remembers the device.
- **Password sign-in** — `signIn` with `password` (+ `captcha`). On a remembered device it answers a
  `token`; on an unknown one the password is NOT checked: a PIN is mailed and the answer is
  `{ challenge, reason: 'device' }`, the same for a wrong password, a right one and no account.
- **One sign-in body** — `EmailSignInRequest` carries both modes' optional fields; the server
  accepts exactly one mode (`challenge` + `pin`, or `password`) and refuses anything else.
- **Device** — a random id the browser keeps (`EMAIL_DEVICE_ID_PATTERN`); remembered for
  `EMAIL_DEVICE_TTL_DAYS`, at most `EMAIL_DEVICE_LIMIT` per account.
- **Offer** — a PIN sign-in of a person without a password who has not declined one also answers a
  one-use `offer` ticket (`EMAIL_OFFER_TTL_SECONDS`): `password.set` with it needs no second PIN.
  Later set/change/remove are confirmed by a PIN from `password.pin`.
- **Tech routes** — developer tooling (`GUARD_ED25519` + the `EMAIL_AUTH_TECH_GATE` gate): rewrite
  a pending PIN, or get a signed waiver (`EMAIL_WAIVER_HEADER`) that skips captcha and throttles.
- **No organization on the wire** — no request body carries `entitySlug` or `source`; the address
  alone decides the account.

## Routes

`makeEmailAuthProtocols(opts)` — default base `/auth/email`:

| Protocol | Alias | Method + path | Guard | Body → answer |
|---|---|---|---|---|
| `options` | `auth-email:options` | GET `/options` | none | → `EmailAuthOptionsView` |
| `pin` | `auth-email:pin` | POST `/pin` | none | `EmailPinRequest` → `EmailChallengeView` |
| `signIn` | `auth-email:sign-in` | POST `/sign-in` | none | `EmailSignInRequest` → `EmailSignInView` |
| `password.status` | `auth-email:password:status` | GET `/password` | `opts.guards` + `opts.gate` | → `EmailPasswordStatusView` |
| `password.pin` | `auth-email:password:pin` | POST `/password/pin` | same | `EmailPasswordPinRequest` → `EmailChallengeView` |
| `password.set` | `auth-email:password:set` | POST `/password/set` | same | `EmailPasswordSetRequest` → `EmailPasswordStatusView` |
| `password.remove` | `auth-email:password:remove` | POST `/password/remove` | same | `EmailPasswordRemoveRequest` → `EmailPasswordStatusView` |
| `password.decline` | `auth-email:password:decline` | POST `/password/decline` | same | `{}` → `EmailPasswordStatusView` |
| `tech.pin` | `auth-email:tech:pin` | POST `/tech/pin` | `GUARD_ED25519` + tech gate | `EmailTechPinRequest` → `EmailTechPinView` |
| `tech.waiver` | `auth-email:tech:waiver` | POST `/tech/waiver` | same | `{}` → `EmailTechWaiverView` |
| `offer` | `auth-email:offer` | screen `/login/password` | — | frontend, sticky |

The bases `base` (`auth-email:base`), `password.base` (`auth-email:password`) and `tech.base`
(`auth-email:tech`) carry the guards their children inherit and have no handler.

## Usage

```typescript
import { DEFAULT_GUARD } from '@owlmeans/auth-common'
import { makeEmailAuthProtocols } from '@owlmeans/auth-email'

// One tree, shared by the server and the browser.
export const emailAuthProtocols = makeEmailAuthProtocols({
  guards: DEFAULT_GUARD,                    // the password routes need the app's session
  gate: { alias: APP_AUTH_GATE },
})
```

| Option | Default | Effect |
|---|---|---|
| `path` / `parent` | `/auth/email` / none | where the guest base sits |
| `guards` + `gate` | — | the password subtree's guards; required unless `passwordParent` |
| `passwordParent` | the guest base | mount `/password` under an already guarded route instead |
| `techGuards` / `techGate` | `[GUARD_ED25519]` / `{ alias: EMAIL_AUTH_TECH_GATE }` | the tech subtree's guards |
| `screen` | `{ path: '/login/password' }`, top level | the offer screen |

Neither `guards` nor `passwordParent` throws a `SyntaxError` at declaration time.

## API

### Constants

| Symbol | Value |
|---|---|
| `EMAIL_LOGIN_METHOD` | `'email'` — client plugin type and login method id |
| `EMAIL_PIN_AUTH_TYPE` / `EMAIL_PASSWORD_AUTH_TYPE` | `'email-pin'` / `'email-password'` — private server plugins and token types |
| `EMAIL_CONFIRM_ENVELOPE` / `EMAIL_WAIVER_ENVELOPE` | `'email-confirm'` / `'email-waiver'` |
| `EMAIL_WAIVER_HEADER` | `'x-owlmeans-email-waiver'` |
| `EMAIL_CAPTCHA_ACTION_PIN` / `EMAIL_CAPTCHA_ACTION_PASSWORD` | `'email_pin'` / `'email_password'` |
| `EMAIL_CAPTCHA_PROVIDER` | `'recaptcha-v3'` |
| `EMAIL_IDENTITY_TYPE` | `'email-otp'` — the identity-linking details type (equals `OTP_AUTH_TYPE`), never a token type |
| `EMAIL_PIN_LENGTH` / `EMAIL_PIN_PATTERN` | `6` / `'^[0-9]{6}$'` |
| `EMAIL_DEVICE_TTL_DAYS` / `EMAIL_DEVICE_LIMIT` / `EMAIL_DEVICE_ID_PATTERN` | `30` / `10` / `'^[A-Za-z0-9_-]{22,64}$'` |
| `EMAIL_OFFER_TTL_SECONDS` / `EMAIL_WAIVER_TTL_SECONDS` | `900` / `7200` |
| `EMAIL_PASSWORD_MIN_LENGTH` / `EMAIL_PASSWORD_MAX_LENGTH` | `8` / `128` (policy, checked by the server) |
| `EMAIL_ADDRESS_MAX_LENGTH`, `EMAIL_PASSWORD_WIRE_MAX_LENGTH`, `EMAIL_TOKEN_MAX_LENGTH`, `EMAIL_LOCALE_MAX_LENGTH` | `254`, `1024`, `4096`, `16` — wire bounds |
| `EMAIL_AUTH_LOCALES` | `['en', 'pl', 'ru', 'be', 'uk', 'es', 'de', 'fr']` (frozen) |
| `EmailPasswordPurpose` | `Set = 'set'`, `Change = 'change'`, `Remove = 'remove'` |
| `EmailSignInReason` | `Device = 'device'` |
| `EMAIL_AUTH_SERVICE` / `EMAIL_LOGIN_SERVICE` / `EMAIL_AUTH_TECH_GATE` | `'auth-email'` / `'auth-email-client'` / `'auth-email:tech-gate'` |
| `EMAIL_AUTH_API_PATH` / `EMAIL_AUTH_OFFER_PATH` | `'/auth/email'` / `'/login/password'` |
| `EMAIL_AUTH_*` aliases | `BASE`, `OPTIONS`, `PIN`, `SIGN_IN`, `PASSWORD`, `PASSWORD_STATUS`, `PASSWORD_PIN`, `PASSWORD_SET`, `PASSWORD_REMOVE`, `PASSWORD_DECLINE`, `TECH`, `TECH_PIN`, `TECH_WAIVER`, `OFFER` |

### Schemas

`EmailPinRequestSchema`, `EmailSignInRequestSchema`, `EmailPasswordPinRequestSchema`,
`EmailPasswordSetRequestSchema`, `EmailPasswordRemoveRequestSchema`, `EmailTechPinRequestSchema`,
`EmailEmptyRequestSchema` — every one `additionalProperties: false`; `email` is `format: 'email'`
up to 254 characters, `pin` six digits, `device` the device-id pattern, `password` 1–1024 characters.

### Errors

| Class | Status | Meaning |
|---|---|---|
| `EmailAuthError` | — | base, message `auth-email:<reason>` |
| `EmailPasswordDisabled` | 404 | passwords are not offered here |
| `EmailPasswordWeak` | 422 | the new password breaks the policy |
| `EmailOfferExpired` | 409 | the offer ticket is spent, expired or another account's |
| `EmailTechDisabled` | 404 | the developer routes are off |
| `EmailAuthUnavailable` | 503 | a store, mailer or captcha authority failed; fail closed |

A wrong PIN or password is `AuthenFailed` from `@owlmeans/auth`, never one of these.

## Common pitfalls

- Do not send `entitySlug` or `source` in a body — every schema refuses unknown fields.
- Trim and lowercase the address before sending it; `format: 'email'` refuses surrounding spaces.
- Never bind the tech routes where developer tooling is off; the server checks its flag per request.

## Related packages

- [`@owlmeans/auth-otp`](../auth-otp) — the PIN issuance and verification contract
- [`@owlmeans/auth-common`](../auth-common) — `GUARD_ED25519` and `signBasicEd25519Request` for the tech routes
- [`@owlmeans/entrypoint`](../entrypoint) / [`@owlmeans/route`](../route) — the protocol DSL

<!-- owlmeans:agent-guidance:start -->
## Agent guidance

This package ships embedded agent skills under `agent-meta/`. After installing your
`@owlmeans/*` packages, run the OwlMeans agent-skills installer to place them into
your project's skill store (`.agents/skills/`):

```sh
npx @owlmeans/agent-skills@^0.1.20-rc.1
```

The embedded files are version-matched to this package release. Do not edit them
directly — they are regenerated on each publish. To contribute guidance edits,
open a PR against the source monorepo.
<!-- owlmeans:agent-guidance:end -->
