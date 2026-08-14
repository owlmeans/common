# @owlmeans/server-auth-otp

Email OTP `AuthPlugin` for OwlMeans servers — passwordless login via time-limited one-time codes.

## Overview

- `makeOtpPlugin(context)` — factory for the `AuthPlugin` that handles `OTP_AUTH_TYPE` authentication requests
- `OtpService` — issues email challenges and verifies submitted codes; backed by `@owlmeans/auth-otp`
- Integrates with `@owlmeans/server-auth` plugin registry — plugs in alongside other auth strategies
- Resolves identities through `@owlmeans/server-auth-identity` after OTP verification

## Installation

```bash
bun add @owlmeans/server-auth-otp
```

## Usage

```typescript
import { makeOtpPlugin, OTP_SERVICE } from '@owlmeans/server-auth-otp'
import { registerPlugin } from '@owlmeans/server-auth/manager/plugins'

// Register in a server context that already has an OtpService wired
registerPlugin(context, makeOtpPlugin(context))
```

The OTP service must be backed by a transport (e.g. `@owlmeans/mailer` → `@owlmeans/server-mailer-mailgun`) that can deliver the one-time code.

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
