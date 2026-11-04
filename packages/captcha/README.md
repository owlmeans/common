# @owlmeans/captcha

Server-side captcha verification for OwlMeans services: Google's reCAPTCHA siteverify verifier, the
lenient policy of the `re-captcha` sign-in plugin of `@owlmeans/server-auth`, and a strict,
challenge-less check a route runs on a score-based (v3) token before it acts — sends a mail, checks
a password. The browser half (loading reCAPTCHA v3 and getting a token) is `@owlmeans/web-captcha`.

## Installation

```bash
bun add @owlmeans/captcha@^0.1.20-rc.0
```

## Concepts

- **Verifier** — a context service under `CAPTCHA_VERIFIER` (`'re-captcha-verifier'`) that asks
  Google about one token. The default one is a single https form POST; a test or a proxy registers
  its own under the same alias. A refusal is an answer (`success: false`); Google unreachable or
  answering garbage is `AuthUnavailable('recaptcha')` (503), never a pass.
- **Lenient policy** — `makeCaptchaPolicyModel(record)` judges an answer by a plugin record whose
  every field is optional (`''` = no check; a checkbox answer without a score passes). It is what
  the `re-captcha` guest sign-in of `@owlmeans/server-auth` applies.
- **Strict check** — `makeCaptchaCheck(ctx, settings)` is off while `siteKey` is empty. Once a site
  key is set nothing is optional: a score is required, the hostname list must not be empty and every
  call names the exact action its token must carry. Incomplete settings fail closed with
  `AuthUnavailable('recaptcha:config')` (logged once per check).

## Usage

```typescript
import { CAPTCHA_PROVIDER_RECAPTCHA_V3, makeCaptchaCheck } from '@owlmeans/captcha'

const captcha = makeCaptchaCheck(context, {
  siteKey: cfg.recaptcha.siteKey,          // '' = captcha off
  secret: cfg.recaptcha.secret,
  hostnames: 'example.org, example.com',   // or ['example.org', 'example.com']
  minScore: '0.5',                         // or 0.5
})

// advertise to the browser
const siteKey = captcha.siteKey()
const view = { captcha: siteKey != null ? { provider: CAPTCHA_PROVIDER_RECAPTCHA_V3, siteKey } : null }

// in the handler, before acting
await captcha.assert({ token: body.captcha, action: 'email_pin', remoteip })
```

A test registers a stand-in verifier under `CAPTCHA_VERIFIER` (or appends the default one over an
injected `fetch`) — no network:

```typescript
context.registerService(createService<CaptchaVerifierService>(CAPTCHA_VERIFIER, {
  verify: async () => ({ success: true, challenge_ts: '', hostname: 'example.org', score: 0.9, action: 'email_pin' }),
}))
```

## API

| Export | Description |
|---|---|
| `makeCaptchaCheck(ctx, settings \| null)` | `CaptchaCheck`: `enabled()`, `siteKey()`, `assert({ token, action, remoteip? })` |
| `createCaptchaVerifierService(alias?, options?)` | The default siteverify verifier; `options.url` must be https, `options.fetch` injectable, `options.timeout` default 10 s |
| `appendCaptchaVerifierService(ctx, alias?, options?)` | Register a verifier on a context |
| `makeCaptchaPolicyModel(record)` | The lenient policy: `hostnames()`, `minScore()`, `actions()`, `assert(answer)` |
| `CAPTCHA_VERIFIER` | `'re-captcha-verifier'` |
| `RECAPTCHA_SITEVERIFY_URL`, `RECAPTCHA_VERIFY_TIMEOUT` | `https://www.google.com/recaptcha/api/siteverify`, `10_000` |
| `CAPTCHA_PROVIDER_RECAPTCHA_V3` | `'recaptcha-v3'` — the provider id a server advertises |
| `CaptchaSettings`, `CaptchaCheckRequest`, `CaptchaCheck` | The strict check's types |
| `CaptchaResponse`, `CaptchaRequest`, `CaptchaVerifierService`, `CaptchaFetch`, `CaptchaVerifierOptions` | The verifier's types |
| `CaptchaPolicyRecord`, `CaptchaPolicyModel` | The lenient policy's types |

### Strict check refusals

All refusals are `AuthenFailed` (401), in this order:

| Reason | When |
|---|---|
| `recaptcha:missing` | no token |
| `recaptcha:<error-codes>` / `recaptcha:unknown` | Google's own refusal |
| `recaptcha:score` | no numeric score, or below `minScore` |
| `recaptcha:hostname` | the answer's host is neither a listed host nor a subdomain of one |
| `recaptcha:action` | the answer's action is not exactly the call's `action` |

`AuthUnavailable` (503): `recaptcha:config` (enabled with an empty secret, an empty hostname list or a
`minScore` outside 0…1) and `recaptcha` (Google unreachable).

<!-- owlmeans:agent-guidance:start -->
## Agent guidance

This package ships embedded agent skills under `agent-meta/`. After installing your
`@owlmeans/*` packages, run the OwlMeans agent-skills installer to place them into
your project's skill store (`.agents/skills/`):

```sh
npx @owlmeans/agent-skills@^0.1.20-rc.0
```

The embedded files are version-matched to this package release. Do not edit them
directly — they are regenerated on each publish. To contribute guidance edits,
open a PR against the source monorepo.
<!-- owlmeans:agent-guidance:end -->
