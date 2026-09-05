# @owlmeans/mailer-smtp

SMTP transport for the OwlMeans `MailerService` contract, built on [nodemailer](https://nodemailer.com).

## Overview

- `makeSmtpMailerService(alias?)` — `MailerService` implementation reading `cfg.smtp`
- `SmtpSettings` / `SmtpConfig` — the config block; numbers and booleans also accept their string form, because config values mounted from files always arrive as text
- `verify()` — open a session and authenticate without sending, for health checks and tests
- `toTransportOptions()` / `toMailOptions()` — the pure translations into nodemailer's shapes
- Works with any SMTP relay; Mailgun, SES and Postmark all expose one

## Installation

```bash
bun add @owlmeans/mailer-smtp@^0.1.18-rc.11
```

## Usage

```typescript
import { MAILER_SERVICE } from '@owlmeans/mailer'
import { makeSmtpMailerService } from '@owlmeans/mailer-smtp'

cfg.smtp = {
  host: 'smtp.eu.mailgun.org',
  port: 465,           // implicit TLS; use 587 / 2525 with `secure: false` for STARTTLS
  secure: true,
  user: 'no-reply@example.com',
  pass: process.env.SMTP_PASSWORD,
  from: 'Example <no-reply@example.com>',
}

// Register under MAILER_SERVICE so consumers — the email-OTP auth plugin above all —
// resolve the mailer without knowing which transport backs it.
context.registerService(makeSmtpMailerService(MAILER_SERVICE))
```

In a server context, point the settings at mounted files instead of literals — the
`fileConfigReader` middleware replaces any value starting with `/` by the file's contents:

```typescript
cfg.smtp = {
  host: '/etc/app-config/smtp-host',
  user: '/etc/app-config/smtp-user',
  from: '/etc/app-config/smtp-from',
  pass: '/etc/master-secret/smtp-secret',
}
```

## Tests

`tests/message.spec.ts` needs nothing. `tests/send.spec.ts` is env-gated and **delivers real
mail** when open — see the SMTP block in the monorepo's `.env.example`.

```bash
bun run build && bun test ./tests
```

<!-- owlmeans:agent-guidance:start -->
## Agent guidance

This package ships embedded agent skills under `agent-meta/`. After installing your
`@owlmeans/*` packages, run the OwlMeans agent-skills installer to place them into
your project's skill store (`.agents/skills/`):

```sh
npx @owlmeans/agent-skills@^0.1.18-rc.12
```

The embedded files are version-matched to this package release. Do not edit them
directly — they are regenerated on each publish. To contribute guidance edits,
open a PR against the source monorepo.
<!-- owlmeans:agent-guidance:end -->
