# @owlmeans/server-auth-otp

Email OTP `AuthPlugin` for OwlMeans servers — passwordless login via time-limited one-time codes.

## Overview

- `appendOtpPlugin(context)` — registers the `AuthPlugin` that handles `OTP_AUTH_TYPE` (`'email-otp'`) authentication requests
- `makeOtpService(alias?)` — issues email challenges and verifies submitted codes; backed by `@owlmeans/auth-otp`
- Integrates with the `@owlmeans/server-auth` plugin registry — plugs in alongside other auth strategies
- Resolves identities through `@owlmeans/server-auth-identity` after OTP verification

## Installation

```bash
bun add @owlmeans/server-auth-otp@^0.1.18-rc.17
```

## Usage

```typescript
import { makeRedisResource } from '@owlmeans/redis-resource'
import { OTP_RESOURCE, OTP_SERVICE } from '@owlmeans/auth-otp'
import { appendOtpPlugin, makeOtpService } from '@owlmeans/server-auth-otp'
import { MAILER_SERVICE } from '@owlmeans/mailer'
import { makeSmtpMailerService } from '@owlmeans/mailer-smtp'

context.registerResource(makeRedisResource(OTP_RESOURCE))   // challenge store
context.registerService(makeSmtpMailerService(MAILER_SERVICE))
context.registerService(makeOtpService(OTP_SERVICE))

appendOtpPlugin(context)   // registers the plugin factory under 'email-otp'
```

`appendOtpPlugin` writes into a module-level registry, so it is a global side effect: the
`context` it takes is only returned for chaining, and the plugin factory receives the live
context per request.

The OTP service must be backed by a transport that can deliver the one-time code —
`@owlmeans/mailer-smtp` (SMTP) or `@owlmeans/server-mailer-mailgun` (Mailgun HTTP API),
registered under `MAILER_SERVICE`. Override the alias with `cfg.otp.mailerAlias`.

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
