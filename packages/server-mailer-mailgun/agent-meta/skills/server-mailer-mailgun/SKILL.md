---
name: server-mailer-mailgun
description: "How to use @owlmeans/server-mailer-mailgun — Mailgun production email transport. Use when configuring the production MailerService. Applies to files matching **/context.ts, **/config.ts."
metadata:
  applyTo: "**/context.ts, **/config.ts"
---
<!-- AUTO-GENERATED — do not edit. Regenerate via sync-agent-meta. -->

# Using `@owlmeans/server-mailer-mailgun`

Production Mailgun transport implementing `@owlmeans/mailer`'s `MailerService` interface. Reads config from `ctx.cfg.mailgun`.

## Public API surface

| Symbol | Kind | Purpose |
|--------|------|---------|
| `makeMailgunMailerService(alias?)` | fn | Service factory |
| `MailgunConfig` | interface | Extends `ServerConfig` with `mailgun: { apiKey, domain, from, baseUrl? }` |
| `MAILGUN_MAILER` | const | Default alias `'mailgun-mailer'` |

## Config shape

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

## Rules

- For EU region, set `baseUrl: 'https://api.eu.mailgun.net/v3'`.
- The service reads `ctx.cfg.mailgun` at call time — the config must be on the context's `cfg` object.
- Throws a plain `Error` with the Mailgun status code and body if the API call fails; callers should wrap in a domain error if needed.
- Never use this in tests — use `makeConsoleMailerService` instead.
