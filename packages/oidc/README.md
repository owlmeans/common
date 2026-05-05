# @owlmeans/oidc

Shared OIDC protocol abstractions — guard/gate aliases, models, and module declarations used by both server and browser OIDC packages.

## Overview

- `OIDC_GATE` — gate alias to compose with `gate(...)` inside `guard(...)` declarations
- `OIDC_GUARD`, `WRAPPED_OIDC`, `OIDC_FLOW`, `OIDC_AUTHEN_MODULE`, `OIDC_WRAPPED_TOKEN` — shared aliases
- `OidcGuard`, `WithSharedConfig`, `OidcProviderConfig` — shared types
- Module declarations for the OIDC dispatcher (`/authenticate/oidc/init`, `/authenticate/oidc/process`)

## Installation

```bash
bun add @owlmeans/oidc
```

## Usage

Compose `OIDC_GATE` into a guard on a module:

```typescript
import { module, guard, gate } from '@owlmeans/module'
import { route } from '@owlmeans/route'
import { DEFAULT_GUARD } from '@owlmeans/auth-common'
import { OIDC_GATE } from '@owlmeans/oidc'

module(
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
- `DISPATCHER_OIDC`, `DISPATCHER_OIDC_INIT` — auth dispatcher module aliases
- `INTERACTION`, `INTERACTION_PATH` — interaction route aliases
- `OIDC_GUARD_CACHE` — guard cache resource alias

### Types

- `OidcGuard` — guard payload shape (used in WS auth helpers)
- `WithSharedConfig` — config mixin adding the OIDC fields
- `OidcProviderConfig` — provider configuration shape

### `modules`

Array of dispatcher module declarations: `POST /authenticate/oidc/init` and `POST /authenticate/oidc/process`.

## Related Packages

- [`@owlmeans/server-oidc-rp`](../server-oidc-rp) — server-side relying party that consumes these constants
- [`@owlmeans/web-oidc-rp`](../web-oidc-rp) — browser-side relying party
- [`@owlmeans/server-oidc-provider`](../server-oidc-provider) — embedded OIDC identity provider
- [`@owlmeans/auth-common`](../auth-common) — `DEFAULT_GUARD` typically composed alongside `OIDC_GATE`
