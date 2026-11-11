---
name: mailer-smtp
description: "How to use @owlmeans/mailer-smtp — the SMTP transport (nodemailer) for the @owlmeans/mailer host: appendSmtpMailer, makeSmtpMailerTransport, the cfg.smtp block, verify/close. Use when configuring real outbound email through any SMTP relay or the email-OTP mailer. Applies to files matching **/context.ts, **/config.ts, **/setup.ts."
metadata:
  applyTo: "**/context.ts, **/config.ts, **/setup.ts"
---

# Using `@owlmeans/mailer-smtp`

**Install:** `"@owlmeans/mailer-smtp": "^0.2.0-alpha.0"` in `dependencies` — it depends on
`nodemailer` itself, so a consumer declares nothing extra

SMTP transport for `@owlmeans/mailer`'s host, built on `nodemailer` (the zero-dependency de-facto
standard for Node SMTP). It reads `ctx.cfg.smtp` and works against any relay that speaks SMTP. It
stays in common because SMTP is a standard protocol, not a provider.

## Public API surface

| Symbol | Kind | Purpose |
|--------|------|---------|
| `appendSmtpMailer(ctx, opts?)` | fn | Registers the transport with the mailer host (`opts.alias`, default `MAILER_SERVICE`) and returns it |
| `makeSmtpMailerTransport(ctx, opts?)` | fn | The transport, bound to the context whose `cfg.smtp` it reads; default id `SMTP_MAILER` |
| `SmtpMailerTransport` | interface | `MailerTransport` + `verify()` + `close()` + `init()` |
| `SmtpMailerOptions` / `SmtpMailerTransportOptions` / `SmtpMailerAppendOptions` | interface | `{ authenticated?, verifyOnInit? }` / `+ id?` / `+ alias?` |
| `SmtpSettings` / `SmtpConfig` | interface | `cfg.smtp` block; `ServerConfig.smtp?` is declared by module augmentation |
| `SMTP_MAILER` | const | `'smtp-mailer'` |
| `SMTP_DEFAULT_PORT` | const | `465` |
| `makeSmtpSettingsModel(smtp).toTransportOptions()` / `.toMailOptions(message)` | model | Pure translations into nodemailer's shapes; test these, not the socket |
| `assertSmtpSettings(smtp, label, opts?)` | fn | The validation `init` and every send run |
| `makeSmtpMailerService(alias?, opts?)` | fn | **Deprecated** (`compat:mailer-host`) standalone service delegating to the transport; prefixes errors with `alias` |

## Config shape

```ts
cfg.smtp = {
  host: 'smtp.example.com',
  port: 465,          // default
  secure: true,       // default — implicit TLS
  user: 'no-reply@example.com',
  pass: process.env.SMTP_PASSWORD,
  from: 'Example <no-reply@example.com>',
  // optional: replyTo, headers, rejectUnauthorized, timeout
}
```

Every numeric/boolean field also accepts its **string** form. That is not sloppiness: in a server
context the values usually come from mounted files, and `fileConfigReader` yields text.

```ts
cfg.smtp = {
  host: '/etc/app-config/smtp-host',
  user: '/etc/app-config/smtp-user',
  from: '/etc/app-config/smtp-from',
  pass: '/etc/master-secret/smtp-secret',   // secret volume, never a ConfigMap
}
```

The transport reads `cfg.smtp` at `init` and on every send — mounted values are resolved in place
before the context initializes, so it always sees the resolved ones.

## Registration

```ts
import { appendSmtpMailer } from '@owlmeans/mailer-smtp'

// makeContext — production: explicit SMTP, authenticated, verified while the context starts
if (cfg.iamMailer.mode !== 'smtp') throw new SyntaxError('production requires smtp mode')
appendSmtpMailer(context, { authenticated: true, verifyOnInit: true })
```

The host under `MAILER_SERVICE` now sends through SMTP, so platform code — `OtpService` above all —
resolves the mailer without knowing the transport. A transport another service wraps (a guard)
registers into its own host: `appendSmtpMailer(context, { alias: 'iam-mail-transport', … })`.
A local-only console transport is an explicit mode; it is never a production fallback.

Authenticated SMTP requires a host, from address, user and password; `verifyOnInit` makes an
unusable relay fail context startup rather than exposing a later login code through a console log.
`appendSmtpMailer` returns the transport, which keeps `verify()` (health checks) and `close()`.

## Ports and TLS

| Port | Mode | `secure` |
|---|---|---|
| 465 | implicit TLS from the first byte | `true` (default) |
| 587, 2525 | STARTTLS upgrade | `false` |
| 25 | plain / STARTTLS, often blocked | `false` |

## Rules

- **The relay's SMTP credential is usually not the account login.** Relays issue a per-sending-domain
  SMTP user under the domain's settings.
- The `From` domain must be verified with the relay; the local part is free-form.
- Deliberately **unpooled** — a pooled transport holds its socket and keeps a short-lived process
  alive. Add pooling only with a matching lifecycle.
- Every error is prefixed with the transport id (`smtp-mailer`, or `opts.id`; the deprecated service
  uses its alias). Relay errors carry the server's own reply (`code`/`responseCode`/`response`); the
  password never reaches a message or a log. A missing setting is a `SyntaxError`
  (`smtp-mailer: cfg.smtp.host is not configured`), raised before any socket — at `init` when the
  host starts, so the context fails to start.
- `verify()` authenticates without submitting a message — right for health checks; not proof that
  the relay accepts *a message* from your sender.
- Production mail selection must be explicit and use `authenticated: true, verifyOnInit: true`.
  Console mail is for local fixtures/development and must never be selected because SMTP settings
  were absent or malformed.
- `toMailOptions` maps `MailMessage.attachments` to nodemailer's `attachments` as
  `{ filename, content: Buffer, contentType? }` — the bytes already decoded by
  `mailAttachmentHelper.bytesOf`, so no `encoding` is left for nodemailer to guess; absent or empty
  = no `attachments` key.
- Never register this in unit tests — use the console transport.
  `makeSmtpSettingsModel(smtp).toMailOptions` plus nodemailer's own `jsonTransport` cover envelope
  assertions without a socket; `tests/transport.spec.ts` covers registration and failures against a
  refused local socket.
- **Never authenticate with a deliberately wrong password against a live relay.** Repeated failed
  logins trip the relay's brute-force protection and lock the shared credential for every
  environment using it — the relay then answers `535 Authentication failed` to the correct password
  too, and the credential has to be reset in its dashboard. Provoke transport errors with an
  unreachable socket (`host: '127.0.0.1', port: '1'`) instead.
- The live spec (`tests/send.spec.ts`) is gated by `gateHelper.smtpGate()` from
  `@owlmeans/test-integration` on `SMTP_HOST` / `SMTP_USER` / `SMTP_PASSWORD` / `SMTP_FROM` /
  `SMTP_TEST_TO` (with `SMTP_PORT` and `SMTP_SECURE` optional), and **delivers real mail** when the
  gate is open. Empty variables = skip with a printed reason, never a failure.
- Rollup-bundling for a container image works with the default `preferBuiltins: true` node-resolve
  setup; nodemailer's dynamic requires do not need to be externalized.

## External references

- [nodemailer](https://www.npmjs.com/package/nodemailer) — MIT-0, **zero dependencies**, the
  de-facto standard. Ships no types; `@types/nodemailer` supplies them. CJS — import the default
  (`import nodemailer from 'nodemailer'`), not named members, so both Bun and Rollup's commonjs
  interop resolve it; it works under Bun and inside a Rollup CJS bundle.
- SMTP submission ports — RFC 8314 (implicit TLS on 465) and RFC 6409 (submission on 587 with
  STARTTLS); relays commonly also accept 2525.

## Related

- [[mailer]] — the host, the `MailerTransport` contract and the console transport
- provider HTTP transports live in OwlMeans connect and register into the same host
