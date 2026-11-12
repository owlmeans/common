# @owlmeans/mailer-smtp

SMTP transport for the OwlMeans mailer host (`@owlmeans/mailer`), built on
[nodemailer](https://nodemailer.com). SMTP is a standard protocol, so this transport works against
any relay that exposes it.

## Overview

- `appendSmtpMailer(ctx, opts?)` — register the transport with the mailer host (`MAILER_SERVICE`,
  or `opts.alias`) and get it back
- `makeSmtpMailerTransport(ctx, opts?)` — the transport itself, bound to the context whose
  `cfg.smtp` it reads at init and on every send
- `SmtpSettings` / `SmtpConfig` — the config block; `ServerConfig.smtp?` is declared by module
  augmentation, so any server config types it. Numbers and booleans also accept their string form,
  because config values mounted from files always arrive as text
- `verify()` — open a session and authenticate without sending, for health checks and tests;
  `close()` releases the connection
- `makeSmtpSettingsModel(smtp).toTransportOptions()` / `.toMailOptions(message)` — the pure
  translations into nodemailer's shapes; `assertSmtpSettings()` validates the block
- `makeSmtpMailerService(alias?, opts?)` — deprecated standalone service delegating to the same
  transport

## Installation

```bash
bun add @owlmeans/mailer-smtp@^0.2.0-alpha.0
```

## Usage

```typescript
import { appendSmtpMailer } from '@owlmeans/mailer-smtp'

cfg.smtp = {
  host: 'smtp.example.com',
  port: 465,           // implicit TLS; use 587 / 2525 with `secure: false` for STARTTLS
  secure: true,
  user: 'no-reply@example.com',
  pass: process.env.SMTP_PASSWORD,
  from: 'Example <no-reply@example.com>',
}

// In makeContext: the mailer host under MAILER_SERVICE now sends through SMTP, so consumers — the
// email-OTP auth plugin above all — resolve the mailer without knowing which transport backs it.
appendSmtpMailer(context, { authenticated: true, verifyOnInit: true })
```

`authenticated` requires a host, sender, user and password; `verifyOnInit` authenticates while the
context initializes, so an unusable relay fails the start instead of a later send. A second host
under its own alias (a transport another service wraps) takes `{ alias: 'my-transport' }`.

In a server context, point the settings at mounted files instead of literals — the
`fileConfigReader` middleware replaces any value starting with `/` by the file's contents before
the context initializes:

```typescript
cfg.smtp = {
  host: '/etc/app-config/smtp-host',
  user: '/etc/app-config/smtp-user',
  from: '/etc/app-config/smtp-from',
  pass: '/etc/master-secret/smtp-secret',
}
```

## Errors

Every error is prefixed with the transport id (`smtp-mailer`, or `opts.id`): a missing setting is a
`SyntaxError` (`smtp-mailer: cfg.smtp.host is not configured`) raised before any socket; a relay
failure is an `Error` carrying the server's own reply, never the password.

## Tests

`tests/message.spec.ts` and `tests/transport.spec.ts` need no relay (the transport spec only opens a
refused local socket). `tests/send.spec.ts` is env-gated and **delivers real mail** when open — see
the SMTP block in the monorepo's `.env.example`.

```bash
bun run build && bun test ./tests
```

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
