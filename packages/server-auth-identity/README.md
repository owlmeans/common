# @owlmeans/server-auth-identity

Mongo-backed local identity resources and provider account linking for OwlMeans server applications.

## Overview

- Registers three Mongo resources: local accounts, local profiles, and provider credentials.
- Provides `IdentityLinkingService` to map external provider profile details into an OwlMeans `AuthPayload`.
- Keeps external provider identity separate from local product identity and authorization scopes.
- Designed to work with `@owlmeans/server-auth`, `@owlmeans/server-oidc-rp`, and product-specific module gates.

## Installation

```bash
bun add @owlmeans/server-auth-identity
```

## Usage

Register identity resources in a server context after Mongo and auth services are available:

```typescript
import { appendAuthIdentityResources } from '@owlmeans/server-auth-identity'

appendAuthIdentityResources(context)
```

Link an external provider profile to a local account/profile:

```typescript
import { AUTH_IDENTITY_LINKING } from '@owlmeans/server-auth-identity'
import type { IdentityLinkingService } from '@owlmeans/server-auth-identity'

const linking = context.service<IdentityLinkingService>(AUTH_IDENTITY_LINKING)

const auth = await linking.linkProfile(providerDetails, { username })
```

Read identity profiles without mutating records:

```typescript
import { AUTH_IDENTITY_PROFILE } from '@owlmeans/server-auth-identity'
import type { IdentityProfileResource } from '@owlmeans/server-auth-identity'

const profiles = context.resource<IdentityProfileResource>(AUTH_IDENTITY_PROFILE)
const profile = await profiles.load(profileId, 'profileId')

const { items } = await profiles.list({ entityId, profileId } as any)
```

## API

### Resource Factories

- `makeIdentityAccountResource(dbAlias?)` - local account record, one per user.
- `makeIdentityProfileResource(dbAlias?)` - local profile record with `entityId`, `role`, `scopes`, and optional expiry.
- `makeIdentityCredentialsResource(dbAlias?)` - provider credentials link record.
- `appendAuthIdentityResources(context, dbAlias?)` - registers all resources and `IdentityLinkingService`.

### Aliases

- `AUTH_IDENTITY_ACCOUNT` - account resource alias.
- `AUTH_IDENTITY_PROFILE` - profile resource alias.
- `AUTH_IDENTITY_CREDENTIALS` - provider credentials resource alias.
- `AUTH_IDENTITY_LINKING` - linking service alias.

### Types

- `IdentityAccount` - `Profile & ResourceRecord`; `credential` is the generated local entity slug.
- `IdentityProfile` - `Profile & ResourceRecord`; includes `profileId`, `userId?`, `role`, `entityId`, `scopes`, `expiresAt?`.
- `IdentityCredentials` - `AuthCredentials & ResourceRecord`; includes `profileId` and derived provider keys.
- `IdentityLinkingService` - `getLinkedProfile`, `linkProfile`, `linkCredentials`, `getOwnerProfiles`, `getOwnerCredentials`.

## Key Derivation

- Account `credential`: generated Base58 local entity slug.
- Profile `profileId`: `"{type}:{accountId}"`.
- Credentials `userId`: `"{type}:{service}:{providerSub}"`.
- Credentials `credential`: `"service:{type}:{service}"`.

## Product-Viable Integration Notes

- Google/OIDC login is only the provider bootstrap path; durable authorization data lives in `IdentityProfile`.
- Backend contexts should register `appendAuthService(context)`, then `appendAuthIdentityResources(context)`, then product gate services.
- Product gates should read `AUTH_IDENTITY_PROFILE`, verify `entityId`, reject expired or blocked profiles, and compare gate params against profile scopes.
- `Resource.pick()` is destructive and deletes the matching record. Never use `pick()` for gate or handler reads; use `load()` or `list()`.

## Related Packages

- [`@owlmeans/auth`](../auth) - core `AuthPayload`, `AuthRole`, `Profile`, and auth errors.
- [`@owlmeans/server-auth`](../server-auth) - bearer verification and default auth guard.
- [`@owlmeans/server-oidc-rp`](../server-oidc-rp) - provider exchange and account-linking interface compatibility.
- [`@owlmeans/oidc`](../oidc) - `ProviderProfileDetails` and provider config types.
- [`@owlmeans/mongo-resource`](../mongo-resource) - Mongo-backed resource implementation.

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
