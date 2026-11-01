---
name: captcha
description: How to use @owlmeans/captcha — server-side reCAPTCHA verification for OwlMeans services. The siteverify verifier service (CAPTCHA_VERIFIER, injectable fetch), the lenient policy the re-captcha sign-in plugin of server-auth applies (makeCaptchaPolicyModel), and the strict challenge-less check a route runs on a score-based token before it acts (makeCaptchaCheck — score, hostnames and exact action required, fail closed). Auto-invoked when a route must verify a captcha token, when wiring or stubbing the reCAPTCHA verifier, or when choosing between the guest re-captcha plugin and a strict per-route check.
user-invocable: false
---

# @owlmeans/captcha

**Layer:** Server-side (no Fastify, no context of its own — `auth`, `config`, `context`, `log`)
**Install:** `"@owlmeans/captcha": "^0.1.19"` in `dependencies`
**Browser half:** `@owlmeans/web-captcha` (the reCAPTCHA v3 loader and `useCaptcha`)

Three things, one per need:

| Need | Use | Strictness |
|---|---|---|
| Ask Google about one token | the verifier service under `CAPTCHA_VERIFIER` (`'re-captcha-verifier'`) | — |
| A guest sign-in (`re-captcha` plugin of `@owlmeans/server-auth`) | `makeCaptchaPolicyModel(record)` over a `MOD_RECAPTCHA` plugin record | lenient: every field optional, `''` = no check, a checkbox answer without a score passes |
| A route that acts on a token (sends a mail, checks a password) | `makeCaptchaCheck(ctx, settings)` | strict: once on, nothing is optional |

`@owlmeans/server-auth` re-exports the verifier and the lenient policy under their historical names
(`RECAPTCHA_VERIFIER`, `createReCaptchaVerifierService`, `appendReCaptchaVerifierService`,
`makeReCaptchaPolicyModel`, the `ReCaptcha*` types) — same alias, same refusals. Import from this
package in new code.

## Key Exports

| Export | Description |
|---|---|
| `makeCaptchaCheck(ctx, settings \| null)` | `CaptchaCheck`: `enabled()`, `siteKey()`, `assert({ token, action, remoteip? })` |
| `createCaptchaVerifierService(alias?, options?)` | The default verifier: one form POST to siteverify; `options.url` must be https, `options.fetch` injectable, `options.timeout` default 10 s |
| `appendCaptchaVerifierService(ctx, alias?, options?)` | Register a verifier on a context |
| `makeCaptchaPolicyModel(record)` | The lenient policy: `hostnames()`, `minScore()`, `actions()`, `assert(answer)` |
| `CAPTCHA_VERIFIER` | `'re-captcha-verifier'` |
| `RECAPTCHA_SITEVERIFY_URL`, `RECAPTCHA_VERIFY_TIMEOUT` | `https://www.google.com/recaptcha/api/siteverify`, `10_000` |
| `CAPTCHA_PROVIDER_RECAPTCHA_V3` | `'recaptcha-v3'` — the provider id a server advertises to its browser |
| `CaptchaSettings` | `{ siteKey, secret, hostnames: string[] \| string, minScore: number \| string }` — mounted-file strings accepted as they are |
| `CaptchaCheckRequest`, `CaptchaCheck` | The strict check's request and object |
| `CaptchaResponse`, `CaptchaRequest`, `CaptchaVerifierService`, `CaptchaFetch`, `CaptchaVerifierOptions` | The verifier's types |
| `CaptchaPolicyRecord`, `CaptchaPolicyModel` | The lenient policy's types |

## The strict check

```typescript
import { CAPTCHA_PROVIDER_RECAPTCHA_V3, makeCaptchaCheck } from '@owlmeans/captcha'

const captcha = makeCaptchaCheck(context, {
  siteKey: cfg.captcha.siteKey,        // '' = off
  secret: cfg.captcha.secret,
  hostnames: 'example.org, example.com',
  minScore: '0.5',
})

// advertise: { provider: CAPTCHA_PROVIDER_RECAPTCHA_V3, siteKey } or null
const siteKey = captcha.siteKey()

// in the handler, before acting
await captcha.assert({ token: body.captcha, action: 'email_pin', remoteip })
```

- **Off while `siteKey` is empty** — `enabled()` false, `siteKey()` null, `assert` passes.
- **On, every rule holds**, checked in this order, each refusal `AuthenFailed` (401):
  `recaptcha:missing` (no token) → Google's own refusal `recaptcha:<error-codes>` /
  `recaptcha:unknown` → `recaptcha:score` (no numeric score, or below `minScore`) →
  `recaptcha:hostname` (not a listed host nor a subdomain of one) → `recaptcha:action` (not exactly
  the call's `action`).
- **Fail closed.** Enabled with an empty secret, an empty hostname list or a `minScore` that is
  empty or outside 0…1 → `AuthUnavailable('recaptcha:config')` (503, logged once per check); Google
  unreachable or answering garbage → `AuthUnavailable('recaptcha')`. Never a pass. "No floor" is
  `minScore: 0`, never `''`.
- **One action per protected call.** A token minted for one action never passes another; name the
  action the browser executed (`grecaptcha.execute(siteKey, { action })`) on the server side too.
- **The settings are read once, when the check is built.** Build it only after the config's mounted
  paths are resolved (the Configuration stage) — `server-auth-email` builds its check on the first
  request for exactly that reason. The verifier is resolved per call: `CAPTCHA_VERIFIER` from the
  context when registered, else the default.

## Rules

- A strict check never needs a `MOD_RECAPTCHA` plugin record. Declaring one switches the GUEST
  `re-captcha` sign-in on for the manager's generic `/authentication/*` routes — never add it just to
  hand a route its secret; pass `CaptchaSettings` instead.
- Tests register a stand-in verifier under `CAPTCHA_VERIFIER` (or append the default over an
  injected `fetch`) — no network, no other mock:

  ```typescript
  context.registerService(createService<CaptchaVerifierService>(CAPTCHA_VERIFIER, {
    verify: async () => ({ success: true, challenge_ts: '', hostname: 'example.org', score: 0.9, action: 'email_pin' }),
  }))
  ```

- The secret never leaves the server: advertise only `{ provider, siteKey }`.
- A v3 site key works only on the domains listed in Google's console for it; a page elsewhere gets
  "Invalid domain for site key" and every token is refused (`recaptcha:hostname` or Google's codes).

## External docs

- https://developers.google.com/recaptcha/docs/verify — siteverify: form-encoded `secret` + `response` (+ `remoteip`); answers `success`, `challenge_ts`, `hostname`, `score`, `action`, `error-codes`; a token is verifiable once, within two minutes
- https://developers.google.com/recaptcha/docs/v3 — scores 0.0–1.0 and the action come back from siteverify; the site picks the threshold

## Related

`web-captcha` (the browser half) · `server-auth` (the guest `re-captcha` plugin and its guard) ·
`server-auth-email` (the strict check in front of send-PIN and password sign-in)
