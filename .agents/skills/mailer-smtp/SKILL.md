---
name: mailer-smtp
description: "How to use @owlmeans/mailer-smtp — SMTP transport (nodemailer) for the MailerService contract. Use when configuring real outbound email, an SMTP relay such as Mailgun, or the email-OTP mailer. Applies to files matching **/context.ts, **/config.ts, **/setup.ts."
metadata:
  applyTo: "**/context.ts, **/config.ts, **/setup.ts"
---

# Using `@owlmeans/mailer-smtp`

**Install:** `"@owlmeans/mailer-smtp": "^0.1.18-rc.11"` in `dependencies` (peer `nodemailer`)

SMTP transport implementing `@owlmeans/mailer`'s `MailerService`, built on `nodemailer` (the
zero-dependency de-facto standard for Node SMTP). Reads `ctx.cfg.smtp`. Works against any relay —
Mailgun, SES, Postmark all expose SMTP.

## Public API surface

| Symbol | Kind | Purpose |
|--------|------|---------|
| `makeSmtpMailerService(alias?)` | fn | Service factory; default alias `SMTP_MAILER` |
| `SmtpMailerService` | interface | `MailerService` + `verify()` + `close()` |
| `SmtpSettings` / `SmtpConfig` | interface | `cfg.smtp` block |
| `SMTP_MAILER` | const | `'smtp-mailer'` |
| `SMTP_DEFAULT_PORT` | const | `465` |
| `toTransportOptions` / `toMailOptions` | fn | Pure translations into nodemailer's shapes; test these, not the socket |

## Config shape

```ts
cfg.smtp = {
  host: 'smtp.eu.mailgun.org',
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

## Registration

```ts
import { MAILER_SERVICE } from '@owlmeans/mailer'
import { makeSmtpMailerService } from '@owlmeans/mailer-smtp'

context.registerService(makeSmtpMailerService(MAILER_SERVICE))
```

Register under `MAILER_SERVICE` so platform code — `OtpService` above all — resolves the mailer
without knowing the transport. Select between transports on config, not on a build flag:

```ts
context.registerService(
  cfg.smtp?.host != null && cfg.smtp.host !== ''
    ? makeSmtpMailerService(MAILER_SERVICE)
    : makeConsoleMailerService(MAILER_SERVICE)
)
```

## Ports and TLS

| Port | Mode | `secure` |
|---|---|---|
| 465 | implicit TLS from the first byte | `true` (default) |
| 587, 2525 | STARTTLS upgrade | `false` |
| 25 | plain / STARTTLS, often blocked | `false` |

## Rules

- **The relay's SMTP credential is not the account login.** Mailgun issues a per-sending-domain
  user (`postmaster@domain` or a custom one) under the domain's SMTP settings.
- The `From` domain must be verified with the relay; the local part is free-form.
- Deliberately **unpooled** — a pooled transport holds its socket and keeps a short-lived process
  alive. Add pooling only with a matching lifecycle.
- Errors are rethrown prefixed with the service alias and the server's own reply
  (`code`/`responseCode`/`response`). The password never reaches a message or a log.
- `verify()` authenticates without submitting a message — right for health checks; not proof that
  the relay accepts *a message* from your sender.
- Never register this in unit tests — use `makeConsoleMailerService`. `toMailOptions` plus
  nodemailer's own `jsonTransport` cover envelope assertions without a socket.
- **Never authenticate with a deliberately wrong password against a live relay.** Repeated failed
  logins trip the provider's brute-force protection and lock the shared credential for every
  environment using it — Mailgun then answers `535 Authentication failed` to the correct password
  too, and the credential has to be reset in its dashboard. Provoke transport errors with an
  unreachable socket (`host: '127.0.0.1', port: '1'`) instead.
- The live spec (`tests/send.spec.ts`) is gated on the SMTP block in `/.env.example` and **delivers
  real mail** when the gate is open. Empty variables = skip, never a failure.
- Rollup-bundling for a container image works with the default `preferBuiltins: true` node-resolve
  setup; nodemailer's dynamic requires do not need to be externalized.

## External references

- [nodemailer](https://www.npmjs.com/package/nodemailer) — v9.x, MIT-0, **zero dependencies**, the
  de-facto standard (~10.8k dependents). Ships no types; `@types/nodemailer` (v8.x) supplies them.
  CJS — import the default (`import nodemailer from 'nodemailer'`), not named members, so both Bun
  and Rollup's commonjs interop resolve it. Verified working under Bun and inside a Rollup CJS
  bundle (2026-08).
- [Mailgun — Send via SMTP](https://documentation.mailgun.com/docs/mailgun/user-manual/sending-messages/send-smtp)
  — hosts `smtp.mailgun.org` / `smtp.eu.mailgun.org`; port 465 requires TLS, ports 25/587/2525 start
  plain and upgrade via STARTTLS. Credentials are **per sending domain**, managed under that domain's
  SMTP settings — not the account login. `X-Mailgun-Drop-Message: yes` submits in test mode (accepted,
  never delivered); other `X-Mailgun-*` headers cover tagging, DKIM, tracking and required TLS.
