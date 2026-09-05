# @owlmeans/auth-common

Predefined authentication entrypoints, guards, and constants shared between server and client packages.

## Overview

- Exports standard auth entrypoint definitions (login, init, rely, dispatcher) ready to register in any app
- Provides `DEFAULT_GUARD` and `GUARD_ED25519` constants for protecting routes
- Implements the Basic ED25519 signature guard service for cryptographic request authentication
- Headers: `BED255_NONCE_HEADER`, `BED255_TIME_HEADER` for auth challenge/response

## Installation

```bash
bun add @owlmeans/auth-common@^0.1.18-rc.12
```

## Usage

Register the built-in auth entrypoints and protect a route:

```typescript
import { entrypoints } from '@owlmeans/auth-common'
import { GUARD_ED25519, DEFAULT_GUARD } from '@owlmeans/auth-common'

// Add auth entrypoints to your app (includes /authentication, /login, /dispatcher routes)
await main(context, [...entrypoints, ...appEntrypoints])
```

Protect a route with the ED25519 signature guard (re-exported via `@owlmeans/server-app`):

```typescript
import { GUARD_ED25519 } from '@owlmeans/auth-common'
import { entrypoint, guard } from '@owlmeans/server-app'

const adminEntrypoint = entrypoint(route('admin', '/api/admin'), guard(GUARD_ED25519))
```

## API

### `entrypoints`

Array of pre-built `CommonEntrypoint` instances covering the standard auth flow:
- `AUTHEN` — backend `/authentication` base route
- `AUTHEN_INIT` — POST `/authentication/init` (allowance request)
- `AUTHEN_AUTHEN` — POST `/authentication/authenticate` (credential submission)
- `AUTHEN_RELY` — WebSocket `/authentication/rely`
- `CAUTHEN`, `CAUTHEN_AUTHEN` — frontend auth routes
- `DISPATCHER` — frontend dispatcher route (sticky, handles redirect auth tokens)

### Guard Constants

```typescript
DEFAULT_GUARD   // alias for the default auth service ('auth')
GUARD_ED25519   // guard name for Basic ED25519 signature authentication
```

### Header Constants (for WebSocket/HTTP auth challenges)

```typescript
BED255_NONCE_HEADER  // 'X-Auth-Nonce'
BED255_TIME_HEADER   // 'X-Auth-Time'
BED255_CASHE_RESOURCE // resource alias for nonce cache
```

## Product-Viable Integration Notes

- `DEFAULT_GUARD` protects manager routes after bearer authentication is installed by `@owlmeans/server-auth`.
- Product authorization composes a custom gate inside `guard(DEFAULT_GUARD, gate(VIABLE_AUTH_GATE, [...]))` rather than using `OIDC_GATE` for Google login flows.
- `GUARD_ED25519` remains the service-to-service guard for internal/publisher/payment/auth-service calls.
- The browser-side alias from `@owlmeans/client-auth` must match the default guard name so shared entrypoint declarations elevate consistently.

## Related Packages

- [`@owlmeans/auth`](../auth) — auth type definitions and schemas
- [`@owlmeans/server-auth`](../server-auth) — server guard implementation
- [`@owlmeans/client-auth`](../client-auth) — client auth service

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
