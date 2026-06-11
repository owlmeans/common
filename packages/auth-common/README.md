# @owlmeans/auth-common

Predefined authentication modules, guards, and constants shared between server and client packages.

## Overview

- Exports standard auth module definitions (login, init, rely, dispatcher) ready to register in any app
- Provides `DEFAULT_GUARD` and `GUARD_ED25519` constants for protecting routes
- Implements the Basic ED25519 signature guard service for cryptographic request authentication
- Headers: `BED255_NONCE_HEADER`, `BED255_TIME_HEADER` for auth challenge/response

## Installation

```bash
bun add @owlmeans/auth-common
```

## Usage

Register the built-in auth modules and protect a route:

```typescript
import { modules } from '@owlmeans/auth-common'
import { GUARD_ED25519, DEFAULT_GUARD } from '@owlmeans/auth-common'

// Add auth modules to your app (includes /authentication, /login, /dispatcher routes)
await main(context, [...modules, ...appModules])
```

Protect a route with the ED25519 signature guard (re-exported via `@owlmeans/server-app`):

```typescript
import { GUARD_ED25519 } from '@owlmeans/auth-common'
import { module, guard } from '@owlmeans/server-app'

const adminModule = module(route('admin', '/api/admin'), guard(GUARD_ED25519))
```

## API

### `modules`

Array of pre-built `CommonModule` instances covering the standard auth flow:
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
- The browser-side alias from `@owlmeans/client-auth` must match the default guard name so shared module declarations elevate consistently.

## Related Packages

- [`@owlmeans/auth`](../auth) — auth type definitions and schemas
- [`@owlmeans/server-auth`](../server-auth) — server guard implementation
- [`@owlmeans/client-auth`](../client-auth) — client auth service

<!-- owlmeans:agent-guidance:start -->
## Agent guidance

This package ships embedded Claude Code skills and GitHub Copilot instructions under
`agent-meta/`. After installing your `@owlmeans/*` packages, run the OwlMeans
agent-skills installer to place them into your project's native locations
(`.claude/skills/` and `.github/instructions/`):

```sh
npx @owlmeans/agent-skills
```

The embedded files are version-matched to this package release. Do not edit them
directly — they are regenerated on each publish. To contribute guidance edits,
open a PR against the source monorepo.
<!-- owlmeans:agent-guidance:end -->
