---
name: mailer
description: "How to use @owlmeans/mailer — the mailer host (MAILER_SERVICE) that dispatches send() to one registered MailerTransport, the transport contract, appendMailerTransport/ensureMailerService, and the console transport for dev and tests. Use when sending emails, registering or writing a mail transport, or setting up a mailer in tests. Applies to files matching **/context.ts, **/services/mail*."
metadata:
  applyTo: "**/context.ts, **/services/mail*"
---

# Using `@owlmeans/mailer`

**Install:** `"@owlmeans/mailer": "^0.2.0-alpha.0"` in `dependencies`

Provider-agnostic email dispatch. Callers resolve one `MailerService` by alias and call `send`;
behind that alias sits the **mailer host**, which dispatches every message to one registered
**transport**. The package ships the host, the transport contract and one transport of its own —
the console one, which is also the host's default. Real delivery is a transport package:
`@owlmeans/mailer-smtp` (common — SMTP is a protocol, works against any relay) or a provider's HTTP
transport from OwlMeans connect. Nothing in common names a mail provider.

## Public API surface

| Symbol | Kind | Purpose |
|--------|------|---------|
| `MailerService` | interface | `InitializedService` + `send(message): Promise<void>` — what every caller types |
| `MailerHostService` | interface | `MailerService` + `register(transport)`, `get(id)`, `active()` |
| `MailerTransport` | interface | `{ id, send(message), init?(), verify?(), close?() }` |
| `MailerAppendOptions` | interface | `{ alias? }` — the host a transport registers into (default `MAILER_SERVICE`) |
| `createMailerService(alias?)` | fn | The host, unregistered |
| `ensureMailerService(ctx, alias?)` | fn | The host on `ctx`, registered once — idempotent, safe from `makeContext` |
| `appendMailerTransport(ctx, transport, opts?)` | fn | Registers `transport` with the host and returns it |
| `createConsoleMailerTransport(id?)` | fn | The console transport (`ConsoleMailerTransport`, with `captured[]`) |
| `makeConsoleMailerService(alias?)` / `makeDefaultConsoleMailerService()` | fn | The console transport as a standalone service under an alias (`MAILER_SERVICE` for the default one) |
| `MailMessage` | interface | `{ to, subject, text?, html?, from?, replyTo?, headers?, attachments? }` |
| `MailAttachment` | interface | `{ filename, content: Uint8Array \| string, encoding?, contentType? }` |
| `mailAttachmentHelper` | helper | `bytesOf(a)` (decodes a string `content` by `encoding`: `base64`, `hex`, `latin1`/`binary`, default UTF-8), `sizeOf(a)`, `describe(list)` → `{ filename, size, contentType? }[]` for logs |
| `MAILER_SERVICE` | const | `'mailer-service'` — the alias every caller resolves; the host's default alias |
| `CONSOLE_MAILER` | const | `'console-mailer'` — the console transport's id and the standalone service's default alias |

## The host

```ts
import { appendSmtpMailer } from '@owlmeans/mailer-smtp'

// makeContext — the host under MAILER_SERVICE now delivers through SMTP
appendSmtpMailer(context, { authenticated: true, verifyOnInit: true })

// anywhere — callers never name the transport
await context.service<MailerService>(MAILER_SERVICE).send({ to, subject, text })
```

- `send` goes to the **most recently registered** transport; registering an id the host already
  holds replaces that transport. With none registered it goes to a built-in console transport.
- While the context initializes the host runs the chosen transport's `init` — a transport validates
  its settings there (and the SMTP one can verify the relay), so a broken transport fails the start.
  Register from `makeContext`; a transport registered after `init` skips it.
- `ensureMailerService(ctx, alias)` finds a host however it was registered (by itself, by an append
  helper, or by `ctx.registerService(createMailerService())`) even before the context initializes,
  when `ctx.service()` still refuses an uninitialized service. It **throws** when a service that is
  not a host — a standalone console service, a deprecated transport service — already holds the alias.
- One process may run several hosts under different aliases — e.g. a transport another service
  wraps (a guard that holds some recipients) sits in a host under its own alias:
  `appendSmtpMailer(ctx, { alias: 'iam-mail-transport' })`.

## Console transport (dev & tests)

```ts
import { appendMailerTransport, createConsoleMailerTransport, MAILER_SERVICE } from '@owlmeans/mailer'

const outbox = appendMailerTransport(context, createConsoleMailerTransport())
await context.configure().init()
await context.service<MailerService>(MAILER_SERVICE).send({ to: 'user@example.com', subject: 'Code', text: '123456' })
outbox.captured[0].text // '123456'
```

`makeConsoleMailerService(alias)` is the same transport as a standalone service — the quickest double
for code that resolves a mailer by alias in a test (`context.registerService(...)`); it is not a host,
so do not combine it with append helpers on the same alias.

The console transport:
- Writes each message's envelope through `@owlmeans/log` at `info`, scope `mailer`, event `mail.console`: `from` (when set), `to`, `subject`, attachments — visible at the default level, since printing the mail IS its delivery. The text (a login code, a person's message) is personal content: it is a second record, `debug` `Mail body` (event `mail.console.body`), written only while the `mailer` scope logs at debug — a development level or `cfg.log.debug: 'mailer'`. Silenced by `configureLog({ level: 'warn' })` in a noisy test; a test reads the text from `captured`, never from the log. Never register it where real mail is sent.
- Logs attachments as `attachments: [{ filename, size, contentType? }]` — names and sizes only, never their content.
- Accumulates all sent messages in `captured: MailMessage[]`.
- Never throws: it has no transport to fail, which is what makes it the right double in a test.

## Writing a transport

A transport package exports `make<Name>MailerTransport(ctx, opts?)` — bound to the context whose
config it reads, never reaching it through `(service as any).ctx` — and
`append<Name>Mailer(ctx, opts?)` = `appendMailerTransport(ctx, make…(ctx, opts), { alias })`.
Registration is explicit; importing a transport package registers nothing.

```ts
import { appendMailerTransport } from '@owlmeans/mailer'
import type { MailerAppendOptions, MailerTransport, MailMessage } from '@owlmeans/mailer'

export const makeMyMailerTransport = <C extends MyConfig>(ctx: BasicContext<C>): MailerTransport => {
  const settings = () => { /* read and validate ctx.cfg.my — read it per call, never cache it at construction */ }
  const send = async (message: MailMessage): Promise<void> => { /* reach the provider */ }
  const init = async (): Promise<void> => { settings() }

  return { id: 'my-mailer', send, init }
}

export const appendMyMailer = <C extends MyConfig>(ctx: BasicContext<C>, opts: MailerAppendOptions = {}) =>
  appendMailerTransport(ctx, makeMyMailerTransport(ctx), opts)
```

The config block is typed by module augmentation of `@owlmeans/server-context`'s `ServerConfig`
(`smtp?`, a provider's block), so `ctx.cfg.<block>` needs no cast. Read config at `init` and on
every send: mounted files are resolved in place before the context initializes.

## Rules

- Callers resolve `MAILER_SERVICE` (or the alias they are configured with — `cfg.otp.mailerAlias`)
  and type it `MailerService`; they never import a concrete transport.
- Production registers its transport explicitly and lets the transport's `init` fail the start;
  the host's console default is for development and tests, never a production fallback.
- The `MailMessage.html` field is optional; supply either `text` or `html` (or both).
- `attachments` carry files: raw bytes, or a string in `encoding`. Every transport decodes them
  through `mailAttachmentHelper.bytesOf`, so a file reaches the provider byte-exact whatever form it
  was given in; `contentType` is sent as declared (a transport may fall back to
  `application/octet-stream`). Content never reaches a log — `mailAttachmentHelper.describe` is what
  a log line may carry. Size limits are the caller's: no transport caps them.
- `from`, `replyTo` and `headers` are per-message overrides of whatever the transport was
  configured with. A transport that cannot carry headers ignores the field rather than failing —
  the contract is the smallest thing every transport can honour, so nothing here is guaranteed to
  reach the wire.

## Related

- [[mailer-smtp]] — the SMTP transport and its `cfg.smtp` block
- provider transports in OwlMeans connect — each registers into this host with its own `append…Mailer` and skill
- [[server-auth-otp]] — sends login codes through the mailer alias
