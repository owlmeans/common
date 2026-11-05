---
name: auth-email
description: How to use @owlmeans/auth-email — the runtime-free contracts of OwlMeans e-mail sign-in (a mailed PIN, an optional password, remembered devices, an optional captcha, developer tech routes). Covers makeEmailAuthProtocols and its options (guest base, guarded password subtree, Ed25519 tech subtree, the offer screen), the wire shapes and AJV schemas, the EMAIL_* constants (token types email-pin / email-password, the email-otp identity type, waiver header, captcha actions, device/offer/waiver limits) and the error family. Auto-invoked when declaring the e-mail sign-in routes of an app, importing any EMAIL_* constant, Email* view/request/schema or error, or deciding where the password routes are guarded.
user-invocable: false
---
<!-- AUTO-GENERATED — do not edit. Regenerate via sync-agent-meta. -->

# @owlmeans/auth-email

**Layer:** Auth shared (L6 — `auth`, `auth-common`, `context`, `entrypoint`, `error`, `route`; `ajv` + `ajv-formats` peers)
**Install:** `"@owlmeans/auth-email": "^0.1.21"` in `dependencies`
**Halves:** `@owlmeans/server-auth-email` serves the routes, `@owlmeans/web-auth-email` signs a
person in. This package holds no behaviour — the tree, schemas, views, constants and errors both
sides must agree on.

## The model in one paragraph

`pin` mails a 6-digit PIN and answers a signed `challenge`, identically for a known and a new
address; `signIn` with `challenge` + `pin` signs the person in, registering the account on first
use, and remembers the device. `signIn` with `password` answers a token on a REMEMBERED device; on
any other device the password is NOT checked — a PIN is mailed and the answer is
`{ challenge, reason: 'device' }`, the same for a wrong password, a right one and no account. A PIN
sign-in of a person without a password who has not declined one also answers a one-use `offer`
ticket; `password.set` with it needs no second PIN. Later set/change/remove are confirmed by a PIN
from `password.pin`. No body carries `entitySlug` or `source`: the address alone decides the account.

## The tree — `makeEmailAuthProtocols(opts)`

Default base `/auth/email` (`EMAIL_AUTH_API_PATH`):

| Protocol | Method + path | Guard | Body → answer |
|---|---|---|---|
| `options` | GET `/options` | none | → `{ password, captcha: { provider, siteKey } \| null, pinLength }` |
| `pin` | POST `/pin` | none | `{ email, locale?, captcha? }` → `{ challenge }` |
| `signIn` | POST `/sign-in` | none | PIN `{ email, device, challenge, pin }` or password `{ email, device, password, captcha? }` → `{ token?, offer?, challenge?, reason? }` |
| `password.status` | GET `/password` | `opts.guards` + `opts.gate` | → `{ enabled, set, declined, updatedAt? }` |
| `password.pin` | POST `/password/pin` | same | `{ purpose: set\|change\|remove, locale? }` → `{ challenge }` |
| `password.set` | POST `/password/set` | same | `{ password, offer }` or `{ password, challenge, pin }` (+ `device?`) → status |
| `password.remove` | POST `/password/remove` | same | `{ challenge, pin, device? }` → status |
| `password.decline` | POST `/password/decline` | same | `{}` → status |
| `tech.pin` | POST `/tech/pin` | `opts.techGuards` + `opts.techGate` | `{ challenge, pin }` → `{ ok }` |
| `tech.waiver` | POST `/tech/waiver` | same | `{}` → `{ waiver, expiresAt }` |
| `offer` | screen `/login/password` | — | frontend, sticky: the post-sign-in "set a password" step |

The bases (`base`, `password.base`, `tech.base`) carry the guards their children inherit and have no
handler. Aliases are `auth-email:<name>` (`EMAIL_AUTH_*` constants).

| Option | Default | Effect |
|---|---|---|
| `path` / `parent` | `/auth/email` / none | where the guest base sits — keep it UNGUARDED: a guest calls it |
| `guards` + `gate` | — | the password subtree's guards; required unless `passwordParent` (neither → `SyntaxError` at declaration) |
| `passwordParent` | the guest base | mount `/password` under an already guarded route instead |
| `techGuards` / `techGate` | `[GUARD_ED25519]` / `{ alias: EMAIL_AUTH_TECH_GATE }` | the developer subtree |
| `screen` | `{ path: '/login/password' }` | the offer screen |

```typescript
import { DEFAULT_GUARD } from '@owlmeans/auth-common'
import { makeEmailAuthProtocols } from '@owlmeans/auth-email'

export const emailAuthProtocols = makeEmailAuthProtocols({ guards: [DEFAULT_GUARD], gate: { alias: APP_GATE } })
```

**Declare it as a tree of its own**, never inside an app tree whose guarding is copied onto every
leaf (an access-token coguard, a tree-wide gate): the guest routes must stay unguarded, and an access
token must never set or remove a password. Pin it to the one service that serves it. The frozen tree
interface has no index signature — cast it for `bindAll`, as for marketing consent.

## Constants that are contracts

| Symbol | Value | Meaning |
|---|---|---|
| `EMAIL_LOGIN_METHOD` | `'email'` | client plugin type and login method id |
| `EMAIL_PIN_AUTH_TYPE` / `EMAIL_PASSWORD_AUTH_TYPE` | `'email-pin'` / `'email-password'` | the private server plugins and the signed token types — never `email-otp` |
| `EMAIL_IDENTITY_TYPE` | `'email-otp'` | the identity-LINKING details type (= `OTP_AUTH_TYPE`), so OTP and e-mail sign-in land on one account per address; never a token type |
| `EMAIL_CONFIRM_ENVELOPE` / `EMAIL_WAIVER_ENVELOPE` | `'email-confirm'` / `'email-waiver'` | signed envelope types |
| `EMAIL_WAIVER_HEADER` | `'x-owlmeans-email-waiver'` | where a developer waiver travels |
| `EMAIL_CAPTCHA_ACTION_PIN` / `_PASSWORD` | `'email_pin'` / `'email_password'` | the exact reCAPTCHA actions |
| `EMAIL_PIN_LENGTH` / `EMAIL_PIN_PATTERN` | `6` / `'^[0-9]{6}$'` | |
| `EMAIL_DEVICE_TTL_DAYS` / `EMAIL_DEVICE_LIMIT` / `EMAIL_DEVICE_ID_PATTERN` | `30` / `10` / `'^[A-Za-z0-9_-]{22,64}$'` | the device id is 16 random bytes, base64url |
| `EMAIL_OFFER_TTL_SECONDS` / `EMAIL_WAIVER_TTL_SECONDS` | `900` / `7200` | |
| `EMAIL_PASSWORD_MIN_LENGTH` / `_MAX_LENGTH` | `8` / `128` | policy, checked by the server; the wire admits 1–1024 |
| `EMAIL_AUTH_LOCALES` | `en pl ru be uk es de fr` | the built-in mail and UI languages |
| `EMAIL_AUTH_SERVICE` / `EMAIL_LOGIN_SERVICE` / `EMAIL_AUTH_TECH_GATE` | `'auth-email'` / `'auth-email-client'` / `'auth-email:tech-gate'` | service aliases |
| `EmailPasswordPurpose`, `EmailSignInReason` | `set`/`change`/`remove`; `device` | enums |

## Schemas and errors

Every request schema (`Email*RequestSchema`, `EmailEmptyRequestSchema`) is
`additionalProperties: false`; `email` is `format: 'email'` ≤ 254 characters — trim and lowercase it
before sending. A body with both modes or neither is refused by the server (`AuthUnknown`, 400).

| Class | Status | Meaning |
|---|---|---|
| `EmailAuthError` | — | base, message `auth-email:<reason>` |
| `EmailPasswordDisabled` | 404 | passwords are not offered here |
| `EmailPasswordWeak` | 422 | the new password breaks the policy |
| `EmailOfferExpired` | 409 | the offer ticket is spent, expired or another account's |
| `EmailTechDisabled` | 404 | the developer routes are off |
| `EmailAuthUnavailable` | 503 | a store, mailer or captcha authority failed — fail closed |

A wrong PIN, password or captcha is an `AuthenFailed` from `@owlmeans/auth` (the server's
`EmailCredentialRefused` 401 / `EmailVerificationRefused` 403), never one of these.

## Related

`server-auth-email` · `web-auth-email` · `server-auth-otp` (the PIN store and its five attempts) ·
`captcha` · `marketing-consent` (the same tree + screen + step pattern)
