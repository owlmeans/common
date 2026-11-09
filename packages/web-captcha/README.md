# @owlmeans/web-captcha

The browser half of OwlMeans captcha: a loader for Google's invisible, score-based reCAPTCHA v3 and
a React hook over it. It has no `@owlmeans/*` dependencies, so a size-sensitive bundle (an embedded
widget) can carry it alone. The server half — verifying the token — is `@owlmeans/captcha`.

## Installation

```bash
bun add @owlmeans/web-captcha@^0.1.21
```

## Concepts

- **Lazy** — nothing touches the page at import. The script `api.js?render=<site key>` is injected
  on the first `prepare` or `token` call, so the module is safe under server rendering and in tests;
  without a page a call fails with `CaptchaLoadError('unavailable')`.
- **One script per site key** — concurrent and later calls share one load per loader; use the shared
  `captchaLoader` so every form of a page shares it too. A failed load is forgotten, so the next call
  injects the script again.
- **Badge** — by default the loader adds one document style hiding Google's badge. A page that hides
  it must show Google's notice ("This site is protected by reCAPTCHA and the Google Privacy Policy
  and Terms of Service apply.") next to the form.
- **Failures** — every failure is a `CaptchaLoadError` whose `reason` is `load` (the script did not
  load), `timeout` (not ready within `loadTimeout`, 15 s), `unavailable` (no page, or the script
  came without its API) or `execute` (no token within `executeTimeout`, 20 s).

## Usage

```typescript
import { captchaLoader } from '@owlmeans/web-captcha'

void captchaLoader.prepare(siteKey)                          // e.g. when the form opens
const token = await captchaLoader.token(siteKey, 'email_pin') // per submit; send it to the server
```

```tsx
import { useCaptcha } from '@owlmeans/web-captcha/react'

const { ready, error, execute } = useCaptcha({ siteKey: options.captcha?.siteKey ?? null, action: 'email_pin' })

const submit = async () => {
  const captcha = await execute()          // null while the captcha is off
  await api.sendPin({ email, ...(captcha != null ? { captcha } : {}) })
}
```

## API

| Export | Description |
|---|---|
| `createCaptchaLoader(options?)` | A `CaptchaLoader`: `prepare(siteKey)`, `token(siteKey, action)` |
| `captchaLoader` | The shared ready instance |
| `CaptchaLoadError` | `Error` with `reason: 'load' \| 'timeout' \| 'execute' \| 'unavailable'` |
| `RECAPTCHA_SCRIPT_URL`, `CAPTCHA_LOAD_TIMEOUT`, `CAPTCHA_EXECUTE_TIMEOUT` | Google's script, `15_000`, `20_000` |
| `CAPTCHA_SCRIPT_ATTRIBUTE`, `CAPTCHA_STYLE_ATTRIBUTE`, `CAPTCHA_BADGE_CSS` | What the loader marks and injects |
| `CaptchaLoader`, `CaptchaLoaderOptions`, `CaptchaLoadErrorReason`, `Grecaptcha`, `CaptchaWindow`, `CaptchaDocument` | Types |
| `useCaptcha({ siteKey, action, loader? })` (`./react`) | `{ ready, error, execute }`; `siteKey` `null` = off: `ready` true, `execute()` resolves `null` |
| `UseCaptchaOptions`, `UseCaptchaResult` (`./react`) | The hook's types |

`CaptchaLoaderOptions`: `hideBadge` (default `true`), `loadTimeout`, `executeTimeout`, `scriptUrl`,
and `document` / `window` to load into another page (or a test's stand-in) instead of the globals.

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
