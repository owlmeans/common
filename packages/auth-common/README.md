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

## Related Packages

- [`@owlmeans/auth`](../auth) — auth type definitions and schemas
- [`@owlmeans/server-auth`](../server-auth) — server guard implementation
- [`@owlmeans/client-auth`](../client-auth) — client auth service
