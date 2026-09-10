# @owlmeans/oidc

Shared OIDC protocol abstractions — guard/gate aliases, models, and entrypoint declarations used by both server and browser OIDC packages.

## Overview

- `OIDC_GATE` — gate alias to compose with `gate(...)` inside `guard(...)` declarations
- `OIDC_GUARD`, `WRAPPED_OIDC`, `OIDC_FLOW`, `OIDC_AUTHEN_MODULE`, `OIDC_WRAPPED_TOKEN` — shared aliases
- `OidcGuard`, `WithSharedConfig`, `OidcProviderConfig` — shared types
- Entrypoint declarations for the OIDC dispatcher (`/authenticate/oidc/init`, `/authenticate/oidc/process`)

## Installation

```bash
bun add @owlmeans/oidc@^0.1.18-rc.12
```

## Usage

Compose `OIDC_GATE` into a guard on an entrypoint:

```typescript
import { entrypoint, guard, gate } from '@owlmeans/entrypoint'
import { route } from '@owlmeans/route'
import { DEFAULT_GUARD } from '@owlmeans/auth-common'
import { OIDC_GATE } from '@owlmeans/oidc'

entrypoint(
  route(manager.back.account.base, '/account'),
  guard(DEFAULT_GUARD, gate(OIDC_GATE, [`my-service-account-{entity}`]))
)
```

Extend an app config with shared OIDC config:

```typescript
import type { WithSharedConfig, OidcProviderConfig } from '@owlmeans/oidc'

interface AppConfig extends BasicConfig, WithSharedConfig {}
```

Type a websocket auth payload:

```typescript
import type { OidcGuard } from '@owlmeans/oidc'
import { OIDC_GUARD } from '@owlmeans/oidc'
```

## API

### Constants

- `OIDC_GATE` — `'oidc-gate'`
- `OIDC_GUARD` — `'guard:oidc'`
- `OIDC_FLOW` — `'oidc'`
- `WRAPPED_OIDC` — `'wrapped-oidc-authz'`
- `OIDC_AUTHEN_MODULE` — `'iam-oidc-authen'`
- `OIDC_WRAPPED_TOKEN` — `'oidc-wrapped-token'`
- `DISPATCHER_OIDC`, `DISPATCHER_OIDC_INIT` — auth dispatcher entrypoint aliases
- `INTERACTION`, `INTERACTION_PATH` — interaction route aliases
- `OIDC_GUARD_CACHE` — guard cache resource alias

### Types

- `OidcGuard` — guard payload shape (used in WS auth helpers)
- `WithSharedConfig` — config mixin adding the OIDC fields
- `OidcProviderConfig` — provider configuration shape

## Product-Viable Integration Notes

- Provider configuration belongs in `cfg.oidc.providers`; viable registers an internal admin provider and a Google provider there.
- `GOOGLE_SERVICE` is the stable provider service key (`'google'`) and must match browser plugin, backend provider lookup, and identity-linking derivation.
- `GOOGLE_CLIENT_AUTH` identifies the browser Google auth plugin registered by `@owlmeans/web-oidc-rp/auth/plugins`.
- `OIDC_GATE` is for OIDC-backed authorization. Apps that only use Google/OIDC for login and authorize against local identity records should define their own product gate alias.

### `entrypoints`

Array of dispatcher entrypoint declarations: `POST /authenticate/oidc/init` and `POST /authenticate/oidc/process`.

## Related Packages

- [`@owlmeans/server-oidc-rp`](../server-oidc-rp) — server-side relying party that consumes these constants
- [`@owlmeans/web-oidc-rp`](../web-oidc-rp) — browser-side relying party
- [`@owlmeans/server-oidc-provider`](../server-oidc-provider) — embedded OIDC identity provider
- [`@owlmeans/auth-common`](../auth-common) — `DEFAULT_GUARD` typically composed alongside `OIDC_GATE`

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
