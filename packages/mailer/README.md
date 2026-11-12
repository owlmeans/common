# @owlmeans/mailer

Provider-agnostic email dispatch: the mailer host every caller resolves under `MAILER_SERVICE`, the
`MailerTransport` contract a delivery package implements, the `MailMessage` / `MailAttachment`
shapes, `mailAttachmentHelper` for decoding and describing attachments, and the one transport of its
own — a console transport for development and tests, which is also the host's default. Domain code
resolves the host and calls `send`; a server registers one transport into it from `makeContext`.
Real delivery comes from a transport package: `@owlmeans/mailer-smtp` for any SMTP relay, or a
provider's HTTP transport from OwlMeans connect.

## Installation

```bash
bun add @owlmeans/mailer@^0.2.0-alpha.0
```

## Concepts

- **Host** — `MailerHostService`, a `MailerService` (an `InitializedService` with `send(message)`)
  that dispatches every `send` to one registered transport: the most recently registered, else the
  built-in console transport. `ensureMailerService(ctx, alias = MAILER_SERVICE)` registers it once
  and returns it, also before the context initializes. While the context initializes the host runs
  the chosen transport's `init`.
- **Transport** — `MailerTransport` `{ id, send, init?, verify?, close? }`: one way of delivering,
  built by its package bound to the context it reads settings from, registered with
  `appendMailerTransport(ctx, transport, { alias? })`. An id registered again replaces the earlier
  transport.
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

### Register a transport

```typescript
import { appendSmtpMailer } from '@owlmeans/mailer-smtp'

// in makeContext — every caller of MAILER_SERVICE now delivers through SMTP
appendSmtpMailer(context, { authenticated: true, verifyOnInit: true })
```

Select on config rather than on a build flag, so one image serves every environment; with nothing
registered the host writes mail to the console.

### Use the console transport in development and tests

```typescript
import { appendMailerTransport, createConsoleMailerTransport, MAILER_SERVICE } from '@owlmeans/mailer'
import type { MailerService } from '@owlmeans/mailer'

const outbox = appendMailerTransport(context, createConsoleMailerTransport())
await context.configure().init()

// ...code under test sends through context.service(MAILER_SERVICE)
await context.service<MailerService>(MAILER_SERVICE).send({ to: 'user@example.com', subject: 'Code', text: '123456' })

expect(outbox.captured[0].text).toBe('123456')      // read the body from captured, never from the log
```

`makeConsoleMailerService(alias)` is the same transport as a standalone service under an alias —
the quickest double for code that resolves a mailer by alias without a host.

### Write a transport

```typescript
import { appendMailerTransport, mailAttachmentHelper } from '@owlmeans/mailer'
import type { MailerAppendOptions, MailerTransport, MailMessage } from '@owlmeans/mailer'
import type { BasicContext } from '@owlmeans/context'

export const makeMyMailerTransport = (ctx: BasicContext<MyConfig>): MailerTransport => {
  const send = async (message: MailMessage): Promise<void> => {
    const files = (message.attachments ?? []).map(file => ({
      name: file.filename, bytes: mailAttachmentHelper.bytesOf(file), type: file.contentType,
    }))
    // reach the provider with ctx.cfg.my; log only mailAttachmentHelper.describe(message.attachments)
  }
  const init = async (): Promise<void> => { /* validate ctx.cfg.my — a throw fails the start */ }

  return { id: 'my-mailer', send, init }
}

export const appendMyMailer = (ctx: BasicContext<MyConfig>, opts: MailerAppendOptions = {}): MailerTransport =>
  appendMailerTransport(ctx, makeMyMailerTransport(ctx), opts)
```

## API

| Symbol | Kind | Purpose |
|---|---|---|
| `MailerService` | interface | `InitializedService` + `send(message): Promise<void>` — what callers resolve |
| `MailerHostService` | interface | `MailerService` + `register(transport)`, `get(id)`, `active()` |
| `MailerTransport` | interface | `{ id, send(message), init?(), verify?(), close?() }` |
| `ConsoleMailerTransport` | interface | `MailerTransport` + `captured: MailMessage[]` |
| `ConsoleMailerService` | interface | `MailerService` + `captured: MailMessage[]` |
| `MailerAppendOptions` | interface | `{ alias? }` — the host a transport registers into |
| `MailMessage` | interface | `{ to, subject, text?, html?, from?, replyTo?, headers?, attachments? }` |
| `MailAttachment` | interface | `{ filename, content: Uint8Array \| string, encoding?, contentType? }` |
| `MailAttachmentSummary` | interface | `{ filename, size, contentType? }` — what a log may carry |
| `MailAttachmentHelper` | interface | `bytesOf`, `sizeOf`, `describe` |
| `mailAttachmentHelper` (`createMailAttachmentHelper()`) | helper | `bytesOf(a)` decodes a string `content` by `encoding`; `sizeOf(a)` byte size; `describe(list?)` summaries for logs |
| `createMailerService(alias = MAILER_SERVICE)` | function | the host, unregistered |
| `ensureMailerService(ctx, alias = MAILER_SERVICE)` | function | the host on `ctx`, registered once; throws when a non-host service holds the alias |
| `appendMailerTransport(ctx, transport, opts?)` | function | register `transport` with the host and return it |
| `createConsoleMailerTransport(id = CONSOLE_MAILER)` | function | the console transport |
| `makeConsoleMailerService(alias = CONSOLE_MAILER)` | function | the console transport as a standalone service under `alias` |
| `makeDefaultConsoleMailerService()` | function | `makeConsoleMailerService(MAILER_SERVICE)` |
| `MAILER_SERVICE` | const | `'mailer-service'` — the alias every caller resolves |
| `CONSOLE_MAILER` | const | `'console-mailer'` — the console transport's id and the standalone service's default alias |

## Console transport logging

- The envelope (`from` when set, `to`, `subject`, attachment summaries) is logged at `info` under
  scope `mailer`, event `mail.console`.
- The body is a second record, `debug` `Mail body` (event `mail.console.body`), written only while
  the `mailer` scope logs at debug — a development level or `cfg.log.debug: 'mailer'`.
- Attachment content never reaches a log; `bytesOf` throws `SyntaxError('mailer:attachment:hex')`
  on malformed hex.

## Common pitfalls

- A host with no transport registered writes mail to the console. Where real mail must be sent,
  register the transport explicitly and let its `init` fail the start — never rely on the default.
- `ensureMailerService` refuses an alias already held by a standalone service
  (`makeDefaultConsoleMailerService()`, a deprecated transport service); use one model per alias.
- Register transports from `makeContext`: the host runs the chosen transport's `init` while the
  context initializes, and a transport registered later skips it.
- `makeConsoleMailerService()` without an argument registers under `'console-mailer'`, not
  `MAILER_SERVICE`; pass the alias or use `makeDefaultConsoleMailerService()`.
- Domain services resolve the mailer by alias; they never import a concrete transport.
- Supply `text`, `html` or both; neither is required by the type.
- No transport caps attachment size — limits are the caller's.

## Related packages

- [`@owlmeans/mailer-smtp`](../mailer-smtp) — SMTP transport and its `cfg.smtp` block
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
npx @owlmeans/agent-skills@^0.2.0-alpha.0
```

The embedded files are version-matched to this package release. Do not edit them
directly — they are regenerated on each publish. To contribute guidance edits,
open a PR against the source monorepo.
<!-- owlmeans:agent-guidance:end -->
