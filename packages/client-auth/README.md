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

## Product-Viable Integration Notes

- The manager web app imports `DEFAULT_ALIAS` from this package as the client-side guard alias.
- `@owlmeans/web-oidc-rp/auth/plugins` is imported for side effects to register the `OIDC_CLIENT_AUTH` and `GOOGLE_CLIENT_AUTH` plugins.
- Redirect plugins persist auth control state before leaving the app and restore it before submitting provider query params as `AuthCredentials`.
- After login, the browser stores a normal OwlMeans bearer token; product authorization is enforced by server gates and handler checks.

## Related Packages

- [`@owlmeans/auth`](../auth) — `Auth` type returned by `useSelfAuth`
- [`@owlmeans/auth-common`](../auth-common) — auth module route definitions
- [`@owlmeans/server-auth`](../server-auth) — server-side counterpart

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
