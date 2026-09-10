---
name: server-mailer-mailgun
description: "How to use @owlmeans/server-mailer-mailgun — Mailgun production email transport. Use when configuring the production MailerService. Applies to files matching **/context.ts, **/config.ts."
metadata:
  applyTo: "**/context.ts, **/config.ts"
---
<!-- AUTO-GENERATED — do not edit. Regenerate via sync-agent-meta. -->

# Using `@owlmeans/server-mailer-mailgun`

**Install:** `"@owlmeans/server-mailer-mailgun": "^0.1.18-rc.8"` in `dependencies`

Production Mailgun transport implementing `@owlmeans/mailer`'s `MailerService` interface. Reads
config from `ctx.cfg.mailgun` at send time and posts to Mailgun's HTTP API with `fetch` — no SMTP
socket and no SDK, so it bundles and runs anywhere `fetch` does. `@owlmeans/mailer-smtp` is the
alternative when the relay is reached over SMTP.

## Public API surface

| Symbol | Kind | Purpose |
|--------|------|---------|
| `makeMailgunMailerService(alias?)` | fn | Service factory |
| `MailgunConfig` | interface | Extends `ServerConfig` with `mailgun: { apiKey, domain, from, baseUrl? }` |
| `MAILGUN_MAILER` | const | Default alias `'mailgun-mailer'` |

## Config shape

`MailgunConfig` extends `ServerConfig` from `@owlmeans/server-context`, which this package does not
declare among its own dependencies — the type resolves through the server application that already
depends on it.

```ts
import type { MailgunConfig } from '@owlmeans/server-mailer-mailgun'

cfg.mailgun = {
  apiKey: process.env.MAILGUN_API_KEY!,
  domain: process.env.MAILGUN_DOMAIN!,          // e.g. 'mg.example.com'
  from: process.env.MAILGUN_FROM!,              // e.g. 'OwlMeans <no-reply@mg.example.com>'
  baseUrl: 'https://api.eu.mailgun.net/v3',     // optional, default 'https://api.mailgun.net/v3'
}
```

## Registration

```ts
import { makeMailgunMailerService } from '@owlmeans/server-mailer-mailgun'
import { MAILER_SERVICE } from '@owlmeans/mailer'

context.registerService(makeMailgunMailerService(MAILER_SERVICE))
```

Register under `MAILER_SERVICE` so platform code (OTP service, etc.) can resolve it without knowing the concrete transport.

## Message fields on the wire

| `MailMessage` field | Sent as |
|---|---|
| `from` | the `from` parameter, overriding `cfg.mailgun.from` for that message alone |
| `to`, `subject`, `text`, `html` | the parameters of the same name; `text`/`html` are omitted when absent |
| `replyTo` | `h:Reply-To` |
| `headers` | one `h:<name>` parameter each |

Every `headers` entry becomes a custom MIME header on the outgoing message. The request carries
**no `o:` option parameters**, so Mailgun's own delivery options — test mode among them — cannot be
asked for through this transport: a message it accepts is a message it sends. An environment that
must not mail anyone registers `makeConsoleMailerService` instead.

## Rules

- For EU region, set `baseUrl: 'https://api.eu.mailgun.net/v3'`.
- The service reads `ctx.cfg.mailgun` at call time — the config must be on the context's `cfg` object.
- Throws a plain `Error` with the Mailgun status code and response body if the API call fails;
  callers should wrap in a domain error if needed. There is no retry here.
- No `verify()` and no connection to close: unlike the SMTP transport this holds no state between
  sends, so nothing has to be torn down at shutdown.
- Never use this in tests — use `makeConsoleMailerService` instead.

## Related

- [[mailer]] — the `MailerService` contract and the console transport
- [[mailer-smtp]] — the SMTP transport, for a relay reached over SMTP rather than HTTP
