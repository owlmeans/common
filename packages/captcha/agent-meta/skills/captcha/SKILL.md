---
name: captcha
description: How to use @owlmeans/captcha — the provider-neutral server half of OwlMeans captcha. The captcha host a provider plugs into (CaptchaProvider, ensureCaptchaService, captchaResolverOf), the MOD_CAPTCHA host record and lenient policy of the captcha guest sign-in of server-auth (makeCaptchaPolicyModel), and the strict challenge-less check a route runs on a score-based token before it acts (makeCaptchaCheck — provider, score, hostnames and exact action required, fail closed, no built-in provider). Auto-invoked when a route must verify a captcha token, when registering, writing or stubbing a captcha provider, or when choosing between the guest captcha sign-in and a strict per-route check.
user-invocable: false
---
<!-- AUTO-GENERATED — do not edit. Regenerate via sync-agent-meta. -->

# @owlmeans/captcha

**Layer:** Server-side (no Fastify — `auth`, `config`, `context`, `log`)
**Install:** `"@owlmeans/captcha": "^0.2.0-alpha.0"` in `dependencies`
**Browser half:** `@owlmeans/web-captcha` (the client contract, `captchaClients`, `useCaptcha`)
**Providers:** connect packages — Google reCAPTCHA is `@owlmeans/captcha-recaptcha`
(`appendRecaptcha(ctx)`, skill `captcha-recaptcha`)

This package names no captcha service. It holds the contract, the host and two policies; a provider
package brings the verification and registers itself explicitly.

| Need | Use | Strictness |
|---|---|---|
| Plug a captcha service in | a `CaptchaProvider` registered with `ensureCaptchaService(ctx).register(…)` (a provider package's `append*`) | — |
| A guest sign-in (the `captcha` plugin of `@owlmeans/server-auth`) | the `MOD_CAPTCHA` host record → `makeCaptchaPolicyModel(record)` | lenient: every field optional, `''` = no check, a verdict without a score passes |
| A route that acts on a token (sends a mail, checks a password) | `makeCaptchaCheck(ctx, settings)` | strict: once on, nothing is optional |

## Key Exports

| Export | Description |
|---|---|
| `CaptchaProvider` | `{ id, verify(token, { action?, remoteIp? }) → CaptchaVerdict, clientSettings() → { provider, siteKey } }` |
| `CaptchaVerdict` | `{ success, score?, action?, hostname?, at?, errors? }` — the neutral answer every policy judges |
| `createCaptchaService(alias?)`, `ensureCaptchaService(ctx)` | The host (lazy service `CAPTCHA_SERVICE`, `'captcha'`): `register(provider)`, `get(id?)` (no id = the only one), `list()`. `ensure` is idempotent and adds the boot check |
| `makeCaptchaResolver(ctx)`, `captchaResolverOf(ctx)` | Reads the host without registering one: `find(id?)`, `provider(id?)` (throws), `record()` (`MOD_CAPTCHA`), `assertReady()` |
| `MOD_CAPTCHA` | `'_external:captcha'` — the host record: `{ provider?, hostnames?, minScore?, actions? }`, no secret |
| `makeCaptchaPolicyModel(record)` | The lenient policy: `hostnames()`, `minScore()`, `actions()`, `assert(verdict)` |
| `makeCaptchaCheck(ctx, settings \| null)` | `CaptchaCheck`: `enabled()`, `clientSettings()`, `assertReady()`, `assert({ token, action, remoteIp? })` |
| `CaptchaSettings` | `{ provider?, hostnames?: string[] \| string, minScore?: number \| string }` — mounted-file strings accepted as they are; keys are never settings |
| `CaptchaClientSettings`, `CaptchaVerifyOptions`, `CaptchaService`, `CaptchaResolver`, `CaptchaPolicyRecord`, `CaptchaPolicyModel`, `CaptchaCheckRequest`, `CaptchaCheck` | Types |

## Fail closed — there is no built-in provider

- **No settings and no provider** — captcha off, as before: the check passes, the guest sign-in is
  off (`PluginMissconfigured('captcha')` without a `MOD_CAPTCHA` record).
- **Settings without their provider** are a boot error, never a sign-in without captcha:
  `PluginMissconfigured('captcha:provider:<id | any>')`, logged once with the reason
  (`auth.captcha.provider`). Raised by `CaptchaCheck.assertReady()` (server-auth-email's service init
  calls it), by the host's Loading-stage middleware for a declared `MOD_CAPTCHA` (added by the first
  `ensureCaptchaService`), and by server-auth's captcha guard at init.
- **No id and several providers** is not a guess: it is the same fault.
- At the call a missing provider is `AuthUnavailable('captcha:config')` — still never a pass.

## The strict check

```typescript
import { makeCaptchaCheck } from '@owlmeans/captcha'
import { appendRecaptcha, RECAPTCHA_PROVIDER } from '@owlmeans/captcha-recaptcha'

appendRecaptcha(context, { secret, siteKey })        // while the context is set up
const captcha = makeCaptchaCheck(context, {          // null = off
  provider: RECAPTCHA_PROVIDER,                       // absent = the only registered provider
  hostnames: 'example.org, example.com',
  minScore: '0.5',
})

captcha.assertReady()                                 // at boot
const view = { captcha: captcha.clientSettings() }    // { provider, siteKey } or null — advertise this
await captcha.assert({ token: body.captcha, action: 'email_pin', remoteIp })
```

- **On, every rule holds**, in this order, each refusal `AuthenFailed`: `captcha:missing` (no
  token) → the provider's own refusal `captcha:<errors>` / `captcha:unknown` → `captcha:score` (no
  numeric score, or below `minScore`) → `captcha:hostname` (not a listed host nor a subdomain of
  one) → `captcha:action` (not exactly the call's `action`).
- **Incomplete settings fail closed** — no provider, a provider with an empty site key, an empty
  hostname list or a `minScore` empty or outside 0…1 → `AuthUnavailable('captcha:config')` (503,
  logged once per check, `auth.captcha.config`). A provider that cannot be asked throws its own
  `AuthUnavailable` (`captcha`, `captcha:config`). "No floor" is `minScore: 0`, never `''`.
- **One action per protected call.** A token minted for one action never passes another; the
  browser executes the same action name.
- **The settings are read when the check is built.** Build it after the config's mounted paths are
  resolved (the Configuration stage) — at service init or later, never at module load.

## Writing a provider

A provider package (in OwlMeans connect, `@owlmeans/` scope) exports `make<P>Provider(options)` and
`append<P>(ctx, options?)` = `ensureCaptchaService(ctx).register(make<P>Provider(…))`; registration is
explicit, never a side-effect import. It owns its config records (the secret), its third-party
dependency and its wire details; `verify` maps the service's answer onto `CaptchaVerdict` and treats
a refused token as a verdict, an unreachable service as `AuthUnavailable('captcha')`.
`clientSettings().provider` is the provider's id — the browser picks its client by it.

## Rules

- A strict check never needs `MOD_CAPTCHA`. Declaring it switches the GUEST captcha sign-in on for
  the manager's generic `/authentication/*` routes — never add it just to give a route a provider.
- Tests register a stand-in provider in the host — no network, no other mock:

  ```typescript
  ensureCaptchaService(context).register({
    id: 'test',
    verify: async () => ({ success: true, hostname: 'example.org', score: 0.9, action: 'email_pin' }),
    clientSettings: () => ({ provider: 'test', siteKey: 'site-key' }),
  })
  ```

- The secret never leaves the server: advertise only `clientSettings()`.
- `CaptchaVerifyOptions.remoteIp` is the caller's IP when known; providers decide whether to send it.

## Related

`web-captcha` (the browser half) · `captcha-recaptcha` (the Google provider, connect) ·
`server-auth` (the guest `captcha` plugin and its guard) · `server-auth-email` (the strict check in
front of send-PIN and password sign-in)
