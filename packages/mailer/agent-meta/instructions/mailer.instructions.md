---
description: "How to use @owlmeans/mailer — MailerService interface + console/dev transport. Use when sending emails or setting up a mailer in tests."
applyTo: "**/context.ts, **/services/mail*"
---
<!-- AUTO-GENERATED — do not edit. Regenerate via sync-agent-meta. -->

# Using `@owlmeans/mailer`

Provider-agnostic email dispatch service. Defines the `MailerService` interface implemented by concrete transports (`@owlmeans/server-mailer-mailgun` for production, `makeConsoleMailerService` for dev/tests).

## Public API surface

| Symbol | Kind | Purpose |
|--------|------|---------|
| `MailerService` | interface | `{ send(message): Promise<void> }` |
| `MailMessage` | interface | `{ to, subject, text?, html? }` |
| `MAILER_SERVICE` | const | Default service alias `'mailer-service'` |
| `makeConsoleMailerService(alias?)` | fn | Dev transport: logs to console and stores messages in `.captured[]` |
| `makeDefaultConsoleMailerService()` | fn | Alias of `makeConsoleMailerService(MAILER_SERVICE)` |
| `CONSOLE_MAILER` | const | Default alias for the console transport `'console-mailer'` |

## Console transport (dev & tests)

```ts
import { makeConsoleMailerService, MAILER_SERVICE } from '@owlmeans/mailer'

const mailer = makeConsoleMailerService(MAILER_SERVICE)
context.registerService(mailer)

// In tests: inspect captured messages
await mailer.send({ to: 'user@example.com', subject: 'Code', text: '123456' })
console.log(mailer.captured[0].text) // '123456'
```

The console transport:
- Logs to `console.log` (not `console.error`) — safe to use in tests without noise.
- Accumulates all sent messages in `mailer.captured: MailMessage[]`.
- Never throws unless context is not initialized.

## Production wiring

Use `@owlmeans/server-mailer-mailgun` for production. The `MAILER_SERVICE` alias is the same — swap transports without changing callers:

```ts
// Dev:
context.registerService(makeConsoleMailerService(MAILER_SERVICE))
// Prod:
context.registerService(makeMailgunMailerService(MAILER_SERVICE))
```

## Rules

- Register under `MAILER_SERVICE` alias when called from `OtpService` or other platform code.
- Never import a concrete transport directly in domain services — always inject via the alias.
- The `MailMessage.html` field is optional; supply either `text` or `html` (or both).
