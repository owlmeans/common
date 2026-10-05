---
name: server-auth-identity
description: How to use @owlmeans/server-auth-identity — the Mongo-backed identity store shared by a deployment's own sign-in and the apps it hosts. One account per e-mail (every sign-in method a credential on it), a personal organization per account, profile rows per (account, app, organization) with a computed profileId, organization groups, the IdentityLinkingService for the deployment's own app, the ensureAccount / ensureProfile primitives, the EntityResolverService with field-level rename/mintName, and the identity-events seam (entity created, profile created). Auto-invoked when importing appendAuthIdentityResources, an identity resource alias, IdentityLinkingService, ensureAccount/ensureProfile/profileIdOf, the org group helpers, the entity resolver or identityEvents.
user-invocable: false
---

# @owlmeans/server-auth-identity

**Layer:** Server
**Install:** `"@owlmeans/server-auth-identity": "^0.1.18-rc.46"` in `dependencies`

The identity store a deployment owns when it does not delegate identity to an external IAM. It
answers *who is this person* (account + credentials), *what are they in this app and organization*
(profile rows) and *which organization is this* (the org-entity registry and its resolver). One store
serves the deployment's own app and every app it hosts (a platform's generated targets): a row's
`service` is the app it belongs to.

## Key Exports

| Export | Description |
|--------|-------------|
| `appendAuthIdentityResources(context, dbAlias?, { service? })` | Register the four resources, the linking service for app `service` (default `DEFAULT_APP_SERVICE`), the entity resolver and — unless one is already registered — the identity-events service |
| `profileIdOf(service, accountId)` | The computed profile id of an (account, app) — `"{service}:{22 Base58 chars of sha256}"` |
| `ensureAccount(ctx, { email, name? }, details?)` | The person's account: by the method's credential, then by e-mail, else registered with a personal organization; attaches `details` as a credential |
| `ensureProfile(ctx, { account, service, entityId, owner?, role?, scopes?, permissions?, groups?, managed? })` | Find-or-create the row of (account, app, organization); ensures the primary row first |
| `credentialKeyOf(details)`, `credentialOf(ctx, details)`, `normalizeEmail(email)` | A method's unique credential key; its stored row and account; the stored address form |
| `listOrgGroups(ctx, entityId, service)`, `putOrgGroup(ctx, entityId, group)`, `removeOrgGroup(ctx, entityId, service, key)` | An organization's groups of one app — guarded field-level writes, unique per (`service`, `key`) |
| `makeOrgEntityResource`, `makeIdentityAccountResource`, `makeIdentityProfileResource`, `makeIdentityCredentialsResource` | Mongo resource makers (`dbAlias?`) |
| `makeIdentityLinkingService({ service? })` | The `IdentityLinkingService` for one app |
| `makeEntityResolverService(alias?)` | The `EntityResolverService`, cached 30 s per resolved value (slim references only) |
| `makeIdentityEventsService(alias?)`, `identityEvents(ctx, alias?)` | The lazy events service; the registered one or `null` |
| `AUTH_IDENTITY_ORG_ENTITY` / `_ACCOUNT` / `_PROFILE` / `_CREDENTIALS` | Resource aliases `'auth-identity:…'` (lookup keys, not collection names) |
| `AUTH_IDENTITY_LINKING`, `AUTH_IDENTITY_EVENTS` | Service aliases |
| `AUTH_IDENTITY_DB_ALIAS` | `'auth-identity'` — the suggested db-config alias whose `resourcePrefix` scopes the identity collections |
| `AUTH_IDENTITY_*_COLLECTION` | Colon-free collection base names (`org-entity`, `account`, `profile`, `credentials`) |
| `DEFAULT_APP_SERVICE` | `'app'` — the own app key when a deployment passes none |
| `MAX_ENTITY_SLUG_ATTEMPTS`, `MAX_ACCOUNT_KEY_ATTEMPTS`, `MAX_GUARDED_UPDATE_ATTEMPTS`, `PROFILE_DIGEST_LENGTH` | Retry bounds and the digest length |
| `LOGIN_SERVICE_PREFIX`, `EXTERNAL_KEY_DELIMITER` | `'service'` and `':'` — the credential-key grammar |

## Records

| Record | Fields | Rules |
|---|---|---|
| `IdentityAccount` | `credential` (random unique key), `email`, `name`, `entityId`, `scopes` | ONE per e-mail (unique index, trimmed lower-case). `entityId` = the main (personal) organization, a declared reference. `scopes` is never a wildcard |
| `IdentityCredentials` | `type`, `userId` = `"{type}:{service}:{providerSub}"`, `credential` = `"service:{type}:{service}"`, `accountId` | One row per sign-in method, unique on (`type`, `userId`, `credential`); `accountId` is a declared reference. `profileId?` is reserved, never written |
| `IdentityProfile` | `profileId`, `userId`, `service`, `entityId`, `owner?`, `role`, `scopes`, `permissions`, `groups?`, `home?`, `disabled?`, `managed?`, `name`, `createdAt` | One row per (account, app, organization): unique (`profileId`, `entityId`). `userId`, `entityId`, `home` are declared references. `scopes: ['*']` only on rows of a deployment's OWN app, `[]` on a hosted app's rows. `home` / `disabled` live on the PRIMARY row only |
| `OrgEntity` | `slug`, `formerSlugs`, `iamKey`, `title?`, `names`, `groups?`, `createdAt`, `updatedAt?` | `slug` and `iamKey` unique; `iamKey` frozen at birth. `groups` unique per (`service`, `key`) inside the organization |
| `OrgGroup` | `service`, `key`, `title?`, `managed?`, `permissions`, `bundles?` (`{ filter?, permissions? }`) | Members are the rows naming `key` in `groups`; one app never writes another app's group |

**The primary row** of an (account, app) is its row in the account's main organization. It exists
whenever any row of that pair does — `ensureProfile` creates it FIRST, as owner of the personal
organization — because it is what says whether the person may use the app at all.

**`profileId` is computed, never minted.** Two first sign-ins racing write the same key and the
unique index settles them; a caller holding the account and the app names the person without a
read; the account's record id never reaches the wire; two apps never share a subject. Nothing parses
it.

Declared references refuse a value that is not a 24-hex record id on write (`MisshapedRecord`), so
fixtures and callers use record ids, never slugs, in `entityId` / `userId` / `accountId` / `home`.

## The organization entity

- **`entityId`** — `OrgEntity.id`. Stable, never on the wire. Every account, row and
  organization-scoped record keys on it.
- **`entitySlug`** — `OrgEntity.slug`. Renameable, the only organization value a payload carries.
  Every `AuthPayload` here carries `entitySlug` resolved from the stored id; an id that no longer
  resolves yields `undefined` rather than a raw id on the wire.

A rename is one field-level write; the retired slug moves into `formerSlugs` and keeps resolving.
`iamKey` and `names` (minted once through `mintName`) are what systems that cannot rename are told.
Registering the resolver is the signal that the deployment HAS organizations: without it
`request.entity` stays undefined.

**Every writer of an org-entity document writes fields (`$set` / `$push` / `$pull` through the
resource's native `collection.updateOne`), never the whole document** — a replace from a stale read
erases the groups or names another writer added since. The resolver's `rename` is guarded on the slug
it read (`formerSlugs` moves only with it), `mintName` on the name still being unset (first minter
wins, both answer what was stored), `putOrgGroup` replaces the matching element (`groups.$`) or
pushes where none matches (`$not: { $elemMatch }`) and retries if a concurrent put won.

## Usage

### Register in a context

```typescript
import { appendAuthIdentityResources, AUTH_IDENTITY_DB_ALIAS } from '@owlmeans/server-auth-identity'

// in makeContext, after the Mongo/Redis services and appendAuthService:
appendAuthIdentityResources(context, AUTH_IDENTITY_DB_ALIAS, { service: MY_APP })
```

`service` is the deployment's own app key. A deployment sharing the store with hosted apps must pass
its own (the package default `'app'` is for a store with one app).

### Sign a provider login in (the deployment's own app)

```typescript
const linking = ctx.service<IdentityLinkingService>(AUTH_IDENTITY_LINKING)
const details = { type: 'google-oauth', service: 'google', clientId: 'google', userId: providerSub, username: displayName }

let payload = await linking.getLinkedProfile(details)
payload ??= await linking.linkProfile(details, { username: verifiedEmail })
// { type, role, userId: accountId, profileId, entitySlug, scopes }
```

- `getLinkedProfile` — credential → account → the own app's row in the main organization. A method
  that is linked but has no row of THIS app answers `null`, and the caller's `linkProfile` writes it.
- `linkProfile(details, { username })` — `ensureAccount` with `username` as the e-mail (the login
  must have verified it) and `details.username` as the display name, then `ensureProfile` for the own
  app in the main organization (`owner: true`, `scopes: ['*']`). A second method of a known person
  adds a credential; a person known from another app gets this app's row in their existing
  organization.
- `linkCredentials(details)` — attaches the method to the account of the row `details.profileId`
  names; refuses a method that already signs into another account.
- `unlinkCredentials(details)` — deletes the method's credential row; idempotent.
- `getOwnerProfiles(entityId)` — every own-app row of the organization (`{ size: 0 }`).
- `getOwnerCredentials(accountId, entityId?, type?)` — a credential of the account as its own-app row.

### Write rows for a hosted app

```typescript
import { ensureAccount, ensureProfile } from '@owlmeans/server-auth-identity'

const { account } = await ensureAccount(ctx, { email }, { type: 'email-otp', service: 'email', clientId, userId: email })
const row = await ensureProfile(ctx, { account, service: clientId, entityId: account.entityId, owner: true })
```

`ensureAccount` writes no row — which app a person is a user of is the caller's to say. Hosted-app
rows carry `scopes: []` (the default); never give them the own app's wildcard. `ensureProfile`
returns an existing row unchanged: it never rewrites owner, groups or grants.

### Read rows in a gate or handler

```typescript
const profile = await ctx.resource<IdentityProfileResource>(AUTH_IDENTITY_PROFILE)
  .load({ entityId: requireEntityKey(req), profileId: req.auth.profileId })
if (profile == null || profile.service !== MY_APP) throw new AuthForbidden('profile')
```

A gate of the deployment's own app must require its own `service`: the same organization holds
hosted apps' rows. Organization-wide reads pass `{ size: 0 }` — an omitted size is one page of 100.

## Identity events

```typescript
identityEvents(context)?.onProfileCreated(async (event, ctx) => {
  if (event.service === MY_APP) await provisionStarterPlan(ctx, event.entityId)
})
```

- **`onProfileCreated`** — `{ entityId, entitySlug, accountId, profileId, service, owner }`, fired
  by `ensureProfile` when the PRIMARY row of an (account, app) is created, by the create that won
  only. Once per (account, app); a further organization's row announces nothing. Key app-level
  provisioning here and filter on `service`.
- **`onEntityCreated`** — `EntityCreatedEvent` (`entityId`, `entitySlug`, `iamKey`, `accountId`,
  `profileId`, `username`, login `type`, provider `service`, the owner row's app as
  `profileService`, `createdAt`), fired by `linkProfile` when `ensureAccount` registered the person
  (`registered`), after the owner row exists. A caller registering through `ensureAccount` +
  `ensureProfile` itself announces with `propagateEntityCreated`.
- Listeners run in registration order, each awaited; a throwing listener is logged and never fails
  the sign-in, and the next one still runs — so whatever a listener provisions needs a periodic
  backfill. `identityEvents(ctx)` is `null` where the service is not registered.
- Key what a listener writes on `entityId`, never on `entitySlug`.

## Races, settled by unique indexes

| Race | Settled by | Outcome |
|---|---|---|
| Two first sign-ins of one address | `account.email` unique | Loser adopts the winner's account and deletes the organization it created |
| Random account key collision | `account.credential` unique | Retried (`MAX_ACCOUNT_KEY_ATTEMPTS`) |
| `mintSlug` read raced by another create | `org-entity.slug` unique | Organization create retried (`MAX_ENTITY_SLUG_ATTEMPTS`) |
| One method attached twice at once | credentials (`type`, `userId`, `credential`) unique | Duplicate ignored |
| One row created twice at once | profile (`profileId`, `entityId`) unique | Loser loads the winner's row; only the winner announces |

A credential row pointing at a deleted account is removed by `ensureAccount`, so the method can be
attached again.

## Resource indexes

| Resource | Index | Fields | Notes |
|----------|-------|--------|-------|
| OrgEntity | `slug` | `{ slug: 1 }` | unique |
| OrgEntity | `iamKey` | `{ iamKey: 1 }` | unique |
| OrgEntity | `formerSlugs` | `{ formerSlugs: 1 }` | not unique; checked on rename |
| Account | `credential` | `{ credential: 1 }` | unique |
| Account | `email` | `{ email: 1 }` | unique — one account per address |
| Account | `entityId` | `{ entityId: 1 }` | reference → org-entity |
| Account | `secret` | `{ secret: 1 }` | unique, sparse |
| Profile | `userId` | `{ userId: 1 }` | reference → account |
| Profile | `entityId` | `{ entityId: 1 }` | reference → org-entity |
| Profile | `role` | `{ role: 1, entityId: 1 }` | |
| Profile | `profile` | `{ profileId: 1, entityId: 1 }` | unique — (account, app, organization) |
| Profile | `service` | `{ service: 1, entityId: 1 }` | an app's rows of an organization |
| Credentials | `provider` | `{ type: 1, userId: 1, credential: 1 }` | unique |
| Credentials | `accountId` | `{ accountId: 1 }` | reference → account |

`home` is a reference without an index. Groups have no index: a multikey unique index would be unique
across organizations, not inside one.

## Gotchas

- **`Resource.take()` deletes** the record it returns — identity reads in gates use `load` / `list`.
- **Never `update()` an org-entity** (a whole-record replace); use the resolver, the group helpers or
  a guarded `collection.updateOne`.
- **`IdentityLinkingService` is compatible with `AccountLinkingService`** of
  `@owlmeans/server-oidc-rp` but declared independently (acyclic dependencies).
- **The address is the identity.** Whoever calls `ensureAccount` / `linkProfile` with an address is
  handed that person's account, so every caller must have verified it (a verified provider claim, a
  proven code, a full-trust key).
- `mintSlug` throws `entity:slug-exhausted`; `rename` throws `entity:slug-malformed:<slug>`,
  `entity:slug-taken:<slug>` (a name any entity has ever answered to, or a unique-index race) and
  `entity:rename-contended:<id>`; `mintName` refuses an empty, dotted or `$` key
  (`entity:name-key-malformed:<key>`); `putOrgGroup` throws `UnknownRecordError` for a missing
  organization.
- The resolver caches every name a hit was found under for 30 s (`OrgEntityRef` only); a rename is
  visible to other replicas within that window, survivable because the old slug keeps resolving.

## Relationship to other auth packages

- **`@owlmeans/server-auth`** — verifies the bearer token; re-reads the row through this package.
- **`@owlmeans/auth-common`** — declares `EntityResolverService`, `ENTITY_RESOLVER`, `OrgEntityRef`
  and the `entityKeyOf` / `requireEntityKey` / `attachEntity` helpers.
- **`@owlmeans/server-oidc-rp`** — the relying party that calls the linking service on a callback.
- **`@owlmeans/server-auth-otp`** — the e-mail-OTP plugin resolves its user through a linking service.
- **`@owlmeans/iam-integrated`** — the IAM over the same store: hosted apps' rows, groups and grants.

## Depends On

- `@owlmeans/auth`, `@owlmeans/auth-common`, `@owlmeans/oidc`, `@owlmeans/context`,
  `@owlmeans/resource`, `@owlmeans/server-context`
- `@owlmeans/basic-ids` — random keys and word slugs; `@scure/base` + `node:crypto` — `profileIdOf`
- `@owlmeans/mongo-resource` — resources, declared references and indexes, `criteriaToFilter`
- `mongodb` (peer)
