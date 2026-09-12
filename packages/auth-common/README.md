# @owlmeans/auth-common

Predefined authentication protocols, guards, and constants shared between server and client packages.

## Overview

- Exports the immutable `authProtocols` and `managerProtocols` trees for login, init, rely, and dispatcher flows
- Provides `DEFAULT_GUARD` and `GUARD_ED25519` constants for protecting routes
- Implements the Basic ED25519 signature guard service for cryptographic request authentication
- Headers: `BED255_NONCE_HEADER`, `BED255_TIME_HEADER` for auth challenge/response

## Installation

```bash
bun add @owlmeans/auth-common@^0.1.18-rc.21
```

## Usage

Import the shared declarations and bind them only through the server or browser package that owns
the runtime behaviour:

```typescript
import { authProtocols } from '@owlmeans/auth-common'
import { GUARD_ED25519, DEFAULT_GUARD } from '@owlmeans/auth-common'

// Call the exact registered declaration; do not look up auth routes by an alias string.
await context.entrypoint(authProtocols.dispatcherAuthenticate).call({ body: token })
```

Protect a route with the ED25519 signature guard (re-exported via `@owlmeans/server-app`):

```typescript
import { GUARD_ED25519 } from '@owlmeans/auth-common'
import { contract, protocol, typed } from '@owlmeans/entrypoint'
import { route } from '@owlmeans/route'

const adminProtocol = protocol(
  route('admin', '/api/admin'),
  contract(typed<AdminResponse>()),
  { guards: GUARD_ED25519 },
)
```

## API

### `authProtocols`

Immutable shared declarations covering the standard auth flow:
- `AUTHEN` — backend `/authentication` base route
- `AUTHEN_INIT` — POST `/authentication/init` (allowance request)
- `AUTHEN_AUTHEN` — POST `/authentication/authenticate` (credential submission)
- `AUTHEN_RELY` — WebSocket `/authentication/rely`
- `CAUTHEN`, `CAUTHEN_AUTHEN` — frontend auth routes
- `DISPATCHER` — frontend dispatcher route (sticky, handles redirect auth tokens)

`@owlmeans/server-auth`, `@owlmeans/client-auth`, and the OIDC packages export local runtime
binding arrays for the declarations they serve. Keep those arrays local to the runtime; application
code uses this tree's protocol objects.

### `managerProtocols`

Immutable shared manager protocol tree for profile-to-organization mapping and auth delegation.

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
- Product authorization composes a custom gate in the protocol options rather than using `OIDC_GATE` for Google login flows.
- `GUARD_ED25519` remains the service-to-service guard for internal/publisher/payment/auth-service calls.
- The browser-side binding from `@owlmeans/client-auth` uses the same protocol references as the shared declarations.

## Related Packages

- [`@owlmeans/auth`](../auth) — auth type definitions and schemas
- [`@owlmeans/server-auth`](../server-auth) — server bindings and guard implementation
- [`@owlmeans/client-auth`](../client-auth) — browser bindings and auth service

<!-- owlmeans:agent-guidance:start -->
## Agent guidance

This package ships embedded agent skills under `agent-meta/`. After installing your
`@owlmeans/*` packages, run the OwlMeans agent-skills installer to place them into
your project's skill store (`.agents/skills/`):

```sh
npx @owlmeans/agent-skills@^0.1.18-rc.20
```

The embedded files are version-matched to this package release. Do not edit them
directly — they are regenerated on each publish. To contribute guidance edits,
open a PR against the source monorepo.
<!-- owlmeans:agent-guidance:end -->
