---
name: auth-common
description: How to use @owlmeans/auth-common — the auth vocabulary both sides of the wire share, covering guard aliases (DEFAULT_GUARD, GUARD_ED25519), the shared auth protocol trees, the Ed25519 signature guard, the TRUSTED-record trust() helper, and the organization-entity resolver contract (ENTITY_RESOLVER, makeEntityScope). Auto-invoked when importing guard constants, shared auth protocols, or entity-resolution helpers.
user-invocable: false
---
<!-- AUTO-GENERATED — do not edit. Regenerate via sync-agent-meta. -->

# @owlmeans/auth-common

**Layer:** Core
**Install:** `"@owlmeans/auth-common": "^0.1.18-rc.49"` in `dependencies`

Everything a server and a browser must agree on to talk authentication: aliases, the shared
protocol declarations, the signature guard, and the contract for resolving the organization
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
| `authProtocols` | The shared auth protocol tree — `AUTHEN*`, `CAUTHEN*`, `DISPATCHER`, `DISPATCHER_SURROGATE`, `DISPATCHER_AUTHEN`. Server and client packages bind the entries they serve |
| `managerProtocols` | The auth-manager web API protocol tree (profile → entity slug, auth delegation) |
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
import { makeEntityScope } from '@owlmeans/auth-common'

const scope = makeEntityScope(request)   // once at the top of a handler, never stored
```

| Helper | What it answers |
|--------|-----------------|
| `scope.attachEntity(context)` | Resolve the slug on `request.auth` and set `request.entity`, canonicalizing a retired slug to the current one. Keeps an entity the guard already attached when its `slug` equals the token's exactly, and drops one that does not. Otherwise a no-op when no resolver is registered; throws `AuthenFailed('entity')` when the token names an organization that will not resolve |
| `scope.entityKeyOf()` | The value to store and query organization-scoped records by — `req.entity?.id`, falling back to the token's slug where no resolver exists |
| `scope.requireEntityKey()` | Same, throwing `AuthorizationError` when the request carries no organization |
| `scope.requireEntity()` | The full `ResolvedEntity` (`id`, `slug`, `iamKey`), throwing `AuthorizationError` when nothing resolved |

`scope.attachEntity(context)` must be called wherever authentication is **established** — the HTTP
boundary, and any socket that authenticates after its connection is already open. A path that
authenticates without it leaves `request.entity` empty and its handlers silently compare a slug
against stored ids.

A guard may attach the entity itself when its authority names the organization — the OIDC guard does
for a session of a tenanted client (`@owlmeans/oidc`), whose relying party has no registry to
resolve from. `scope.attachEntity` trusts that attachment only while its `slug` is the token's
`authHelper.entitySlugOf(request.auth)`; on any mismatch it removes it and resolves as if nothing
had been attached, so a stale or foreign entity can never reach a handler. That attached entity is
keyed by the organization's frozen IAM key (`{ id: entityKey, slug, iamKey: entityKey }`) — the
registry's record id never leaves the provider — so on such a relying party
`scope.requireEntityKey()` answers the `entityKey`, which survives a rename exactly as a record id
would.

Never build a user-facing name (a hostname, a display label) from `scope.entityKeyOf()`. Those want
the current slug, `req.entity?.slug`.

## Usage

Declare an entrypoint with a guard so both sides agree on the alias, and compose authorization as a
gate inside the same options object:

```typescript
import { contract, protocol, typed } from '@owlmeans/entrypoint'
import { route, backend } from '@owlmeans/route'
import { DEFAULT_GUARD } from '@owlmeans/auth-common'

// PRODUCT_GATE is the consuming app's own gate alias, registered as a GateService on its context.
protocol(
  route('api:account', '/account', backend()),
  contract(typed<Account>()),
  { guards: DEFAULT_GUARD, gate: { alias: PRODUCT_GATE, params: ['my-service-account-{entity}'] } },
)
```

`{entity}` is a placeholder each **gate service** substitutes for itself — this package declares
neither the token nor the substitution. `@owlmeans/server-iam` substitutes the resolved id
(`server-iam` → "`{entity}` in a permission name"); `@owlmeans/server-oidc-rp`'s gate model the
token's slug only; both write `'-'` when neither is available. Read the gate you are wiring first.

## Rules

- `DEFAULT_GUARD` is the bearer-token guard shared by server and web; `@owlmeans/client-auth` exports
  the matching client-side alias as `DEFAULT_ALIAS`.
- `GUARD_ED25519` is for service-to-service calls, where the caller signs the request rather than
  presenting a bearer token. Give it a Redis-backed nonce cache (`BED255_CASHE_RESOURCE`) in any
  deployment that runs more than one replica, or replay protection is per-process only. The guard
  accepts only canonical timestamps inside its symmetric 60-second window and claims the
  credential-and-nonce pair until that timestamp's absolute expiry; a replay-store error refuses
  authentication rather than disabling deduplication.
- OIDC used only to sign in authorizes with a product gate, not `OIDC_GATE` (`server-oidc-rp` → Rules).
- The trust resource (`TRUSTED`, from `@owlmeans/config`) is the system's source of truth for known
  signing identities — the auth service, peer services, wallet providers, supervisors.

## Depends On

- `@owlmeans/auth` — types, errors, entrypoint aliases
- `@owlmeans/entrypoint` — `entrypoint` / `guard` / `gate`, `GuardService`, `ResolvedEntity`
- `@owlmeans/route` — route builders for the shared protocol trees
- `@owlmeans/basic-keys` — key pairs behind `trust()` and the Ed25519 guard
- `@owlmeans/basic-ids`, `@owlmeans/context`, `@owlmeans/resource`, `@owlmeans/client-entrypoint`
