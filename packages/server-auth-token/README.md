# @owlmeans/server-auth-token

The server half of long-lived access tokens: a MongoDB token store, a guard that verifies a
presented token and turns it into the same `Auth` payload a browser session produces, the
list / create / revoke handlers, a shared issuer for other minting paths (an OAuth token endpoint),
and a coguard helper that admits a token on every already-guarded route. A backend uses it when API
clients, CLIs or coding agents should call the same routes a signed-in person does. The token
format, routes and record types live in `@owlmeans/auth-token`; the browser management panel is
`@owlmeans/web-auth-token`; issuing tokens through an OAuth grant is `@owlmeans/server-oauth`, which
calls this package's issuer.

## Installation

```bash
bun add @owlmeans/server-auth-token@^0.1.18-rc.33
```

## Concepts

- **Access token** — `<prefix><base58 of 24 random bytes>`; the prefix defaults to `owl_`. The
  plaintext is returned once at creation; the store keeps only its SHA-256 `hash` and a short
  `display` form.
- **Guard, not authentication** — the guard verifies what arrives and resolves an `Auth` with
  `type: AuthroizationType.AuthToken`; `authenticated()` always returns `null`, nothing is exchanged.
- **Prefix claim** — the guard matches only an `Authorization` value with the `AUTH-TOKEN` or
  `Bearer` scheme that carries the deployment's prefix, so it coexists with other bearer guards.
- **Scope intersection** — on every request the token's scopes are intersected with its identity
  profile's; a missing or expired profile refuses the token.
- **Audience** — a token minted through OAuth carries `audience`; a guard configured with
  `resources` refuses a token whose audience does not intersect them. Without `resources`, every
  token is admitted.
- **Deny list** — `denyAliases` names routes the guard never claims, so an interactive-only route
  stays a 401 for a token even when the guard is inherited.

## Usage

### Register the store and the guard

```typescript
import { GUARD_AUTH_TOKEN } from '@owlmeans/auth-token'
import { AUTH_IDENTITY_DB_ALIAS } from '@owlmeans/server-auth-identity'
import { appendAuthTokenGuard, appendAuthTokenResources } from '@owlmeans/server-auth-token'

appendAuthTokenResources(context, AUTH_IDENTITY_DB_ALIAS)   // same dbAlias as the identity resources
appendAuthTokenGuard(context, GUARD_AUTH_TOKEN, {
  prefix: 'vib_',                                           // also written to cfg.authToken.prefix
  denyAliases: [protocols.tokens.create.alias, protocols.tokens.revoke.alias, checkoutProtocol.alias],
})
```

### Bind the token routes

```typescript
import { makeAuthTokenEntrypoints } from '@owlmeans/auth-token'
import { bind } from '@owlmeans/server-entrypoint'
import { createAccessToken, listAccessTokens, revokeAccessToken } from '@owlmeans/server-auth-token'

const tokens = makeAuthTokenEntrypoints({ parent: account.base })

context.registerEntrypoints([
  bind(tokens.list, listAccessTokens(tokens.list)),
  bind(tokens.create, createAccessToken(tokens.create)),
  bind(tokens.revoke, revokeAccessToken(tokens.revoke)),
])
```

`revokeAccessToken(protocol, { allowAccessTokens: true })` lets a token revoke the same person's
tokens (for an agent-facing surface); ownership is still checked and minting stays refused.

### Admit tokens on every guarded route

```typescript
import { withAuthTokenCoguard } from '@owlmeans/server-auth-token'

export const guardedProtocols = withAuthTokenCoguard(appProtocols)   // before creating bindings
```

The coguard is appended after each protocol's existing guards; protocols without a guard are left
alone, and running it twice changes nothing.

### Restrict a surface to tokens issued for it

```typescript
appendAuthTokenGuard(context, 'guard:mcp-token', {
  resources: ctx => [mcpResourceUri(ctx)],                   // app function, resolved per request
})
```

### Mint from another flow

```typescript
import { accessTokenIssuerOf, refuseTokenAuth } from '@owlmeans/server-auth-token'

refuseTokenAuth(req, 'token-mint')   // a token may never mint a token
const issued = await accessTokenIssuerOf(context).issueAccessToken(
  { entityId, userId, profileId, role, scopes: ownScopes },
  { name: 'MCP connector', scopes: ['*'], expiresIn: 3600, audience: [resourceUri] },
)
// issued.token is the plaintext, shown once; issued.record is the hash-free view
```

## API

### Registration and guard

| Symbol | Purpose |
|---|---|
| `appendAuthTokenResources(ctx, dbAlias?)` | Registers `makeAccessTokenResource(dbAlias)` |
| `appendAuthTokenGuard(ctx, alias?, opts?)` | Registers the guard (default alias `GUARD_AUTH_TOKEN`); writes `opts.prefix` into `cfg.authToken.prefix` |
| `makeAuthTokenGuard(alias?, opts?)` | The `GuardService` |
| `makeAccessTokenResource(dbAlias?)` | Mongo resource at `AUTH_TOKEN_RESOURCE`, collection `access-token`; indexes `hash` (unique), `owner` (`entityId`, `profileId`), `expiresAt` (sparse) |
| `withAuthTokenCoguard(tree, guard?)` | Same-shaped protocol tree with the token guard appended to every guarded protocol |
| `prefixOf(context, opts?)` | Prefix from guard options, then `cfg.authToken.prefix`, then `owl_` |

### Handlers and issuance

| Symbol | Purpose |
|---|---|
| `listAccessTokens(protocol)` | The caller's tokens in the caller's organization entity, newest first, without hashes |
| `createAccessToken(protocol)` | Mints a token from the session; refuses token auth; scopes may only narrow |
| `revokeAccessToken(protocol, opts?)` | Sets `revokedAt` on the caller's own token; idempotent; a foreign id answers like an unknown one |
| `accessTokenIssuerOf(ctx).issueAccessToken(subject, request)` | The shared minting path; `expiresIn` is clamped to `AUTH_TOKEN_MAX_TTL` |
| `makeAccessTokenIssuer(ctx)` | Builds an `AccessTokenIssuer` (unmemoized) |
| `refuseTokenAuth(req, what)` | Throws `AuthForbidden(what)` when `req.auth.type` is an access token |
| `tokenHashHelper.hashAccessToken(token)` | SHA-256 hex — the stored form |
| `tokenHashHelper.mintAccessToken(prefix)` | `MintedToken` `{ token, hash, display }` |
| `createTokenHashHelper()` | Builds a `TokenHashHelper` |
| `issueAccessToken(ctx, subject, request)`, `hashAccessToken(token)` | Deprecated wrappers |
| `SERVER_AUTH_TOKEN` | `'server-auth-token'` — module alias for error locations |

### Types

| Symbol | Purpose |
|---|---|
| `AuthTokenGuardOptions` | `prefix?`, `denyAliases?`, `touchInterval?` (default 5 min), `resourceAlias?`, `profileAlias?`, `resources?` |
| `AuthTokenConfig` | `ServerConfig` with `authToken?: { prefix? }` |
| `AuthTokenContext` | `ServerContext<AuthTokenConfig>` |
| `AccessTokenResource` | `MongoResource<AccessTokenRecord>` |
| `IssueAccessTokenSubject` | `{ entityId, userId, profileId, role, scopes }` |
| `IssueAccessTokenRequest` | `CreateAccessToken` (`name`, `scopes?`, `expiresIn?`) plus `audience?` |
| `AccessTokenIssuer`, `RevokeAccessTokenOptions`, `MintedToken`, `TokenHashHelper` | Supporting types |

## Guard behaviour

A presented token is refused when it is unknown, revoked, expired, outside the configured
`resources`, or when its identity profile is missing, unreadable or expired. On success the payload
carries the token's **display** form (never the secret), the profile's `role`, the intersected
scopes, and an `entitySlug` resolved through `ENTITY_RESOLVER` when one is registered. `lastUsedAt`
is written fire-and-forget at most once per `touchInterval`. Refusals are logged once a minute per
token and reason, with the record id only.

## Common pitfalls

- Passing `prefix` only to a guard you build with `makeAuthTokenGuard` — the minting handler reads the
  prefix from config, so the two disagree and every new token is a 401. Use `appendAuthTokenGuard`.
- Registering the token store on a different `dbAlias` than the identity resources.
- Forgetting the deny list — a coguard-admitted token then reaches routes that must stay
  session-only (minting, checkout, starting an OAuth flow). A child route cannot drop an inherited
  guard; the refusal belongs in `denyAliases`.
- Expecting a requested scope the caller lacks to be dropped — it is refused with
  `AuthForbidden('scope')`.
- Treating `lastUsedAt` as an access log — it is throttled and best-effort.
- Decorating protocols with `withAuthTokenCoguard` after bindings were created.

The `server-auth-token` skill covers the guard, the store and the deny-list rule in depth; the
`auth-token` skill covers the format and routes.

## Related packages

- [`@owlmeans/auth-token`](../auth-token) — token format, routes, record types, constants
- [`@owlmeans/web-auth-token`](../web-auth-token) — the browser token management panel
- [`@owlmeans/server-oauth`](../server-oauth) — OAuth authorization server that mints audience-scoped tokens
- [`@owlmeans/server-auth-identity`](../server-auth-identity) — the identity profiles a token is bound to
- [`@owlmeans/mongo-resource`](../mongo-resource) — the token store's backend
- [`@owlmeans/server-api`](../server-api) — the `handlers()` builder the handlers use

<!-- owlmeans:agent-guidance:start -->
## Agent guidance

This package ships embedded agent skills under `agent-meta/`. After installing your
`@owlmeans/*` packages, run the OwlMeans agent-skills installer to place them into
your project's skill store (`.agents/skills/`):

```sh
npx @owlmeans/agent-skills@^0.1.18-rc.51
```

The embedded files are version-matched to this package release. Do not edit them
directly — they are regenerated on each publish. To contribute guidance edits,
open a PR against the source monorepo.
<!-- owlmeans:agent-guidance:end -->
