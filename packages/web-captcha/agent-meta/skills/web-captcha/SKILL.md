---
name: web-captcha
description: How to use @owlmeans/web-captcha — the provider-neutral browser half of OwlMeans captcha, with no @owlmeans dependencies. The CaptchaClient contract a provider's browser package implements (load, execute, notice, texts, widget, siteKeyRecord), the page's client registry (captchaClients — lookup by the provider id the server advertises), the notice helper, CaptchaLoadError and its four reasons, and the useCaptcha React hook plus the widget slot (./react). Auto-invoked when a form or an embedded widget needs a captcha token, when registering or writing a captcha client, when rendering a provider's notice or widget, or when phrasing a captcha load failure.
user-invocable: false
---
<!-- AUTO-GENERATED — do not edit. Regenerate via sync-agent-meta. -->

# @owlmeans/web-captcha

**Layer:** Web (L0 — no `@owlmeans/*` dependencies; React an optional peer, used only by `./react`)
**Install:** `"@owlmeans/web-captcha": "^0.2.0-alpha.0"` in `dependencies`
**Server half:** `@owlmeans/captcha` (its provider advertises `{ provider, siteKey }`)
**Clients:** connect packages — Google reCAPTCHA is `@owlmeans/web-captcha-recaptcha`
(`appendRecaptchaClient()`, skill `web-captcha-recaptcha`)

Zero framework dependencies is deliberate: a size-sensitive bundle — an embedded IIFE widget that
must not pull ajv in through an `@owlmeans` package index — can carry it alone. It names no captcha
service: a client package brings the script, the notice and the widget.

## Key Exports

| Export | Description |
|---|---|
| `CaptchaClient<W>` | `{ id, load(siteKey), execute(siteKey, action), notice?, texts?, widget?, siteKeyRecord? }` |
| `createCaptchaClients()`, `captchaClients` | A registry by provider id: `register(client)` (same id replaces), `get(id?)` (no id = the only one), `list()`; `captchaClients` is the page's |
| `createCaptchaNoticeHelper()`, `captchaNoticeHelper` | `noticeOf(client, language?)` → `{ sentence, links: { name: { text, href } } }` in the reader's base language, English otherwise; `null` when the client needs none |
| `CaptchaLoadError` | `Error` with `reason: 'load' \| 'timeout' \| 'execute' \| 'unavailable'`, message `captcha:<reason>` |
| `CAPTCHA_FALLBACK_LANGUAGE` | `'en'` — every client's `texts` carries it |
| `CaptchaTexts`, `CaptchaNotice`, `CaptchaNoticeText`, `CaptchaNoticeLink`, `CaptchaClients`, `CaptchaNoticeHelper`, `CaptchaLoadErrorReason` | Types |
| `useCaptcha({ client, siteKey, action })` (`./react`) | `{ ready, error, execute }` |
| `CaptchaWidget`, `CaptchaWidgetProps`, `CaptchaWidgetClient` (`./react`) | The widget slot: a component taking `{ siteKey, onToken(token \| null), onReady?, onError?, language? }` |

## The contract

- **Pick the client by the advertised id.** The server sends `{ provider, siteKey }`
  (`CaptchaClientSettings`); `captchaClients.get(provider)` is the client to ask. No client for it is
  a refusal, never a request without a token — `useCaptcha` answers `CaptchaLoadError('unavailable')`.
- **Lazy.** A client touches the page only in `load` / `execute`; safe at import, under server
  rendering and in tests.
- **Failures** — every client failure is a `CaptchaLoadError`: `load` (the script did not load),
  `timeout` (not ready in time), `unavailable` (no page, no API, or no client), `execute` (no token
  in time). A caller maps the reason to its own sentence: `load`/`timeout`/`unavailable` read as
  "blocked", `execute` as "verification failed".
- **Notice.** A client that hides its provider's badge ships `notice.links` and `texts[lng].notice`
  (`{{name}}` marks each link, labelled by `texts[lng][name]`); the page shows it next to the form —
  read it with `captchaNoticeHelper.noticeOf(client, language)`.
- **Widget.** An interactive challenge (a checkbox) is `client.widget`, typed in `./react`; a panel's
  captcha sign-in renders it with the site key of the client config record `client.siteKeyRecord`.
  A client without one is invisible-only.

## Usage

```typescript
import { captchaClients } from '@owlmeans/web-captcha'
import { appendRecaptchaClient } from '@owlmeans/web-captcha-recaptcha'

appendRecaptchaClient()                                        // once, while the app is set up

const client = captchaClients.get(options.captcha.provider)   // what the server advertised
void client?.load(options.captcha.siteKey)                     // when the form opens
const token = await client!.execute(options.captcha.siteKey, 'inquiry')   // per submit
```

```tsx
import { useCaptcha } from '@owlmeans/web-captcha/react'

const client = captchaClients.get(options.captcha?.provider)
const { ready, error, execute } = useCaptcha({ client, siteKey: options.captcha?.siteKey ?? null, action: 'email_pin' })

const submit = async () => {
  const captcha = await execute()      // null while the captcha is off; throws CaptchaLoadError
  await api.sendPin({ email, ...(captcha != null ? { captcha } : {}) })
}
```

## Writing a client

A client package exports `make<P>Client(options)` and `append<P>Client(options?, clients = captchaClients)`
= `clients.register(make<P>Client(options))`; registration is explicit, never on import. `id` equals
the server provider's id. Keep the package root free of React (the widget lives in its `./react`) so
an IIFE bundle can import the client alone.

## Rules

- `siteKey` `null` or `''` means OFF: `ready` is true at once and `execute()` resolves `null` — send
  no captcha field at all rather than an empty one.
- Fetch a fresh token for every protected request: a token is verifiable once and is bound to the
  action it was executed for — the server's strict check compares it exactly.
- Load the provider on the user's first interaction with the form (`load` on open), not with the
  page: a provider's script is a third-party request the cookie notice may not yet cover.

## Related

`captcha` (the server half) · `web-captcha-recaptcha` (the Google client, connect) ·
`web-auth-email` (the e-mail card's send-PIN and password sign-in) · `web-panel` / `mui-panel` (the
captcha sign-in renders a client's widget) · `common-inquiry` / `web-inquiry` (the inquiry widget a
CRM serves asks a captcha client for its token)
