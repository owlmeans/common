---
name: mailer
description: "How to use @owlmeans/mailer — MailerService interface + console/dev transport. Use when sending emails or setting up a mailer in tests. Applies to files matching **/context.ts, **/services/mail*."
metadata:
  applyTo: "**/context.ts, **/services/mail*"
---
<!-- AUTO-GENERATED — do not edit. Regenerate via sync-agent-meta. -->

# Using `@owlmeans/mailer`

**Install:** `"@owlmeans/mailer": "^0.1.18-rc.8"` in `dependencies`

Provider-agnostic email dispatch service. It defines the `MailerService` interface and ships one
transport of its own — the console/dev one. Real delivery is a separate package:
`@owlmeans/mailer-smtp` (SMTP, works against any relay) or `@owlmeans/server-mailer-mailgun`
(Mailgun's HTTP API).

## Public API surface

| Symbol | Kind | Purpose |
|--------|------|---------|
| `MailerService` | interface | Extends `InitializedService` (`@owlmeans/context`) with `send(message): Promise<void>` |
| `MailMessage` | interface | `{ to, subject, text?, html?, from?, replyTo?, headers? }` |
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
- Never throws: it has no transport to fail, which is what makes it the right double in a test.

## Writing a transport

The package's whole purpose is a contract other packages implement. A transport is a service built
with `createService` from `@owlmeans/context` under the alias the caller asks for, whose one
required member is `send`:

```ts
import { createService } from '@owlmeans/context'
import type { MailerService, MailMessage } from '@owlmeans/mailer'

export const makeMyMailerService = (alias = 'my-mailer'): MailerService =>
  createService<MailerService>(alias, {
    send: async (message: MailMessage): Promise<void> => { /* reach the provider */ },
  })
```

`MailerService` extends `InitializedService`, so the context runs the service's lifecycle like any
other; a transport that has to be torn down declares its own members on top (see the SMTP one's
`verify()` / `close()`).

## Production wiring

Every transport registers under the same `MAILER_SERVICE` alias, so swapping one for another
changes no caller. Select on config rather than on a build flag, so one image serves every
environment:

```ts
// Dev / tests:
context.registerService(makeConsoleMailerService(MAILER_SERVICE))
// Production, SMTP relay:
context.registerService(makeSmtpMailerService(MAILER_SERVICE))
// Production, Mailgun HTTP API:
context.registerService(makeMailgunMailerService(MAILER_SERVICE))
```

## Rules

- Register under `MAILER_SERVICE` alias when called from `OtpService` or other platform code.
- Never import a concrete transport directly in domain services — always inject via the alias.
- The `MailMessage.html` field is optional; supply either `text` or `html` (or both).
- `from`, `replyTo` and `headers` are per-message overrides of whatever the transport was
  configured with. A transport that cannot carry headers ignores the field rather than failing —
  the contract is the smallest thing every transport can honour, so nothing here is guaranteed to
  reach the wire.

## Related

- [[mailer-smtp]] — the SMTP transport and its `cfg.smtp` block
- [[server-mailer-mailgun]] — the Mailgun HTTP transport and its `cfg.mailgun` block
