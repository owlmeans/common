# @owlmeans/client-auth

Client-side authentication service providing user auth state and external auth flow setup.

## Overview

- `useSelfAuth()` — React hook that returns the current authenticated user's `Auth` object
- `setupExternalAuthentication()` — configure the client to authenticate against an external identity provider
- `modules` — pre-built client modules for the auth flow (login, dispatcher)
- `DEFAULT_ALIAS` — the auth service alias (`'auth'`)

## Installation

```bash
bun add @owlmeans/client-auth
```

## Usage

Access current auth state in a component:

```typescript
import { useSelfAuth } from '@owlmeans/client-auth'

function UserMenu() {
  const auth = useSelfAuth()
  return <span>{auth?.userId}</span>
}
```

Set up external authentication (e.g. OIDC redirect):

```typescript
import { setupExternalAuthentication } from '@owlmeans/client-auth'

// In context setup
setupExternalAuthentication(context, { serviceUrl: process.env.AUTH_URL })
```

## API

### `useSelfAuth(): Auth | null`

Returns the current `Auth` object from the context, or `null` if not authenticated.

### `setupExternalAuthentication(ctx, opts?)`

Configures the context to redirect to an external identity provider for authentication.

### `modules`

Pre-built `ClientModule[]` for the auth flow (mirrors `@owlmeans/auth-common`'s modules with client route models).

### `DEFAULT_ALIAS`

Auth service alias: `'auth'`.

## Related Packages

- [`@owlmeans/auth`](../auth) — `Auth` type returned by `useSelfAuth`
- [`@owlmeans/auth-common`](../auth-common) — auth module route definitions
- [`@owlmeans/server-auth`](../server-auth) — server-side counterpart
