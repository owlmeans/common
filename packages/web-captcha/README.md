# @owlmeans/web-captcha

The browser half of OwlMeans captcha, provider-neutral: the `CaptchaClient` contract a captcha
provider's browser package implements, the page's client registry looked up by the provider id the
server advertises, the notice helper, `CaptchaLoadError`, and a React hook plus the widget slot
(`./react`). It has no `@owlmeans/*` dependencies, so a size-sensitive bundle (an embedded widget)
can carry it alone, and no built-in provider. The server half is `@owlmeans/captcha`.

## Installation

```bash
bun add @owlmeans/web-captcha@^0.2.0-alpha.0
```

## Concepts

- **Client** — `CaptchaClient` `{ id, load(siteKey), execute(siteKey, action), notice?, texts?,
  widget?, siteKeyRecord? }`. `id` equals the server provider's id; nothing touches the page until
  `load` or `execute` is called.
- **Registry** — `captchaClients` holds the page's clients by id; a provider package's `append*`
  registers its client explicitly. A form looks the client up by the advertised
  `{ provider, siteKey }`; no client for it is a refusal (`CaptchaLoadError('unavailable')`), never
  a request without a token.
- **Notice** — a client that hides its provider's badge ships the sentence a page must show
  (`texts[lng].notice`, `{{name}}` marking links) and the links (`notice.links`);
  `captchaNoticeHelper.noticeOf(client, language)` resolves both in the reader's base language,
  English otherwise.
- **Widget** — an interactive challenge is `client.widget`, typed in `./react` as a component taking
  `{ siteKey, onToken, onReady?, onError?, language? }`; a panel's captcha sign-in renders it.
- **Failures** — every failure is a `CaptchaLoadError` whose `reason` is `load`, `timeout`,
  `unavailable` or `execute`.

## Usage

```typescript
import { captchaClients } from '@owlmeans/web-captcha'

const client = captchaClients.get(options.captcha.provider)     // the client of the advertised provider
void client?.load(options.captcha.siteKey)                       // e.g. when the form opens
const token = await client!.execute(options.captcha.siteKey, 'email_pin')   // per submit
```

```tsx
import { useCaptcha } from '@owlmeans/web-captcha/react'

const { ready, error, execute } = useCaptcha({
  client: captchaClients.get(options.captcha?.provider), siteKey: options.captcha?.siteKey ?? null, action: 'email_pin',
})

const submit = async () => {
  const captcha = await execute()          // null while the captcha is off
  await api.sendPin({ email, ...(captcha != null ? { captcha } : {}) })
}
```

## API

| Export | Description |
|---|---|
| `createCaptchaClients()`, `captchaClients` | A client registry: `register(client)`, `get(id?)`, `list()`; the page's ready instance |
| `createCaptchaNoticeHelper()`, `captchaNoticeHelper` | `noticeOf(client, language?)` → `{ sentence, links }` or `null` |
| `CaptchaLoadError` | `Error` with `reason: 'load' \| 'timeout' \| 'execute' \| 'unavailable'` |
| `CAPTCHA_FALLBACK_LANGUAGE` | `'en'` |
| `CaptchaClient`, `CaptchaClients`, `CaptchaTexts`, `CaptchaNotice`, `CaptchaNoticeText`, `CaptchaNoticeLink`, `CaptchaNoticeHelper`, `CaptchaLoadErrorReason` | Types |
| `useCaptcha({ client, siteKey, action })` (`./react`) | `{ ready, error, execute }`; `siteKey` `null` = off: `ready` true, `execute()` resolves `null`; no client = never ready, `execute()` throws |
| `CaptchaWidget`, `CaptchaWidgetProps`, `CaptchaWidgetClient`, `UseCaptchaOptions`, `UseCaptchaResult` (`./react`) | The widget slot and the hook's types |

<!-- owlmeans:agent-guidance:start -->
## Agent guidance

This package ships embedded agent skills under `agent-meta/`. After installing your
`@owlmeans/*` packages, run the OwlMeans agent-skills installer to place them into
your project's skill store (`.agents/skills/`):

```sh
npx @owlmeans/agent-skills@^0.2.0-alpha.0
```

The embedded files are version-matched to this package release. Do not edit them
directly — they are regenerated on each publish. To contribute guidance edits,
open a PR against the source monorepo.
<!-- owlmeans:agent-guidance:end -->
