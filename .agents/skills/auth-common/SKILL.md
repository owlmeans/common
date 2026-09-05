---
name: auth-common
description: How to use @owlmeans/auth-common — the auth vocabulary both sides of the wire share, covering guard aliases (DEFAULT_GUARD, GUARD_ED25519), the shared auth entrypoint list, the Ed25519 signature guard, the TRUSTED-record trust() helper, and the organization-entity resolver contract (ENTITY_RESOLVER, entityKeyOf, attachEntity). Auto-invoked when importing guard constants, the shared auth entrypoints, or entity-resolution helpers.
user-invocable: false
---

# @owlmeans/auth-common

**Layer:** Core
**Install:** `"@owlmeans/auth-common": "^0.1.18-rc.12"` in `dependencies`

Everything a server and a browser must agree on to talk authentication: aliases, the shared
entrypoint declarations, the signature guard, and the contract for resolving the organization
entity a token names.

## Key Exports

### Aliases and constants

| Export | Value / description |
|--------|---------------------|
| `DEF_AUTH_SRV` / `DEFAULT_GUARD` | `'auth'` — the canonical auth guard alias, the same string on both sides |
| `GUARD_ED25519` | `'guard:ed25519-basic-signature'` — the Ed25519 request-signature guard |
| `TOKEN_UPDATE` | `'auth-token-refresh'` |
| `WEB_API` | `'web-auth-api'` — service alias of the auth manager's web API |
| `DISPATCHER_PATH` / `SURROGATE_PATH` | `'/dispatcher'` / `'/surrogate'` — both reserved; an application must never declare its own route at either |
| `ENTITY_RESOLVER` | `'entity-resolver'` — the organization-entity resolver's service alias |
| `ENTITY_SLUG_PATTERN` | A lowercase DNS label. Slugs compose hostnames, cluster object names and OIDC client ids, so anything needing sanitising is rejected where it is chosen |
| `RELY_PIN_PERFIX`, `RELY_TOKEN_PREFIX`, `RELY_CALL_TIMEOUT`, `RELY_ACTION_TIMEOUT` | Rely-handshake constants |
| `BED255_TIME_HEADER`, `BED255_NONCE_HEADER`, `BED255_SIG_TTL`, `BED255_CASHE_RESOURCE` | Ed25519 signature-guard headers, replay window and nonce-cache alias |
| `authApi` | Alias tree for the manager API entrypoints (`profile`, `entity`, `auth`) |

### Entrypoints, guard and middleware

| Export | Description |
|--------|-------------|
| `entrypoints` | The shared auth entrypoint list — `AUTHEN*`, `CAUTHEN*`, `DISPATCHER`, `DISPATCHER_SURROGATE`, `DISPATCHER_AUTHEN`. Server and client packages elevate the entries they serve |
| `managerEntrypoints` | The auth-manager web API entrypoints (profile → entity slug, auth delegation) |
| `makeBasicEd25519Guard(resource, opts?)` | The `GUARD_ED25519` guard service: signs outgoing requests as a client, verifies time/nonce/signature as a server |
| `authMiddleware` | Loading-stage context middleware that attaches the guard's token to every guarded backend entrypoint's `invoke`/`call` |
| `SurrogateQuery`, `SurrogateQuerySchema` | The surrogate window's `intent` / `next` / `method` query |

### Types

| Type | Description |
|------|-------------|
| `AuthService` | `GuardService` + `authenticate(token)`, `update(token)`, `user()`, `store<T>()` — the client-side auth manager contract |
| `AuthorizationService` | `isAllowed(permissions, token?, thr?)`, `update(token?, thr?)` |
| `TrustedRecord` | A `ConfigRecord` carrying a known signing identity's `name`, `credential` (public key) and optional `secret` |
| `AuthRequest` | An `AbstractRequest` whose `query` is an `AuthToken` |
| `AuthUIParams` | `{ type? }` — the typed login route's params |
| `OrgEntityRef` | `{ id, slug, formerSlugs?, iamKey }` |
| `EntityResolverService` | `resolve`, `byId`, `mintSlug`, `rename`, `mintName` — see below |
| `ProfileToEntityIdRequest` / `ProfileToEntityIdResponse` | The manager API body/response that maps a `profileId` to an `entitySlug` |

### Subpath `./utils`

| Export | Description |
|--------|-------------|
| `trust(context, resource, userName, field = 'name')` | Load a `TrustedRecord` from a config resource and return `{ user, key }`, where `key` is a signing `KeyPairModel` when the record has a `secret` and a verify-only one otherwise |
| `extractAuthToken(req, type?, onlyValue?)` | Pull the `authorization` header, optionally requiring an `AuthroizationType` prefix |
| `Config`, `Context` | The minimal context shape `trust` needs |

## The organization entity

The customer organization is an **organization entity**. Two values name it and they are not
interchangeable:

- **`entitySlug`** — renameable, human-readable, and the only organization value on the wire. It is
  what a token, a URL, a query param and a form carry.
- **`entityId`** — the stable record id. It never travels; it is what database rows, permission
  grants and third-party records key on, and it is why a rename costs one write.

`EntityResolverService` is the contract between the two. It is registered **only** by an
implementation that actually stores organizations (`@owlmeans/server-auth-identity` registers one);
a deployment backed by an external IAM registers none, and every consumer must treat an unresolved
entity as ordinary rather than exceptional.

```typescript
import { attachEntity, entityKeyOf, requireEntityKey, requireEntity } from '@owlmeans/auth-common'
```

| Helper | What it answers |
|--------|-----------------|
| `attachEntity(context, request)` | Resolve the slug on `request.auth` and set `request.entity`, canonicalizing a retired slug to the current one. A no-op when no resolver is registered; throws `AuthenFailed('entity')` when the token names an organization that will not resolve |
| `entityKeyOf(req)` | The value to store and query organization-scoped records by — `req.entity?.id`, falling back to the token's slug where no resolver exists |
| `requireEntityKey(req)` | Same, throwing `AuthorizationError` when the request carries no organization |
| `requireEntity(req)` | The full `ResolvedEntity` (`id`, `slug`, `iamKey`), throwing `AuthorizationError` when nothing resolved |

`attachEntity` must be called wherever authentication is **established** — the HTTP boundary, and
any socket that authenticates after its connection is already open. A path that authenticates
without it leaves `request.entity` empty and its handlers silently compare a slug against stored
ids.

Never build a user-facing name (a hostname, a display label) from `entityKeyOf`. Those want the
current slug, `req.entity?.slug`.

## Usage

Declare an entrypoint with a guard so both sides agree on the alias, and compose authorization as a
gate inside the same options object:

```typescript
import { entrypoint, guard, gate } from '@owlmeans/entrypoint'
import { route, backend } from '@owlmeans/route'
import { DEFAULT_GUARD } from '@owlmeans/auth-common'

// PRODUCT_GATE is the consuming app's own gate alias, registered as a GateService on its context.
entrypoint(
  route('api:account', '/account', backend()),
  guard(DEFAULT_GUARD, gate(PRODUCT_GATE, ['my-service-account-{entity}']))
)
```

`{entity}` is a placeholder each **gate service** substitutes for itself — `@owlmeans/auth-common`
declares neither the token nor the substitution — so what it stands for depends on the gate the
alias resolves to. `@owlmeans/server-iam` substitutes `req.entity?.id`, falling back to the token's
slug, because its grants are stored against the organization entity's stable id wherever one is
resolvable. `@owlmeans/server-oidc-rp`'s gate model substitutes the token's slug only. Both write
`'-'` when neither is available. Read the gate you are wiring before writing a parameter that
depends on the value.

## Rules

- `DEFAULT_GUARD` is the bearer-token guard shared by server and web; `@owlmeans/client-auth` exports
  the matching client-side alias as `DEFAULT_ALIAS`.
- `GUARD_ED25519` is for service-to-service calls, where the caller signs the request rather than
  presenting a bearer token. Give it a Redis-backed nonce cache (`BED255_CASHE_RESOURCE`) in any
  deployment that runs more than one replica, or replay protection is per-process only.
- An OIDC gate is not required when OIDC is only the login/bootstrap provider. Where the provider
  issues a local bearer token, authorize with a product-specific gate against local identity scopes.
- The trust resource (`TRUSTED`, from `@owlmeans/config`) is the system's source of truth for known
  signing identities — the auth service, peer services, wallet providers, supervisors.

## Depends On

- `@owlmeans/auth` — types, errors, entrypoint aliases
- `@owlmeans/entrypoint` — `entrypoint` / `guard` / `gate`, `GuardService`, `ResolvedEntity`
- `@owlmeans/route` — route builders for the shared entrypoint list
- `@owlmeans/basic-keys` — key pairs behind `trust()` and the Ed25519 guard
- `@owlmeans/basic-ids`, `@owlmeans/context`, `@owlmeans/resource`, `@owlmeans/client-entrypoint`
