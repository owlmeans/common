---
name: server-auth-email
description: How to use @owlmeans/server-auth-email — the server half of OwlMeans e-mail sign-in. appendEmailAuth / appendEmailAuthResources / serveEmailAuthEntrypoints; the PIN and password sign-in through PRIVATE auth plugins run by makeAuthModel's exclusive list; tokens stamped email-pin / email-password carrying a short spend key; remembered devices (hashed browser id, 30 days, newest 10); scrypt passwords; the strict captcha; throttles; the offer ticket; email-confirm confirmations; the developer tech routes (PIN rewrite, captcha/throttle waiver) behind GUARD_ED25519 and a signer allowlist; localized PIN mails. Auto-invoked when wiring e-mail sign-in into a server context, changing its routes, flags, stores or throttles, or debugging a refused e-mail sign-in.
user-invocable: false
---
<!-- AUTO-GENERATED — do not edit. Regenerate via sync-agent-meta. -->

# @owlmeans/server-auth-email

**Layer:** Server (L10)
**Install:** `"@owlmeans/server-auth-email": "^0.1.20-rc.1"` in `dependencies` (`mongodb` peer)
**Contracts:** `@owlmeans/auth-email` (tree, schemas, constants) · **Browser:** `@owlmeans/web-auth-email`

## Wiring

```typescript
// shared package: the guest routes unguarded, the password routes behind the app's session
export const emailAuthProtocols = makeEmailAuthProtocols({ guards: [DEFAULT_GUARD], gate: { alias: APP_GATE } })

// server context — AUTH_SRV_KEY trusted record (with its secret) and a shared AUTH_CACHE first
context.registerResource(makeRedisResource('app-email-auth'))
context.registerService(makeRedisOtpChallengeStore('app-email-challenges', 'app-email-auth'))
context.registerService(makeRedisThrottleService('app-email-throttle', 'app-email-auth'))
context.registerService(myMailer)                                   // the alias cfg.otp.mailerAlias names
context.cfg.otp = { mailerAlias, challengeStoreAlias: 'app-email-challenges', identityAlias }   // NO throttleRules
context.registerService(makeOtpService())
appendEmailAuthResources(context, AUTH_IDENTITY_DB_ALIAS)
appendEmailAuth(context, {
  password: true,
  captcha: { siteKey, secret, hostnames, minScore },               // null / '' siteKey = off
  tech: { enabled: () => cfg.debug?.supervisor === true, signers: ['shared-key'] },
  ipOf: req => clientIpOf(req),
  throttleAlias: 'app-email-throttle',
  ticketResourceAlias: 'app-email-auth',
})

// API process
context.registerEntrypoints(serveEmailAuthEntrypoints(emailAuthProtocols))
```

- `serveEmailAuthEntrypoints` binds the three parent routes and every server route, whatever the
  flags: the password routes answer `EmailPasswordDisabled` and the tech routes `EmailTechDisabled`
  (both 404) while off. The `offer` screen is the browser's.
- **Never set `cfg.otp.throttleRules`** on the OTP service this package uses: the OTP service would
  then throttle every issuance itself, under a developer waiver too. This package throttles each
  route on its own keys.
- Give it stores of its own (Redis resource, challenge store, throttle, mail alias) when the process
  also hosts another OTP flow — an IAM's `OTP_RESOURCE` or a guest-route throttle must not share
  windows with sign-in.
- `appendEmailAuthResources` registers Mongo `auth-email:password` (`email-password`, `accountId`
  unique) and `auth-email:device` (`email-device`, `(accountId, key)` unique, TTL on `expiresAt`) —
  usually on the identity store's db config, whose `resourcePrefix` prefixes the collections too.

## Options — `EmailAuthServerOptions`

| Option | Default | Meaning |
|---|---|---|
| `password` | off | `true` or `{ minLength?, maxLength? }` (8…128, NFKC, not the address) |
| `captcha` | off | `CaptchaSettings` — built into `makeCaptchaCheck` on the first request, after mounted paths resolve |
| `tech` | off | `{ enabled: boolean \| () => boolean, signers }` — `signers` are `TRUSTED` record NAMES; `enabled` re-read per request |
| `ipOf` | none | client address; without it no IP throttles and no `remoteip` |
| `identityAlias` | `cfg.otp.identityAlias ?? AUTH_IDENTITY_LINKING` | the `IdentityLinkingService` |
| `otpAlias` | `OTP_SERVICE` | |
| `throttleAlias` | none | an `AuthThrottleService`; absent = no throttles at all |
| `throttle` | `EMAIL_AUTH_THROTTLE_RULES` | `pinEmail` 1/60 s + 10/h, `pinIp` 20/600 s, `pinGlobal` 600/60 s, `passwordEmail` 10/900 s, `passwordIp` 50/900 s, `confirmAccount` 1/60 s + 10/h |
| `ticketResourceAlias` | in-process | Redis resource for offer tickets — required with more than one replica |
| `devices` | `{ ttlDays: 30, limit: 10 }` | |
| `mail` | built-in | `{ [purpose]: { [locale]: OtpMessage } }`; purposes `sign-in`, `confirm-set`, `confirm-change`, `confirm-remove` |

## Invariants

- **Private plugins.** Each sign-in runs `makeAuthModel(ctx, { plugins })`
  (`@owlmeans/server-auth/manager`) with this request's `email-pin` / `email-password` plugins as an
  EXCLUSIVE list, built per request (device id and resolved account in the closure). They are never
  `registerPlugin`-ed, so the manager's ungated `/authentication/*` cannot reach them, and a
  challenge of a global type (`email-otp`, `pk-supervisor`, `re-captcha`) is refused here.
- **Token types.** A token is stamped `email-pin` or `email-password` (type, role, scopes, `userId`,
  `profileId`, `entitySlug` all overwritten from the linked identity) — never `email-otp` or
  `one-time-token`, so an integrated IAM's finalizer and gate keep refusing it. The identity
  credential is still `{ type: 'email-otp', service: 'email', userId: <address> }`: OTP and e-mail
  sign-in land on ONE account per address.
- **The token carries a spend key, not the challenge.** The plugins return
  `emailAuthKeyHelper.spendKey(challenge)` — a short digest — as their `token`, which the model
  puts where the challenge would go. The wrapped PIN challenge does not fit the shared 1024-character
  `AuthTokenSchema` the bearer exchange validates; the digest is also the single-use key the
  exchange spends in `AUTH_CACHE`.
- **No oracle.** Send-PIN answers the same for every address. A password sign-in on an unknown
  device, with a wrong password or for a missing account answers the same `{ challenge, reason:
  'device' }` without checking the password. On a known device, "no password" and "wrong password"
  are the same `AuthenFailed('email:password')` after the same scrypt work. Password sign-in never
  registers an account.
- **Order per request:** IP and global throttles → captcha → per-address throttle → account and
  device lookup → scrypt. A failed captcha never spends a person's per-address budget.
- **Devices.** Key `sha256("{accountId}:{device id}")` (the browser's id is never stored); remembered
  only inside a successful sign-in; reads filter `expiresAt > now`; upsert then trim to the newest
  `limit`. A password set, change or removal forgets every other device but the request's `device`;
  sessions are NOT revoked.
- **Passwords.** `node:crypto` scrypt N=2^15 r=8 p=1, 32-byte key, 16-byte salt, 64 MB `maxmem`,
  stored `scrypt$32768$8$1$<salt>$<key>` (base64url), compared with `timingSafeEqual`.
- **Confirmations.** `password.pin` mails a PIN to the ACCOUNT's own address and answers an
  `email-confirm` envelope (signed with `AUTH_SRV_KEY`) binding purpose, account, address and the
  PIN's issuance, living as long as the PIN. `set` accepts it with purpose `set` when no password
  exists, `change` when one does; `remove` with `remove`. A sign-in challenge is no confirmation and
  vice versa. Refusals are `EmailVerificationRefused` (403 — never 401, so a signed-in client keeps
  its session).
- **Offer ticket.** 32 random bytes, stored as a digest, bound to its account for 15 minutes,
  returned only by a PIN sign-in of an account with no password that has not declined; spent once by
  `set` (no PIN) or `decline`, and only while the account still has no password. Another account's
  attempt leaves it unspent.
- **Developer routes.** `GUARD_ED25519` + the `EMAIL_AUTH_TECH_GATE` gate: Service role, signer
  name in `tech.signers`, `tech.enabled` true at that moment. `tech.pin` rewrites the PIN of a
  pending sign-in or confirmation challenge (`OtpService.rewriteChallenge`: lifetime kept, attempts
  reset). `tech.waiver` signs an `email-waiver` envelope (~2 h) sent in `x-owlmeans-email-waiver`:
  honoured only while tech is on, it skips the captcha and the send/password/confirm throttles —
  never the five-attempt PIN limit — and `options` answers `captcha: null` under it.
- **Mails.** Templates per purpose × `EMAIL_AUTH_LOCALES`, chosen by the request's validated
  `locale` (primary subtag), default `en`. A subject never carries `{{code}}`: console mailers log
  subjects and lock screens show them.
- **Logs** carry an address's domain only — never a PIN, password, device id, waiver or token.
  Events `auth.email.*` (password set/changed/removed and waiver issued at `info`, the rest `debug`)
  beside `makeAuthModel`'s `auth.signed-in` / `auth.refused`.

## Refusals

Guest routes: wrong PIN, password or challenge → `EmailCredentialRefused` (`AuthenFailed`, 401);
refused captcha or confirmation → `EmailVerificationRefused` (403); throttled → `OtpThrottled` (429,
`retryAfter`); not exactly one sign-in mode, or a challenge of another method → `AuthUnknown` (400);
the `auth-email` errors (404 / 409 / 422 / 503) as the contracts package lists them.

## Tests

`bun test ./tests`: unit specs over memory stores and a stand-in `CAPTCHA_VERIFIER`; `mongo.spec.ts`
and `redis.spec.ts` are env-gated (`mongoGate` / `redisGate`, `/testing-integration`) — devices, TTL
filter, rotation, password records, Redis tickets and OTP rewrite. Signed tech calls are made with
`signBasicEd25519Request` (`auth-common`).

## Related

`auth-email` · `web-auth-email` · `server-auth` (`makeAuthModel` options) · `server-auth-otp` (the
message and rewrite seams) · `captcha` · `server-auth-identity` (linking) · `test-ui`
(`makeEmailTechClient`, `loginViaEmailForm`)
