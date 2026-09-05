# @owlmeans/mui-oidc-rp

Browser-side OIDC relying party — guard, auth service, and React components for OIDC login flows.

## Overview

- `appendOidcGuard(context)` — registers the OIDC guard on a web context
- `setupOidcGuard(entrypoints, coguards?, extras?)` — attaches the guard onto entrypoint declarations
- `makeOidcAuthService(alias?)` — browser-side OIDC auth service (built on `oidc-client-ts`)
- React components for login and callback handling
- `OidcAuthPurposes` enum — `Unknown` | `Subscribe` | `Login`

## Installation

```bash
bun add @owlmeans/mui-oidc-rp@^0.1.18-rc.23
```

## Usage

Register the guard in your web context:

```typescript
import { appendOidcGuard } from '@owlmeans/mui-oidc-rp'
import { makeContext as makeBasicContext } from '@owlmeans/mui-panel'

export const makeContext = <C extends Config, T extends Context<C>>(cfg: C): T => {
  const context = makeBasicContext<C, T>(cfg) as T
  appendOidcGuard<C, T>(context)
  return context
}
```

Wire OIDC onto entrypoint declarations:

```typescript
import { setupOidcGuard } from '@owlmeans/mui-oidc-rp'

setupOidcGuard(entrypoints, undefined, { payload: { simplified: true } })
```

## API

### `appendOidcGuard<C, T>(context): T`

Registers the OIDC guard service on the web context.

### `setupOidcGuard(entrypoints, coguards?, extras?)`

Attaches the OIDC guard to the given entrypoint declarations. `coguards` lets you compose with another guard alias; `extras` overrides the parametrised props (e.g., `payload.simplified`).

### `makeOidcAuthService(alias?): OidcAuthService`

Creates the browser OIDC auth service. `alias` defaults to `DEFAULT_ALIAS` (`'oidc-rp'`).

### Constants

- `DEFAULT_ALIAS` — `'oidc-rp'`
- `OidcAuthPurposes` enum: `Unknown`, `Subscribe`, `Login`

### Components

Login and callback React components exported from `./components` (re-exported at root).

## Product-Viable Integration Notes

- Import `@owlmeans/mui-oidc-rp/auth/plugins` for side effects to register `OIDC_CLIENT_AUTH` and `GOOGLE_CLIENT_AUTH` with `@owlmeans/client-auth`.
- The Google plugin uses `useValue`, persists auth control state before redirect, restores it on return, and submits URL query params as `AuthCredentials`.
- The browser starts login; the server exchanges provider code, links local identity, and returns a normal bearer token.
- Keep product authorization server-side through entrypoint gates and identity profile scopes.

## Related Packages

- [`@owlmeans/oidc`](../oidc) — shared `OIDC_GATE`, `OIDC_GUARD`, dispatcher entrypoints
- [`@owlmeans/web-client`](../web-client) — base web context this guard plugs into
- [`@owlmeans/mui-panel`](../mui-panel) — `makeContext` typically used as the base
- [`@owlmeans/client-auth`](../client-auth) — auth manager primitives the guard interacts with

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
