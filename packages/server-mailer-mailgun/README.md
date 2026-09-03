# @owlmeans/server-mailer-mailgun

Mailgun production email transport for OwlMeans — implements `MailerService` via the Mailgun HTTP API.

## Overview

- `makeMailgunMailer()` — creates a `MailerService` that sends via the Mailgun v3 REST API
- `MAILGUN_MAILER` constant — context alias for registration and lookup
- `MailgunConfig` — extends `ServerConfig` with `{ apiKey, domain, from, baseUrl? }`
- Zero extra runtime dependencies — uses the global `fetch()` (Node 18+)
- Swap in for the default console transport by registering this service in your server context

## Installation

```bash
bun add @owlmeans/server-mailer-mailgun@^0.1.18-rc.7
```

## Usage

```typescript
import { makeMailgunMailer, MAILGUN_MAILER } from '@owlmeans/server-mailer-mailgun'

// Register in your server context
context.registerService(makeMailgunMailer())

// Config section (in your server config object)
const config = {
  mailgun: {
    apiKey: process.env.MAILGUN_API_KEY!,
    domain: 'mg.example.com',
    from: 'OwlMeans Platform <noreply@mg.example.com>',
  },
}
```

The service is resolved at runtime via `context.service<MailerService>(MAILGUN_MAILER)` — or automatically by code that resolves `MAILER_SERVICE` from `@owlmeans/mailer` when this service is registered under that alias.

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
