# @owlmeans/web-oidc-provider

Browser-side state for an embedded OIDC provider's interaction screens (login, consent).

> Use this package only when your app hosts the OIDC provider screens. For relying-party usage in a web app, use [`@owlmeans/web-oidc-rp`](../web-oidc-rp) instead.

## Overview

- `makeAuthStateModel(...)` — factory for the OIDC interaction state model
- `OidcAuthState` enum — `Authenticated`, `SameEntity`, `IdLinked`, `ProfileExists`, `RegistrationAllowed`, `Simplified`
- Types describing the provider UI state

## Installation

```bash
bun add @owlmeans/web-oidc-provider@^0.1.18-rc.23
```

## Usage

```typescript
import { makeAuthStateModel, OidcAuthState } from '@owlmeans/web-oidc-provider'

const stateModel = makeAuthStateModel<C, T>(context, /* options */)

if (stateModel.state === OidcAuthState.Simplified) {
  // render simplified login screen
}
```

This package pairs with [`@owlmeans/server-oidc-provider`](../server-oidc-provider): the server hosts the OIDC endpoints, and this package drives the browser-rendered interaction screens.

## API

### `makeAuthStateModel<C, T>(context, ...)`

Creates the auth-state model used by the interaction UI. Reads the current interaction context and exposes typed state transitions.

### `OidcAuthState` enum

- `Authenticated` — `'authenticated'`
- `SameEntity` — `'same-entity'`
- `IdLinked` — `'id-linked'`
- `ProfileExists` — `'profile-exists'`
- `RegistrationAllowed` — `'registration-allowed'`
- `Simplified` — `'simplified'`

### Types

Provider UI state and option types — exported from the root entry.

## Related Packages

- [`@owlmeans/server-oidc-provider`](../server-oidc-provider) — server hosting OIDC endpoints and interactions
- [`@owlmeans/oidc`](../oidc) — shared `INTERACTION` constants and types
- [`@owlmeans/web-client`](../web-client) / [`@owlmeans/web-panel`](../web-panel) — web context this UI runs in

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
