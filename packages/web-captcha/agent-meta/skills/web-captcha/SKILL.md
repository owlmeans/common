---
name: web-captcha
description: How to use @owlmeans/web-captcha — the browser half of OwlMeans captcha, with no @owlmeans dependencies. The lazy reCAPTCHA v3 loader (createCaptchaLoader, the shared captchaLoader — one script per site key, the badge hidden, a failed load forgotten), CaptchaLoadError and its four reasons, and the useCaptcha React hook (./react) that answers null while the captcha is off. Auto-invoked when a form or an embedded widget needs a reCAPTCHA v3 token, when importing captchaLoader or useCaptcha, or when phrasing a captcha load failure.
user-invocable: false
---
<!-- AUTO-GENERATED — do not edit. Regenerate via sync-agent-meta. -->

# @owlmeans/web-captcha

**Layer:** Web (L0 — no `@owlmeans/*` dependencies; React an optional peer, used only by `./react`)
**Install:** `"@owlmeans/web-captcha": "^0.1.19-rc.0"` in `dependencies`
**Server half:** `@owlmeans/captcha` (`makeCaptchaCheck` verifies what this produces)

Zero framework dependencies is deliberate: a size-sensitive bundle — an embedded IIFE widget that
must not pull ajv in through an `@owlmeans` package index — can carry it alone.

## Key Exports

| Export | Description |
|---|---|
| `createCaptchaLoader(options?)` | A `CaptchaLoader`: `prepare(siteKey)`, `token(siteKey, action)` |
| `captchaLoader` | The shared ready instance — use it so every form of a page shares one script |
| `CaptchaLoadError` | `Error` with `reason: 'load' \| 'timeout' \| 'execute' \| 'unavailable'` |
| `RECAPTCHA_SCRIPT_URL`, `CAPTCHA_LOAD_TIMEOUT`, `CAPTCHA_EXECUTE_TIMEOUT` | Google's `api.js`, `15_000`, `20_000` |
| `CAPTCHA_SCRIPT_ATTRIBUTE`, `CAPTCHA_STYLE_ATTRIBUTE`, `CAPTCHA_BADGE_CSS` | `data-owlmeans-captcha`, `data-owlmeans-captcha-style`, `.grecaptcha-badge{visibility:hidden}` |
| `useCaptcha({ siteKey, action, loader? })` (`./react`) | `{ ready, error, execute }` |
| `CaptchaLoaderOptions` | `hideBadge` (default `true`), `loadTimeout`, `executeTimeout`, `scriptUrl`, `document` / `window` (load into another page or a test stand-in) |

## Behaviour

- **Lazy.** Nothing touches the page at import: `api.js?render=<site key>` is injected on the first
  `prepare` or `token`. Safe under server rendering and in tests; without a page a call fails with
  `CaptchaLoadError('unavailable')`.
- **One script per site key per loader**; concurrent calls share the load. A failed load is
  forgotten, so the next call injects the script again.
- **Badge.** The loader adds one document rule hiding Google's badge. A page that hides it must show
  Google's notice next to the form ("This site is protected by reCAPTCHA and the Google Privacy
  Policy and Terms of Service apply.", both linked).
- **Failures** — `load` (script did not load), `timeout` (not ready within 15 s), `unavailable` (no
  page, or the script came without its API), `execute` (no token within 20 s). A caller maps the
  reason to its own sentence: `load`/`timeout`/`unavailable` read as "blocked" (an extension or a
  network blocks Google), `execute` as "verification failed".

## Usage

```typescript
import { captchaLoader } from '@owlmeans/web-captcha'

void captchaLoader.prepare(siteKey)                           // when the form opens
const token = await captchaLoader.token(siteKey, 'inquiry')   // per submit — never reuse a token
```

```tsx
import { useCaptcha } from '@owlmeans/web-captcha/react'

const { ready, error, execute } = useCaptcha({ siteKey: options.captcha?.siteKey ?? null, action: 'email_pin' })

const submit = async () => {
  const captcha = await execute()      // null while the captcha is off; throws CaptchaLoadError
  await api.sendPin({ email, ...(captcha != null ? { captcha } : {}) })
}
```

## Rules

- `siteKey` `null` or `''` means OFF: `ready` is true at once and `execute()` resolves `null` — send
  no captcha field at all rather than an empty one.
- Fetch a fresh token for every protected request: a token is verifiable once, within two minutes,
  and is bound to the action it was executed for — the server's strict check compares it exactly.
- Load the script on the user's first interaction with the form (`prepare` on open), not with the
  page: Google's script is a third-party request the cookie notice may not yet cover.

## External docs

- https://developers.google.com/recaptcha/docs/v3 — `api.js?render=<site key>`, `grecaptcha.ready` then `execute(siteKey, { action })` per protected action

## Related

`captcha` (the server half) · `web-auth-email` (the e-mail card's send-PIN and password sign-in) ·
`common-inquiry` / `web-inquiry` (the inquiry widget a CRM serves loads reCAPTCHA through this package)
