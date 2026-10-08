# @owlmeans/server-mailer-mailgun

A production `MailerService` transport that sends mail through Mailgun's HTTP API with the global
`fetch` — no SDK and no SMTP socket. A server registers it under `MAILER_SERVICE` so platform code
(the OTP login, notifications) delivers through Mailgun without knowing the transport. Use
`@owlmeans/mailer-smtp` instead when the relay is reached over SMTP, and the console transport of
`@owlmeans/mailer` in development and tests — this transport always sends.

## Installation

```bash
bun add @owlmeans/server-mailer-mailgun@^0.1.18-rc.34
```

`MailgunConfig` extends `ServerConfig` from `@owlmeans/server-context`, which this package does not
declare; the server application provides it.

## Concepts

- **Transport** — a `MailerService` (from `@owlmeans/mailer`) built with `createService`. Its one
  method `send(message)` posts to `${baseUrl}/${domain}/messages` with Basic auth `api:<apiKey>`.
- **Config at send time** — the service reads `ctx.cfg.mailgun` on every call, so the block must be
  on the registered context's config, not passed to the factory.
- **Body shape** — `application/x-www-form-urlencoded` for a plain message; `multipart/form-data`
  with one `attachment` part per file when the message carries attachments.

## Usage

### Configure

```typescript
import type { MailgunConfig } from '@owlmeans/server-mailer-mailgun'

export const mailgun: MailgunConfig['mailgun'] = {
  apiKey: process.env.MAILGUN_API_KEY!,
  domain: process.env.MAILGUN_DOMAIN!,            // e.g. 'mg.example.com'
  from: process.env.MAILGUN_FROM!,                // e.g. 'OwlMeans <no-reply@mg.example.com>'
  baseUrl: 'https://api.eu.mailgun.net/v3',       // optional; EU region
}
```

### Register

```typescript
import { MAILER_SERVICE } from '@owlmeans/mailer'
import { makeMailgunMailerService } from '@owlmeans/server-mailer-mailgun'

context.registerService(makeMailgunMailerService(MAILER_SERVICE))
```

### Send

```typescript
import { MAILER_SERVICE } from '@owlmeans/mailer'
import type { MailerService } from '@owlmeans/mailer'

await context.service<MailerService>(MAILER_SERVICE).send({
  to: 'person@example.com',
  subject: 'Invoice',
  html: '<p>Your invoice is attached.</p>',
  replyTo: 'billing@example.com',
  headers: { 'X-Invoice': 'inv-42' },
  attachments: [{ filename: 'invoice.pdf', content: pdfBytes, contentType: 'application/pdf' }],
})
```

## API

| Symbol | Kind | Purpose |
|---|---|---|
| `makeMailgunMailerService(alias = MAILGUN_MAILER)` | function | the Mailgun `MailerService` |
| `MAILGUN_MAILER` | const | `'mailgun-mailer'` — default alias |
| `MailgunConfig` | interface | `ServerConfig` + `mailgun: { apiKey, domain, from, baseUrl? }`; `baseUrl` defaults to `https://api.mailgun.net/v3` |

### Message fields on the wire

| `MailMessage` field | Sent as |
|---|---|
| `from` | `from`, overriding `cfg.mailgun.from` for that message |
| `to`, `subject`, `text`, `html` | parameters of the same name; `text` / `html` omitted when empty |
| `replyTo` | `h:Reply-To` |
| `headers` | one `h:<name>` parameter each |
| `attachments` | one `attachment` part each — a `Blob` of `mailAttachmentHelper.bytesOf(…)`, typed `contentType` (default `application/octet-stream`), named `filename` |

## Common pitfalls

- The default alias is `'mailgun-mailer'`; pass `MAILER_SERVICE` so callers resolving the shared
  alias (the OTP service among them) find it.
- A non-2xx response throws a plain `Error('Mailgun send failed [<status>]: <body>')`; there is no
  retry, so wrap it in a domain error where needed.
- No `o:` options are sent, so Mailgun's test mode is unreachable — an environment that must not mail
  anyone registers the console transport instead.
- Never use it in tests; use `makeConsoleMailerService` / `makeDefaultConsoleMailerService`.
- There is no `verify()` or `close()`: the transport holds no connection, so nothing is torn down at
  shutdown.

## Related packages

- [`@owlmeans/mailer`](../mailer) — `MailerService`, `MAILER_SERVICE`, `mailAttachmentHelper`, console transport
- [`@owlmeans/mailer-smtp`](../mailer-smtp) — SMTP transport for a relay reached over SMTP
- [`@owlmeans/server-auth-otp`](../server-auth-otp) — sends login codes through `MAILER_SERVICE`
- [`@owlmeans/server-context`](../server-context) — `ServerConfig`, which `MailgunConfig` extends

The `server-mailer-mailgun` skill covers the same transport for agents.

<!-- owlmeans:agent-guidance:start -->
## Agent guidance

This package ships embedded agent skills under `agent-meta/`. After installing your
`@owlmeans/*` packages, run the OwlMeans agent-skills installer to place them into
your project's skill store (`.agents/skills/`):

```sh
npx @owlmeans/agent-skills@^0.1.18-rc.49
```

The embedded files are version-matched to this package release. Do not edit them
directly — they are regenerated on each publish. To contribute guidance edits,
open a PR against the source monorepo.
<!-- owlmeans:agent-guidance:end -->
