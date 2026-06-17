---
description: "How to use @owlmeans/server-auth-identity — Mongo-backed local identity resources (account, profile, credentials) and IdentityLinkingService for provider account linking. Use when importing appendAuthIdentityResources, makeIdentityLinkingService, or identity resource aliases."
applyTo: "**/context.ts, **/services/**/*.ts, **/*.ts, **/*.tsx"
---
<!-- AUTO-GENERATED — do not edit. Regenerate via sync-agent-meta. -->

# @owlmeans/server-auth-identity

**Layer:** Server
**Install:** `"@owlmeans/server-auth-identity": "^0.1.10"` in `dependencies`

## Key Exports

| Export | Description |
|--------|-------------|
| `appendAuthIdentityResources(context, dbAlias?)` | Register all three identity resources + linking service on a context |
| `makeIdentityAccountResource(dbAlias?)` | Mongo resource for `IdentityAccount` (one per user) |
| `makeIdentityProfileResource(dbAlias?)` | Mongo resource for `IdentityProfile` (ties user to entity + role) |
| `makeIdentityCredentialsResource(dbAlias?)` | Mongo resource for `IdentityCredentials` (provider link per profile) |
| `makeIdentityLinkingService()` | Service implementing `IdentityLinkingService` — links external providers to local profiles |
| `AUTH_IDENTITY_ACCOUNT` | Resource alias `'auth-identity:account'` |
| `AUTH_IDENTITY_PROFILE` | Resource alias `'auth-identity:profile'` |
| `AUTH_IDENTITY_CREDENTIALS` | Resource alias `'auth-identity:credentials'` |
| `AUTH_IDENTITY_LINKING` | Service alias `'auth-identity:linking'` |

## Types

| Type | Description |
|------|-------------|
| `IdentityAccount` | `Profile & ResourceRecord` — `id`, `credential` (unique entity slug) |
| `IdentityProfile` | `Profile & ResourceRecord` — `id`, `profileId`, `userId?`, `role`, `entityId`, `scopes`, `expiresAt?` |
| `IdentityCredentials` | `AuthCredentials & ResourceRecord` — `profileId`, `type`, `userId` (external key), `credential` (login-service key) |
| `IdentityLinkingService` | `getLinkedProfile`, `linkProfile`, `linkCredentials`, `getOwnerProfiles`, `getOwnerCredentials` |
| `IdentityAccountResource` | `MongoResource<IdentityAccount>` |
| `IdentityProfileResource` | `MongoResource<IdentityProfile>` |
| `IdentityCredentialsResource` | `MongoResource<IdentityCredentials>` |

## Usage

### Register in context

```typescript
import { appendAuthIdentityResources } from '@owlmeans/server-auth-identity'

// After appendMongo, appendRedis, appendAuthService:
appendAuthIdentityResources(context)
```

### Read a profile (gate / handler)

```typescript
import { AUTH_IDENTITY_PROFILE } from '@owlmeans/server-auth-identity'
import type { IdentityProfileResource } from '@owlmeans/server-auth-identity'

const profileRes = ctx.resource<IdentityProfileResource>(AUTH_IDENTITY_PROFILE)

// Single-field indexed lookup (read-only):
const profile = await profileRes.load(profileId, 'profileId')

// Multi-field criteria lookup (read-only):
const { items } = await profileRes.list({ entityId, profileId } as any)
const profile = items[0] ?? null
```

### Link an external provider to a local profile

```typescript
import { AUTH_IDENTITY_LINKING } from '@owlmeans/server-auth-identity'
import type { IdentityLinkingService } from '@owlmeans/server-auth-identity'

const linking = ctx.service<IdentityLinkingService>(AUTH_IDENTITY_LINKING)
const payload = await linking.linkProfile(providerDetails, { username })
// Returns AuthPayload with type, role, userId, profileId, entityId, scopes
```

## Key Derivation Conventions

- **Account credential**: unique Base58 slug (16 chars) — serves as the local `entityId`
- **Profile profileId**: `"{type}:{accountId}"` — stable across provider re-links
- **Credentials userId** (external key): `"{type}:{service}:{providerSub}"` — uniquely identifies the external account
- **Credentials credential** (login-service key): `"service:{type}:{service}"` — groups credentials by provider

## Resource Indexes

| Resource | Index | Fields | Notes |
|----------|-------|--------|-------|
| Account | `credential` | `{ credential: 1 }` | unique |
| Account | `entityId` | `{ entityId: 1 }` | |
| Account | `secret` | `{ secret: 1 }` | unique, sparse |
| Profile | `userId` | `{ userId: 1 }` | |
| Profile | `entityId` | `{ entityId: 1 }` | |
| Profile | `role` | `{ role: 1, entityId: 1 }` | |
| Profile | `profile` | `{ profileId: 1, entityId: 1 }` | unique |
| Credentials | `provider` | `{ type: 1, userId: 1, credential: 1 }` | unique |
| Credentials | `profileId` | `{ profileId: 1 }` | |

## Important Gotchas

- **`Resource.pick()` is destructive** — it deletes the record. For read-only identity lookups, use `load(id, field)` for single-field indexed queries or `list(criteria)` for multi-field queries. Never use `pick()` in a gate or authorization check.
- **`IdentityLinkingService` is compatible with `AccountLinkingService`** from `@owlmeans/server-oidc-rp` but defined independently to avoid circular dependency. Both return `AuthPayload`.
- First-login profiles are created with `ALL_SCOPES` and `AuthRole.User` — the gate layer is initially permissive per entity.

## Product-Viable Usage Notes

- Register `appendAuthIdentityResources(context)` immediately after `appendAuthService(context)` so guards can authenticate before product gates authorize.
- Product gates should load `AUTH_IDENTITY_PROFILE` read-only, verify `entityId`, reject expired/blocked profiles, then compare gate params against profile scopes.
- Google login goes through OIDC provider config, but the durable authorization source is the local `IdentityProfile` record.
- Account `credential` is the public local entity slug. Keep it separate from Mongo account `id` and provider subject identifiers.

## Depends On

- `@owlmeans/auth` — `AuthPayload`, `AuthRole`, `ALL_SCOPES`
- `@owlmeans/basic-ids` — `createIdOfLength` for slug generation
- `@owlmeans/context` — `appendContextual`
- `@owlmeans/mongo-resource` — `makeMongoResource`
- `@owlmeans/oidc` — `ProviderProfileDetails`
- `@owlmeans/resource` — `ResourceRecord`
- `@owlmeans/server-context` — `ServerConfig`, `ServerContext`
