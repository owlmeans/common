# @owlmeans/server-auth

Server-side Ed25519 authentication service for OwlMeans backends.

## Overview

- Implements the `GuardService` interface for Ed25519-signed token verification
- `appendAuthService()` registers the auth guard into a server context
- `DEFAULT_ALIAS` (`'auth'`) is the service alias and re-exported as `DAUTH_GUARD` via `@owlmeans/server-app`
- Handles token caching via a static resource identified by `AUTH_CACHE`

## Installation

```bash
bun add @owlmeans/server-auth
```

## Usage

Registered automatically by `makeContext()` from `@owlmeans/server-app`. To customize, pass `customize: true` and append manually:

```typescript
import { makeContext } from '@owlmeans/server-app'
import { appendAuthService, AUTH_CACHE } from '@owlmeans/server-auth'

const context = makeContext(appConfig, true)  // skip default auth

// Append auth with custom config
appendAuthService(context)
```

Reference the guard by alias when protecting routes:

```typescript
import { DAUTH_GUARD } from '@owlmeans/server-app'
// same as DEFAULT_ALIAS from @owlmeans/server-auth

const adminModule = module(route('admin', '/admin'), guard(DAUTH_GUARD))
```

## API

### `appendAuthService<C, T>(context): void`

Registers the Ed25519 auth service and its nonce cache resource into the context.

### `makeAuthService(alias?): AuthService`

Creates the auth service directly (used internally by `appendAuthService`).

### `DEFAULT_ALIAS`

The auth service alias: `'auth'`. Re-exported as `DAUTH_GUARD` from `@owlmeans/server-app`.

### `AUTH_CACHE`

Resource alias for the nonce replay-prevention cache.

## Product-Viable Integration Notes

- Register `appendAuthService(context)` before `appendAuthIdentityResources(context)` and product-specific gate services.
- Register `AUTH_CACHE` explicitly as a Redis resource when customizing the backend context.
- This package verifies bearer tokens and populates `request.auth`; authorization remains the job of module gates and handler-level entity checks.
- Pair it with `@owlmeans/server-auth-identity` when external provider login should produce durable local account/profile/credentials records.

## Related Packages

- [`@owlmeans/auth-common`](../auth-common) — `GUARD_ED25519` constant and auth modules
- [`@owlmeans/server-app`](../server-app) — `makeContext` calls `appendAuthService` by default

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
