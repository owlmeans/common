# @owlmeans/server-auth-session

A bounded seven-day authority registry for OwlMeans bearer and OIDC sessions. It supplies an
in-memory implementation for local/single-process applications and an atomic Redis implementation
for multi-instance production deployments.

## Installation

```bash
bun add @owlmeans/server-auth-session@^0.1.18-rc.7
```

## Usage

Register the memory manager before `appendAuthService` when a local application needs immediate
revocation or claim-refresh decisions:

```typescript
import { appendMemoryAuthSessionManager } from '@owlmeans/server-auth-session'
import { appendAuthService } from '@owlmeans/server-auth'

appendMemoryAuthSessionManager(context)
appendAuthService(context)
```

Use `appendRedisAuthSessionManager` in a multi-instance deployment. The application must register
its Redis resource first. Call `fence()` before changing a profile's authority, then `refresh()`
to require fresh claims or `revoke()` to reject all affected sessions. Session expiry is absolute;
neither manager extends it beyond seven days.

<!-- owlmeans:agent-guidance:start -->
## Agent guidance

This package ships embedded agent skills under `agent-meta/`. After installing your
`@owlmeans/*` packages, run the OwlMeans agent-skills installer to place them into
your project's skill store (`.agents/skills/`):

```sh
npx @owlmeans/agent-skills@^0.1.18-rc.36
```

The embedded files are version-matched to this package release. Do not edit them
directly — they are regenerated on each publish. To contribute guidance edits,
open a PR against the source monorepo.
<!-- owlmeans:agent-guidance:end -->
