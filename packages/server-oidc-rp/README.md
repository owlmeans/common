# @owlmeans/server-oidc-rp

Server-side OIDC relying party — registers the OIDC guard, wrapping service, gate, and IdP-side client wiring.

## Overview

- `appendOidcGuard(context)` — registers the OIDC guard service
- `makeOidcWrappingService()` / `makeOidcGate()` — token wrapping service and gate factory
- `oidcEntrypoints` — local bindings for the shared OIDC protocol pair
- `makeAuthServiceEntrypoints(...)` — returns external-auth protocol declarations
- `makeOidcClientService()` / `OidcClientService` — IdP-side client (e.g., Keycloak admin)
- Subpath `./auth` — admin-client constants like `OIDC_ADMIN_CLIENT`

## Installation

```bash
bun add @owlmeans/server-oidc-rp@^0.1.18-rc.17
```

## Usage

Register services in `context.ts`:

```typescript
import {
  appendOidcGuard, makeOidcWrappingService, makeOidcGate, makeOidcClientService
} from '@owlmeans/server-oidc-rp'

context.registerService(makeOidcWrappingService())
context.registerService(makeOidcGate())
context.registerService(makeOidcClientService())
appendOidcGuard<C, T>(context)
```

Decorate shared declarations immutably, then bind OIDC in `entrypoints.ts`:

```typescript
import { withOidcGuard } from '@owlmeans/oidc'
import { oidcEntrypoints } from '@owlmeans/server-oidc-rp'

const configuredProtocols = withOidcGuard(protocols)
const appEntrypoints = [
  // Bind application protocols against configuredProtocols here.
  ...oidcEntrypoints,
]
```

Configure providers in `config.ts`:

```typescript
import { OIDC_ADMIN_CLIENT } from '@owlmeans/server-oidc-rp/auth'

cfg.oidc ??= {}
cfg.oidc.providers ??= []
cfg.oidc.providers.push({
  clientId: OIDC_ADMIN_CLIENT,
  basePath: 'realms/master',
  service: OIDC_PRODUCT,
  secret: '/etc/master-secret/oidc-admin-secret',
  internal: true
})
```

Use the IdP-side client in a service:

```typescript
import { DEFAULT_ALIAS as OIDC_SERVICE } from '@owlmeans/server-oidc-rp'
import type { OidcClientService } from '@owlmeans/server-oidc-rp'

const oidc = context.service<OidcClientService>(OIDC_SERVICE)
```

## API

### Service factories

- `appendOidcGuard<C, T>(context): T` — register the OIDC guard
- `makeOidcWrappingService(alias?)` — token-wrapping service
- `makeOidcGate(alias?)` — gate factory
- `makeOidcClientService(alias?)` — IdP-side client (used to call OIDC admin API)

### Entrypoint wiring

- `withOidcGuard(protocols, coguards?)` (`@owlmeans/oidc`) — return a decorated immutable protocol tree
- `oidcEntrypoints` — local bindings for the shared OIDC init and authenticate protocols
- `makeAuthServiceEntrypoints(serviceAlias, prefix?)` — return external auth protocol declarations

### Constants

- `DEFAULT_ALIAS` — `'oidc-client'`
- `OIDC_TOKEN_STORE`, `PROVIDER_CACHE_TTL`, `OIDC_AUTH_LIFTETIME`, `OIDC_WRAP_FRESHNESS`
- `./auth` subpath: `OIDC_ADMIN_CLIENT` and related admin-client constants

### Types

`OidcClientService`, RP config types — exported from the root entry.

## Product-Viable Integration Notes

- `makeOidcClientService()` reads provider descriptors from `cfg.oidc.providers`, including Google and internal admin providers.
- Use `findProvider(predicate)`, `hasProvider(params)`, and `entityToClientId(params)` for provider lookup rather than ad hoc config scans.
- `makeAuthServiceEntrypoints(AUTH_API)` declares provider-list and token-update endpoints protected by `GUARD_ED25519`; bind them in the service that serves the routes.
- If OIDC/Google is only the login provider and local identity records hold authorization, do not re-add `appendOidcGuard()` or `makeOidcGate()` as product authorization. Use a product-specific `GateService` over local profile scopes.

## Related Packages

- [`@owlmeans/oidc`](../oidc) — shared `OIDC_GATE`, `OIDC_GUARD`, types
- [`@owlmeans/server-auth`](../server-auth) — works alongside the OIDC guard for token verification
- [`@owlmeans/server-context`](../server-context) — base context where services are registered
- [`@owlmeans/auth-common`](../auth-common) — `DEFAULT_GUARD`, which `withOidcGuard()` decorates

<!-- owlmeans:agent-guidance:start -->
## Agent guidance

This package ships embedded agent skills under `agent-meta/`. After installing your
`@owlmeans/*` packages, run the OwlMeans agent-skills installer to place them into
your project's skill store (`.agents/skills/`):

```sh
npx @owlmeans/agent-skills@^0.1.18-rc.16
```

The embedded files are version-matched to this package release. Do not edit them
directly — they are regenerated on each publish. To contribute guidance edits,
open a PR against the source monorepo.
<!-- owlmeans:agent-guidance:end -->
