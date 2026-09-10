---
name: server-auth-identity
description: How to use @owlmeans/server-auth-identity — the Mongo-backed local identity store behind provider logins. Registers the organization-entity registry plus account, profile and credentials resources, the IdentityLinkingService that maps an external provider account onto one local identity, and the EntityResolverService that turns the slug on a token into a stable entity id. Auto-invoked when importing appendAuthIdentityResources, an identity resource alias, IdentityLinkingService or the entity resolver.
user-invocable: false
---
<!-- AUTO-GENERATED — do not edit. Regenerate via sync-agent-meta. -->

# @owlmeans/server-auth-identity

**Layer:** Server
**Install:** `"@owlmeans/server-auth-identity": "^0.1.18-rc.13"` in `dependencies`

The local identity store a deployment owns when it does not delegate identity to an external IAM.
It answers two questions: *who is this person here* (account / profile / credentials) and *which
organization entity is this* (the org-entity registry and its resolver).

## Key Exports

| Export | Description |
|--------|-------------|
| `appendAuthIdentityResources(context, dbAlias?)` | Register the four resources, the linking service and the entity resolver in one call |
| `makeOrgEntityResource(dbAlias?)` | Mongo resource for `OrgEntity` — the organization-entity registry |
| `makeIdentityAccountResource(dbAlias?)` | Mongo resource for `IdentityAccount` (one per person) |
| `makeIdentityProfileResource(dbAlias?)` | Mongo resource for `IdentityProfile` (one person inside one organization entity, with a role) |
| `makeIdentityCredentialsResource(dbAlias?)` | Mongo resource for `IdentityCredentials` (one provider link per profile) |
| `makeIdentityLinkingService()` | The `IdentityLinkingService` implementation |
| `makeEntityResolverService(alias?)` | The `EntityResolverService` implementation, cached for 30 s per resolved value |
| `AUTH_IDENTITY_ORG_ENTITY` | Resource alias `'auth-identity:org-entity'` |
| `AUTH_IDENTITY_ACCOUNT` | Resource alias `'auth-identity:account'` |
| `AUTH_IDENTITY_PROFILE` | Resource alias `'auth-identity:profile'` |
| `AUTH_IDENTITY_CREDENTIALS` | Resource alias `'auth-identity:credentials'` |
| `AUTH_IDENTITY_LINKING` | Service alias `'auth-identity:linking'` |
| `AUTH_IDENTITY_DB_ALIAS` | `'auth-identity'` — the suggested db-config alias whose `resourcePrefix` scopes the prefix to identity collections only |
| `AUTH_IDENTITY_ORG_ENTITY_COLLECTION`, `AUTH_IDENTITY_ACCOUNT_COLLECTION`, `AUTH_IDENTITY_PROFILE_COLLECTION`, `AUTH_IDENTITY_CREDENTIALS_COLLECTION` | Colon-free Mongo collection base names (`org-entity`, `account`, `profile`, `credentials`) |
| `MAX_ENTITY_SLUG_ATTEMPTS` | How many word slugs to try before giving up minting a free one |
| `LOGIN_SERVICE_PREFIX`, `EXTERNAL_KEY_DELIMITER` | `'service'` and `':'` — the grammar of every derived key below |

The resource **aliases** keep their colon-delimited form and are lookup keys only; the Mongo
collection names are the colon-free `*_COLLECTION` values, optionally prefixed by the db config's
`resourcePrefix`.

## Types

| Type | Description |
|------|-------------|
| `OrgEntity` | `id`, `slug`, `formerSlugs?`, `iamKey`, `names?`, `createdAt`, `updatedAt?` |
| `IdentityAccount` | `Profile` without `entitySlug`, plus `id`, `credential`, `entityId?` |
| `IdentityProfile` | `Profile` without `entitySlug`, plus `id`, `profileId`, `userId?`, `role`, `entityId?`, `expiresAt?` |
| `IdentityCredentials` | `AuthCredentials` + `profileId` |
| `IdentityLinkingService` | `getLinkedProfile`, `linkProfile`, `linkCredentials`, `getOwnerProfiles`, `getOwnerCredentials` |
| `AccountMeta` | `{ username, force? }` — the second argument to `linkProfile` |
| `OrgEntityResource`, `IdentityAccountResource`, `IdentityProfileResource`, `IdentityCredentialsResource` | Typed `MongoResource` aliases |
| `IdentityConfig`, `IdentityContext` | Server config/context shapes |
| `GoogleUserInfo` | The Google userinfo claim set |
| `EmailIdentityArgs`, `EmailIdentityPayload`, `IdentityIamExtension` | Declaration-only seam for an IAM-backed email find-or-create |

The three `*Identity*` seam types are declarations and nothing more: no function in this
package accepts or returns them, and no consumer imports them. An email login is wired through
`IdentityLinkingService.getLinkedProfile` / `linkProfile`, which is what the OTP plugin does.

## The organization entity

The customer organization is an **organization entity**, and this package is the registry that owns
it. Two values name one organization and they never substitute for each other:

- **`entityId`** — `OrgEntity.id`. Stable, never on the wire. Every account, profile and
  organization-scoped record keys on it.
- **`entitySlug`** — `OrgEntity.slug`. Renameable, human-readable, and the only organization value
  an auth payload carries. Every `AuthPayload` this service returns carries `entitySlug`, resolved
  from the stored `entityId`; an id that no longer resolves yields `undefined` rather than leaking a
  raw id where a consumer would read it as a slug.

A rename is one write to `OrgEntity`, because nothing else stores the slug. The retired name moves
into `formerSlugs` and keeps resolving, so tokens minted before the rename and third-party records
still quoting the old value keep working.

`iamKey` is frozen at creation and never recomputed. It is what systems that cannot be renamed —
an IAM realm, a namespace, a storage prefix — are told once; `mintName(id, key, mint)` is the
read-before-mint that freezes such a derived name into `OrgEntity.names`.

Registering the resolver is also the signal that this deployment **has** organizations: without it
`request.entity` stays undefined and every consumer falls back to treating the token's slug as the
only entity value there is.

## Usage

### Register in a context

```typescript
import { appendAuthIdentityResources } from '@owlmeans/server-auth-identity'

// in makeContext, after the Mongo/Redis services and appendAuthService:
appendAuthIdentityResources(context)
```

### Read a profile (gate or handler)

```typescript
import { AUTH_IDENTITY_PROFILE } from '@owlmeans/server-auth-identity'
import type { IdentityProfileResource } from '@owlmeans/server-auth-identity'
import { requireEntityKey } from '@owlmeans/auth-common'

const profiles = ctx.resource<IdentityProfileResource>(AUTH_IDENTITY_PROFILE)
const entityId = requireEntityKey(req)

const profile = await profiles.load({ entityId, profileId })
const { items } = await profiles.list({ entityId }, { sort: [{ field: 'createdAt', order: 'desc' }] })
```

Query profiles by `entityId`, never by the slug — `requireEntityKey` hands you the resolved id.

### Link a provider account to a local identity

```typescript
import { AUTH_IDENTITY_LINKING } from '@owlmeans/server-auth-identity'
import type { IdentityLinkingService } from '@owlmeans/server-auth-identity'

const linking = ctx.service<IdentityLinkingService>(AUTH_IDENTITY_LINKING)

const details = {
  type: 'google-oauth',   // the AuthenticationType
  service: 'google',      // the provider service alias
  clientId: 'google',     // the provider client this login came through
  userId: providerSub,    // the provider's subject claim
}

// Returning login: find the credential, then its profile.
let payload = await linking.getLinkedProfile(details)
// First login by this method: link it to the person's identity, registering one if new.
payload ??= await linking.linkProfile(details, { username: 'person@example.org' })
```

Both return an `AuthPayload` — `{ type, role, userId, profileId, entitySlug, scopes }`.

`linkCredentials(details)` adds a credential row to an already-linked profile named by
`details.profileId`. `getOwnerProfiles(entityId)` lists an organization's profiles;
`getOwnerCredentials(userId, entityId?, type?)` returns one profile's credential as an
`AuthCredentials`.

## One person, one platform identity

`linkProfile` **links** a person the platform already knows and registers only a genuinely new one.
It matches on the account's `name`, which every shipped provider establishes as a verified email
before it gets here (Google asserts the address, OTP proves possession of it, the supervisor key is
a full-trust developer credential). A second sign-in method therefore adds a second **credential**
to one profile — never a second account, profile or organization entity.

Two rows can legitimately carry one address, and only one of them is a platform login: an
organization's invited **end user** is a person-shaped row for the generated application to
authenticate, deliberately separate from the platform credential. They are told apart by the
profile's `credential`: this service is the only writer of `"service:{type}:{service}"`, so a
profile carrying one is a platform login and a profile carrying none is somebody's end user.

`linkProfile(details, { username, force: true })` skips the lookup and registers a fresh identity
regardless. Use it only where a genuinely separate identity is intended.

## Key derivation conventions

- **Account `credential`** — a unique 16-character Base58 slug, the account's own stable key.
  Generation retries up to five times on a duplicate-key collision; that is the designed behaviour
  for the slug space, not an error path.
- **Account / profile `entityId`** — the `OrgEntity` record id. Every first registration creates the
  entity record **first**, because it owns the id everything else is keyed by and the frozen
  `iamKey`.
- **Profile `userId`** — the account's Mongo id, and a **declared ObjectId reference**
  (`resource.reference('userId', AUTH_IDENTITY_ACCOUNT)`): stored as `ObjectId`, exchanged as a
  string, auto-indexed and auto-migrated at boot. The only reference in the set.
- **Profile `profileId`** — `"{type}:{accountId}"`. A composite key, stable across provider
  re-links, and NOT a reference.
- **Credentials `userId`** (external key) — `"{type}:{service}:{providerSub}"`. Same field name as
  `profile.userId`, entirely different meaning; never compare or convert across the two.
- **Credentials / profile `credential`** (login-service key) — `"service:{type}:{service}"`.

`AuthPayload.userId` is emitted as `profile.userId ?? profile.profileId`, so a value coming back
into a `userId` query may be a composite key. The reference conversion tolerates it by matching
nothing.

## Resource indexes

| Resource | Index | Fields | Notes |
|----------|-------|--------|-------|
| OrgEntity | `slug` | `{ slug: 1 }` | unique — the only thing between two organizations and one public name |
| OrgEntity | `iamKey` | `{ iamKey: 1 }` | unique — a duplicate would hand one organization another's realm |
| OrgEntity | `formerSlugs` | `{ formerSlugs: 1 }` | not unique; a retired slug must stay findable |
| Account | `credential` | `{ credential: 1 }` | unique |
| Account | `entityId` | `{ entityId: 1 }` | |
| Account | `secret` | `{ secret: 1 }` | unique, sparse |
| Account | `name` | `{ name: 1 }` | not unique — one address is legitimately both a platform account and an end-user row |
| Profile | `userId` | `{ userId: 1 }` | |
| Profile | `entityId` | `{ entityId: 1 }` | |
| Profile | `role` | `{ role: 1, entityId: 1 }` | |
| Profile | `profile` | `{ profileId: 1, entityId: 1 }` | unique |
| Credentials | `provider` | `{ type: 1, userId: 1, credential: 1 }` | unique |
| Credentials | `profileId` | `{ profileId: 1 }` | |

## Gotchas

- **`Resource.take()` is destructive** — it deletes the record it returns. Identity lookups in gates
  and handlers use `load(where)`, which answers a multi-field query in one call
  (`load({ type, userId, credential })`), or `list(where, opts)` for every match. Never `take()` in
  an authorization check.
- **`IdentityLinkingService` is compatible with `AccountLinkingService`** from
  `@owlmeans/server-oidc-rp` but declared independently, to keep the dependency acyclic. Both return
  `AuthPayload`.
- First-login profiles are created with `ALL_SCOPES` and `AuthRole.User` — the gate layer starts
  permissive within one organization entity. Narrow the scopes where finer authorization is needed.
- `mintSlug` throws `SyntaxError('entity:slug-exhausted')` after `MAX_ENTITY_SLUG_ATTEMPTS` word
  bases (three numeric suffixes each). `rename` throws `entity:slug-malformed:<slug>` against
  `ENTITY_SLUG_PATTERN` and `entity:slug-taken:<slug>` for a name any entity has ever answered to.
- The resolver caches every name a hit was found under — id, slug, former slug, `iamKey` — for 30
  seconds. A rename is therefore visible to other replicas within that window, which is survivable
  precisely because the old slug keeps resolving.

## Relationship to other auth packages

- **`@owlmeans/server-auth`** — verifies the bearer token and canonicalizes the slug on the
  credential through this package's resolver. This package is the store underneath.
- **`@owlmeans/auth-common`** — declares `EntityResolverService` (implemented here),
  `ENTITY_RESOLVER` and `OrgEntityRef`, and carries the `entityKeyOf` / `requireEntityKey` /
  `attachEntity` helpers that read what this package resolves.
- **`@owlmeans/server-oidc-rp`** — the relying party that calls the linking service during an OAuth
  callback.
- **`@owlmeans/server-auth-otp`** — the email-OTP plugin resolves its user through the linking
  service.
- **`@owlmeans/oidc`** — supplies `ProviderProfileDetails` and `OidcProviderDescriptor`.

## Depends On

- `@owlmeans/auth` — `AuthPayload`, `AuthRole`, `ALL_SCOPES`, `Profile`, `AuthCredentials`
- `@owlmeans/auth-common` — `EntityResolverService`, `ENTITY_RESOLVER`, `ENTITY_SLUG_PATTERN`
- `@owlmeans/basic-ids` — `createIdOfLength`, `IdStyle`, `generateWordSlug`, `nextSlugCandidate`
- `@owlmeans/mongo-resource` — `makeMongoResource`, declared references and indexes
- `@owlmeans/context`, `@owlmeans/resource`, `@owlmeans/oidc`, `@owlmeans/server-context`
- `mongodb` (peer) — the driver behind the Mongo resources this package registers
