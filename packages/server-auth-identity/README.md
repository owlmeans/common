# @owlmeans/server-auth-identity

The Mongo-backed local identity store behind provider logins. An application uses it when it owns
its users and organizations: a Google, OIDC, email-OTP or supervisor login is mapped onto one local
account, profile and credential, and the organization entity registry turns the slug on a token into
a stable entity id. It is not used where identity and authorization are delegated to an external IAM
whose grants decide access (use `@owlmeans/server-oidc-rp`'s guard and gate, or
`@owlmeans/server-iam`), and it does not verify bearer tokens (that is `@owlmeans/server-auth`).

## Installation

```bash
bun add @owlmeans/server-auth-identity@^0.1.18-rc.30
```

## Concepts

- **Organization entity (`OrgEntity`)** — the customer organization: `id` (stable `entityId`,
  never on the wire), `slug` (renameable `entitySlug`, the only value a token carries),
  `formerSlugs` that keep resolving after a rename, a frozen `iamKey`, and `names` minted once for
  systems that cannot be renamed.
- **Account (`IdentityAccount`)** — one per person, matched on a verified email `name`.
- **Profile (`IdentityProfile`)** — one person inside one organization entity, with `role`,
  `scopes` and optional `expiresAt`. The durable authorization record.
- **Credentials (`IdentityCredentials`)** — one provider link per profile, keyed by
  `"{type}:{service}:{providerSub}"`.
- **Linking service** — `IdentityLinkingService` finds or creates the local identity for provider
  profile details and returns an `AuthPayload`.
- **Entity resolver** — the `EntityResolverService` registered under `ENTITY_RESOLVER`. Registering
  it tells the server boundary that this deployment has organizations.
- **Identity events** — `identityEvents(ctx)` returns the `IdentityEventsService`; its
  `onEntityCreated` listeners run once per newly registered organization entity.

## Usage

### Register in a context

Register after the Mongo service and `appendAuthService`. A dedicated db config under
`AUTH_IDENTITY_DB_ALIAS` scopes a collection prefix to the identity collections only.

```ts
// config.ts
import { AUTH_IDENTITY_DB_ALIAS, AUTH_IDENTITY_LINKING } from '@owlmeans/server-auth-identity'

cfg.dbs.push({
  alias: AUTH_IDENTITY_DB_ALIAS,
  service: MONGO_SERVICE,
  host: process.env.MONGO_HOST!,
  schema: 'my-app',
  secret: process.env.MONGO_SECRET!,
  resourcePrefix: 'my-app-', // -> my-app-account, my-app-profile, ...
})

// let the OIDC relying party link provider logins through this store
cfg.oidc.accountLinkingService = AUTH_IDENTITY_LINKING
```

```ts
// context.ts
import { appendAuthService } from '@owlmeans/server-auth'
import { appendAuthIdentityResources, AUTH_IDENTITY_DB_ALIAS } from '@owlmeans/server-auth-identity'

appendMongo<C, T>(context)
appendAuthService<C, T>(context)
appendAuthIdentityResources(context, AUTH_IDENTITY_DB_ALIAS)
context.registerService(makeMyAppGate())
```

### A product gate over profile scopes

```ts
import { createLazyService } from '@owlmeans/context'
import type { GateService } from '@owlmeans/entrypoint'
import { AuthForbidden } from '@owlmeans/auth'
import { entityKeyOf } from '@owlmeans/auth-common'
import { AUTH_IDENTITY_PROFILE } from '@owlmeans/server-auth-identity'
import type { IdentityProfileResource } from '@owlmeans/server-auth-identity'

export const makeMyAppGate = (alias: string = MY_APP_GATE): GateService => {
  const service: GateService = createLazyService<GateService>(alias, {
    assert: async (req, _, params) => {
      await service.ready()
      const ctx = service.assertCtx<Config, Context>()

      const entityId = entityKeyOf(req)
      if (req.auth == null || entityId == null) {
        throw new AuthForbidden('auth')
      }

      const profile = await ctx.resource<IdentityProfileResource>(AUTH_IDENTITY_PROFILE)
        .load({ entityId, profileId: req.auth.profileId })
      if (profile == null || (profile.expiresAt != null && new Date(profile.expiresAt) < new Date())) {
        throw new AuthForbidden('profile')
      }

      const scopes = req.auth.scopes ?? []
      const required = params.map(param => param.replace(/\{entity\}/g, entityId))
      if (!required.every(scope => scopes.includes('*') || scopes.includes(scope))) {
        throw new AuthForbidden('permission')
      }
    },
  })

  return service
}
```

A protocol uses it with `{ guards: DEFAULT_GUARD, gate: { alias: MY_APP_GATE, params: ['my-app-project-{entity}'] } }`.

### Read an organization's members

```ts
import { handlers } from '@owlmeans/server-app'
import { requireEntityKey } from '@owlmeans/auth-common'
import { AUTH_IDENTITY_PROFILE } from '@owlmeans/server-auth-identity'
import type { IdentityProfileResource } from '@owlmeans/server-auth-identity'

const api = handlers<Context>()

export const members = api.request(memberProtocols.list, async (request, context) => {
  const { items } = await context.resource<IdentityProfileResource>(AUTH_IDENTITY_PROFILE)
    .list({ entityId: requireEntityKey(request) }, { sort: [{ field: 'createdAt', order: 'desc' }] })

  return items.map(({ profileId, role, name }) => ({ profileId, role, name }))
})
```

### Link a provider login

```ts
import { AUTH_IDENTITY_LINKING } from '@owlmeans/server-auth-identity'
import type { IdentityLinkingService } from '@owlmeans/server-auth-identity'

const linking = context.service<IdentityLinkingService>(AUTH_IDENTITY_LINKING)

const details = {
  type: 'google-oauth', // the AuthenticationType
  service: 'google',    // the provider service alias
  clientId: 'google',   // the provider client this login came through
  userId: providerSub,  // the provider's subject claim
}

// Returning login: find the credential, then its profile.
let payload = await linking.getLinkedProfile(details)
// First login by this method: link it to the person's identity, registering one if new.
payload ??= await linking.linkProfile(details, { username: 'person@example.org' })
// payload: { type, role, userId, profileId, entitySlug, scopes }
```

### Provision when an organization is created

```ts
import { identityEvents } from '@owlmeans/server-auth-identity'

// in makeContext, after appendAuthIdentityResources
identityEvents(context)?.onEntityCreated(async (event, ctx) => {
  await ctx.service<PlanService>(PLAN_SERVICE).grantStarterPlan(event.entityId)
})
```

The event carries `entityId`, `entitySlug`, `iamKey`, `accountId`, `profileId`, `username`, the
login `type` and `service`, and `createdAt`. It fires only when `linkProfile` registers a new
identity (including `force: true`) — never when a second sign-in method links to an identity that
exists. Listeners run in order and are awaited; one that throws is logged and never fails the
sign-in, so anything a listener provisions needs its own backfill.

### Rename an organization and mint a durable name

```ts
import { ENTITY_RESOLVER, requireEntityKey } from '@owlmeans/auth-common'
import type { EntityResolverService } from '@owlmeans/auth-common'

export const rename = api.body(organizationProtocols.rename, async ({ slug }, context, request) => {
  const resolver = context.service<EntityResolverService>(ENTITY_RESOLVER)
  const entity = await resolver.rename(requireEntityKey(request), slug) // old slug moves to formerSlugs

  return { slug: entity.slug }
})

// read once, or mint and persist on first ask; later renames leave it alone
const namespace = await resolver.mintName(entityId, 'namespace', entity => `my-app-${entity.iamKey}`)
```

## API

### Functions

| Symbol | Kind | Purpose |
|---|---|---|
| `appendAuthIdentityResources(context, dbAlias?)` | function | Register the four resources, the linking service, the entity resolver and (unless one is registered) the identity-events service |
| `makeOrgEntityResource(dbAlias?)` | function | Mongo resource for `OrgEntity` |
| `makeIdentityAccountResource(dbAlias?)` | function | Mongo resource for `IdentityAccount` |
| `makeIdentityProfileResource(dbAlias?)` | function | Mongo resource for `IdentityProfile` |
| `makeIdentityCredentialsResource(dbAlias?)` | function | Mongo resource for `IdentityCredentials` |
| `makeIdentityLinkingService()` | function | The `IdentityLinkingService` implementation |
| `makeEntityResolverService(alias = ENTITY_RESOLVER)` | function | The `EntityResolverService` implementation, cached 30 s per resolved name |
| `makeIdentityEventsService(alias = AUTH_IDENTITY_EVENTS)` | function | The `IdentityEventsService` implementation (lazy) |
| `identityEvents(ctx, alias?)` | function | The registered events service, or `null` |

### Constants

| Symbol | Kind | Purpose |
|---|---|---|
| `AUTH_IDENTITY_ORG_ENTITY`, `AUTH_IDENTITY_ACCOUNT`, `AUTH_IDENTITY_PROFILE`, `AUTH_IDENTITY_CREDENTIALS` | const | Resource aliases (`'auth-identity:…'`), lookup keys only |
| `AUTH_IDENTITY_LINKING` | const | `'auth-identity:linking'` — linking service alias |
| `AUTH_IDENTITY_EVENTS` | const | `'auth-identity:events'` — identity-events service alias |
| `AUTH_IDENTITY_DB_ALIAS` | const | `'auth-identity'` — suggested db config alias |
| `AUTH_IDENTITY_ORG_ENTITY_COLLECTION`, `AUTH_IDENTITY_ACCOUNT_COLLECTION`, `AUTH_IDENTITY_PROFILE_COLLECTION`, `AUTH_IDENTITY_CREDENTIALS_COLLECTION` | const | Colon-free Mongo collection base names |
| `MAX_ENTITY_SLUG_ATTEMPTS` | const | `8` — word slugs tried before minting gives up |
| `LOGIN_SERVICE_PREFIX`, `EXTERNAL_KEY_DELIMITER` | const | `'service'` and `':'` — the derived-key grammar |

### Types

| Symbol | Kind | Purpose |
|---|---|---|
| `OrgEntity` | type | `id`, `slug`, `formerSlugs?`, `iamKey`, `names?`, `createdAt`, `updatedAt?` |
| `IdentityAccount` | type | `Profile` without `entitySlug`, plus `id`, `credential`, `entityId?` |
| `IdentityProfile` | type | `Profile` without `entitySlug`, plus `id`, `profileId`, `userId?`, `role`, `entityId?`, `expiresAt?` |
| `IdentityCredentials` | type | `AuthCredentials` + `profileId` |
| `IdentityLinkingService` | type | `getLinkedProfile`, `linkProfile`, `linkCredentials`, `unlinkCredentials`, `getOwnerProfiles`, `getOwnerCredentials` |
| `AccountMeta` | type | `{ username, force? }` |
| `IdentityEventsService` | type | `onEntityCreated(callback)`, `propagateEntityCreated(event)` |
| `EntityCreatedEvent`, `EntityCreatedCallback` | type | The entity-created payload; `(event, ctx) => Promise<void>` |
| `OrgEntityResource`, `IdentityAccountResource`, `IdentityProfileResource`, `IdentityCredentialsResource` | type | Typed `MongoResource` aliases |
| `IdentityConfig`, `IdentityContext` | type | Server config and context shapes |
| `GoogleUserInfo` | type | Google userinfo claims |
| `EmailIdentityArgs`, `EmailIdentityPayload`, `IdentityIamExtension` | type | Declaration-only seam; nothing in the package consumes them |

## Key derivation

- Account `credential` — a unique 16-character Base58 slug.
- Account / profile `entityId` — the `OrgEntity` id; a first registration creates the entity first.
- Profile `userId` — the account's Mongo id, a declared ObjectId reference.
- Profile `profileId` — `"{type}:{accountId}"`.
- Credentials `userId` — `"{type}:{service}:{providerSub}"`; unrelated to the profile's `userId`.
- Credentials / profile `credential` — `"service:{type}:{service}"`; only platform logins carry it.

## Common pitfalls

- `Resource.take()` deletes the record it returns. Use `load(where)` or `list(where)` in gates and
  handlers, never `take()`.
- Query profiles and organization records by `entityId` from `requireEntityKey(request)` /
  `entityKeyOf(request)`, never by the slug.
- Without the resolver `request.entity` stays undefined and consumers fall back to the slug — call
  `appendAuthIdentityResources` (or register the resolver) in every service that serves organization
  data.
- First-login profiles get `ALL_SCOPES` and `AuthRole.User`; narrow scopes where finer authorization
  is needed.
- `linkProfile(details, { username, force: true })` always registers a new identity — use it only
  when a separate identity is intended.
- Provisioning in an `onEntityCreated` listener is best-effort: a throwing listener is logged and the
  sign-in succeeds, so reconcile what it provisions periodically.
- The resolver caches for 30 seconds, so a rename reaches other replicas within that window; the old
  slug keeps resolving meanwhile.
- `rename` rejects a malformed slug and any slug an entity has ever answered to; `mintSlug` throws
  `entity:slug-exhausted` after `MAX_ENTITY_SLUG_ATTEMPTS`.

## Related packages

- [`@owlmeans/server-auth`](../server-auth) — bearer verification; canonicalizes the slug through the resolver
- [`@owlmeans/auth-common`](../auth-common) — `EntityResolverService`, `ENTITY_RESOLVER`, `requireEntityKey`, `attachEntity`
- [`@owlmeans/auth`](../auth) — `AuthPayload`, `AuthRole`, `Profile`, errors
- [`@owlmeans/server-oidc-rp`](../server-oidc-rp) — calls the linking service during an OAuth callback
- [`@owlmeans/server-auth-otp`](../server-auth-otp) — email OTP plugin resolving users through the linking service
- [`@owlmeans/oidc`](../oidc) — `ProviderProfileDetails`
- [`@owlmeans/mongo-resource`](../mongo-resource) — the Mongo resource implementation

<!-- owlmeans:agent-guidance:start -->
## Agent guidance

This package ships embedded agent skills under `agent-meta/`. After installing your
`@owlmeans/*` packages, run the OwlMeans agent-skills installer to place them into
your project's skill store (`.agents/skills/`):

```sh
npx @owlmeans/agent-skills@^0.1.18-rc.30
```

The embedded files are version-matched to this package release. Do not edit them
directly — they are regenerated on each publish. To contribute guidance edits,
open a PR against the source monorepo.
<!-- owlmeans:agent-guidance:end -->
