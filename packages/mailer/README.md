# @owlmeans/mailer

Provider-agnostic email dispatch interface for the OwlMeans framework — `MailerService` abstraction and console/dev transport.

## Overview

- `MailerService` — `InitializedService` with a single `send(message)` method; implementations are swapped per environment
- `MailMessage` — `{ to, subject, text?, html? }` shape accepted by all transports
- `MAILER_SERVICE` constant — context alias for registering and resolving the mailer service
- Default transport logs to console (suitable for development and unit tests)
- Production transports provided by `@owlmeans/server-mailer-mailgun` and similar packages

## Installation

```bash
bun add @owlmeans/mailer
```

## Usage

```typescript
import { MAILER_SERVICE } from '@owlmeans/mailer'
import type { MailerService, MailMessage } from '@owlmeans/mailer'

// Resolve from context and send
const mailer = context.service<MailerService>(MAILER_SERVICE)
await mailer.send({ to: 'user@example.com', subject: 'Welcome', text: 'Hello!' })
```

For production email via Mailgun, register `@owlmeans/server-mailer-mailgun` in your server context.

<!-- owlmeans:agent-guidance:start -->
## Agent guidance

This package ships embedded agent skills under `agent-meta/`. After installing your
`@owlmeans/*` packages, run the OwlMeans agent-skills installer to place them into
your project's skill store (`.agents/skills/`):

```sh
npx @owlmeans/agent-skills
```

The embedded files are version-matched to this package release. Do not edit them
directly — they are regenerated on each publish. To contribute guidance edits,
open a PR against the source monorepo.
<!-- owlmeans:agent-guidance:end -->
