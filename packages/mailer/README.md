# @owlmeans/mailer

Provider-agnostic email dispatch: the `MailerService` contract every transport implements, the
`MailMessage` / `MailAttachment` shapes, `mailAttachmentHelper` for decoding and describing
attachments, and the one transport of its own — a console transport for development and tests.
Domain code imports it to type the mailer it resolves under `MAILER_SERVICE` and to build messages;
tests register the console transport and read what it captured. It does not deliver real mail:
register `@owlmeans/mailer-smtp` (any SMTP relay) or `@owlmeans/server-mailer-mailgun` (Mailgun's
HTTP API) under the same alias for that.

## Installation

```bash
bun add @owlmeans/mailer@^0.1.18-rc.37
```

## Concepts

- **Transport** — a `MailerService` (an `InitializedService` with `send(message)`), built with
  `createService` from `@owlmeans/context`. Every transport registers under `MAILER_SERVICE`, so
  swapping one changes no caller.
- **Message** — `MailMessage`: `to`, `subject`, `text?` / `html?`, and per-message overrides
  `from?`, `replyTo?`, `headers?`, plus `attachments?`. Overrides are the smallest common contract —
  a transport that cannot carry `headers` ignores them.
- **Attachment** — `MailAttachment`: `filename`, `content` as raw bytes or a string in `encoding`
  (`base64`, `hex`, `latin1`/`binary`, UTF-8 by default), `contentType?`.
- **Console transport** — delivers by logging the envelope and keeps every message in `captured`.
  It never throws, which makes it the right test double.

## Usage

### Send a message

```typescript
import { MAILER_SERVICE } from '@owlmeans/mailer'
import type { MailerService } from '@owlmeans/mailer'

const mailer = context.service<MailerService>(MAILER_SERVICE)

await mailer.send({
  to: 'user@example.com',
  subject: 'Your report',
  text: 'The monthly report is attached.',
  replyTo: 'support@example.com',
  attachments: [{ filename: 'report.csv', content: csvText, contentType: 'text/csv' }],
})
```

### Use the console transport in development and tests

```typescript
import { MAILER_SERVICE, makeDefaultConsoleMailerService } from '@owlmeans/mailer'
import type { MailerService } from '@owlmeans/mailer'

const mailer = makeDefaultConsoleMailerService()    // registered under MAILER_SERVICE
context.registerService(mailer)
await context.configure().init()

// ...code under test sends through context.service(MAILER_SERVICE)
await context.service<MailerService>(MAILER_SERVICE).send({ to: 'user@example.com', subject: 'Code', text: '123456' })

expect(mailer.captured[0].text).toBe('123456')      // read the body from captured, never from the log
```

### Select the transport on config

```typescript
import { makeConsoleMailerService, MAILER_SERVICE } from '@owlmeans/mailer'
import { makeMailgunMailerService } from '@owlmeans/server-mailer-mailgun'

context.registerService(cfg.mailgun != null
  ? makeMailgunMailerService(MAILER_SERVICE)
  : makeConsoleMailerService(MAILER_SERVICE))
```

### Write a transport

```typescript
import { createService } from '@owlmeans/context'
import { mailAttachmentHelper } from '@owlmeans/mailer'
import type { MailerService, MailMessage } from '@owlmeans/mailer'

export const makeMyMailerService = (alias = 'my-mailer'): MailerService =>
  createService<MailerService>(alias, {
    send: async (message: MailMessage): Promise<void> => {
      const files = (message.attachments ?? []).map(file => ({
        name: file.filename, bytes: mailAttachmentHelper.bytesOf(file), type: file.contentType,
      }))
      // reach the provider; log only mailAttachmentHelper.describe(message.attachments)
    },
  })
```

## API

| Symbol | Kind | Purpose |
|---|---|---|
| `MailerService` | interface | `InitializedService` + `send(message): Promise<void>` |
| `ConsoleMailerService` | interface | `MailerService` + `captured: MailMessage[]` |
| `MailMessage` | interface | `{ to, subject, text?, html?, from?, replyTo?, headers?, attachments? }` |
| `MailAttachment` | interface | `{ filename, content: Uint8Array \| string, encoding?, contentType? }` |
| `MailAttachmentSummary` | interface | `{ filename, size, contentType? }` — what a log may carry |
| `MailAttachmentHelper` | interface | `bytesOf`, `sizeOf`, `describe` |
| `mailAttachmentHelper` (`createMailAttachmentHelper()`) | helper | `bytesOf(a)` decodes a string `content` by `encoding`; `sizeOf(a)` byte size; `describe(list?)` summaries for logs |
| `makeConsoleMailerService(alias = CONSOLE_MAILER)` | function | console transport under the given alias |
| `makeDefaultConsoleMailerService()` | function | `makeConsoleMailerService(MAILER_SERVICE)` |
| `MAILER_SERVICE` | const | `'mailer-service'` — the alias every caller resolves |
| `CONSOLE_MAILER` | const | `'console-mailer'` — default alias of the console transport |

## Console transport logging

- The envelope (`from` when set, `to`, `subject`, attachment summaries) is logged at `info` under
  scope `mailer`, event `mail.console`.
- The body is a second record, `debug` `Mail body` (event `mail.console.body`), written only while
  the `mailer` scope logs at debug — a development level or `cfg.log.debug: 'mailer'`.
- Attachment content never reaches a log; `bytesOf` throws `SyntaxError('mailer:attachment:hex')`
  on malformed hex.

## Common pitfalls

- `makeConsoleMailerService()` without an argument registers under `'console-mailer'`, not
  `MAILER_SERVICE`; callers resolving `MAILER_SERVICE` will not find it. Use
  `makeDefaultConsoleMailerService()` or pass the alias.
- Never register the console transport where real mail must be sent — it only logs.
- Domain services resolve the mailer by alias; they never import a concrete transport.
- Supply `text`, `html` or both; neither is required by the type.
- No transport caps attachment size — limits are the caller's.

## Related packages

- [`@owlmeans/mailer-smtp`](../mailer-smtp) — SMTP transport and its `cfg.smtp` block
- [`@owlmeans/server-mailer-mailgun`](../server-mailer-mailgun) — Mailgun HTTP transport and its `cfg.mailgun` block
- [`@owlmeans/server-auth-otp`](../server-auth-otp) — sends login codes through `MAILER_SERVICE`
- [`@owlmeans/context`](../context) — `createService` and the service lifecycle
- [`@owlmeans/log`](../log) — the logger the console transport writes through

The `mailer` skill covers the same contract for agents.

<!-- owlmeans:agent-guidance:start -->
## Agent guidance

This package ships embedded agent skills under `agent-meta/`. After installing your
`@owlmeans/*` packages, run the OwlMeans agent-skills installer to place them into
your project's skill store (`.agents/skills/`):

```sh
npx @owlmeans/agent-skills@^0.1.18-rc.52
```

The embedded files are version-matched to this package release. Do not edit them
directly — they are regenerated on each publish. To contribute guidance edits,
open a PR against the source monorepo.
<!-- owlmeans:agent-guidance:end -->
