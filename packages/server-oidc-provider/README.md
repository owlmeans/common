# @owlmeans/server-oidc-provider

Embedded OIDC identity provider — wraps the `oidc-provider` library as an OwlMeans service.

> Use this package only when your service IS the identity provider (Keycloak alternative). For consuming an external IdP, use [`@owlmeans/server-oidc-rp`](../server-oidc-rp).

## Overview

- `createOidcProviderService(alias?)` — factory for the embedded provider service
- `appendOidcProviderService(context, alias?)` — registers the service on a context
- `createOidcProviderMiddleware(webAlias?, oidcAlias?)` — middleware mounting the OIDC endpoints (authorize, token, userinfo, jwks)
- Hosts the interaction UI route alias `oidc:interaction`

## Installation

```bash
bun add @owlmeans/server-oidc-provider
```

## Usage

Register the service and mount the middleware:

```typescript
import {
  createOidcProviderService,
  appendOidcProviderService,
  createOidcProviderMiddleware
} from '@owlmeans/server-oidc-provider'

appendOidcProviderService<C, T>(context)
context.registerMiddleware(createOidcProviderMiddleware())
```

The provider exposes the standard OIDC endpoints under the configured base path; the interaction screen is mounted at the path defined by `INTERACTION_PATH` from `@owlmeans/oidc`.

## API

### `createOidcProviderService(alias?): OidcProviderService`

Creates the embedded OIDC provider service. `alias` defaults to `DEFAULT_ALIAS` (`'oidc-provider'`).

### `appendOidcProviderService<C, T>(context, alias?): T`

Registers the provider service on the context.

### `createOidcProviderMiddleware(webAlias?, oidcAlias?)`

Returns middleware that mounts the OIDC authorize/token/userinfo/jwks endpoints onto the web app.

### Constants

- `DEFAULT_ALIAS` — `'oidc-provider'`
- `OIDC_ACCOUNT_SERVICE` — `'oidc-account-service'` — alias for the user account adapter

### Types

`OidcProviderService` and provider config types are exported from the root entry.

## Related Packages

- [`@owlmeans/oidc`](../oidc) — shared protocol constants and module declarations
- [`@owlmeans/server-oidc-rp`](../server-oidc-rp) — relying-party counterpart for consuming external IdPs
- [`@owlmeans/server-api`](../server-api) — the underlying server API the middleware mounts onto
- [`@owlmeans/web-oidc-provider`](../web-oidc-provider) — browser UI for the provider's interaction screens

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
