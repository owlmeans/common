---
name: server-auth-token
description: How to use @owlmeans/server-auth-token — the server half of long-lived access tokens — the Mongo store, the guard that verifies a presented token and intersects its scopes with the profile's, the mint/list/revoke handlers, and the coguard that admits a token on every already-guarded route. Auto-invoked when registering the token guard or resources, mounting the token handlers, or diagnosing a 401 on a route an access token should reach.
user-invocable: false
---
<!-- AUTO-GENERATED — do not edit. Regenerate via sync-agent-meta. -->

# @owlmeans/server-auth-token

**Layer:** Server
**Install:** `"@owlmeans/server-auth-token": "^0.1.18-rc.4"` in `dependencies`
**Contracts:** `@owlmeans/auth-token` — the record, the routes, the format helpers

## Key Exports

| Export | Description |
|--------|-------------|
| `appendAuthTokenResources(ctx, dbAlias?)` | Register the token store. Pass the identity resources' `dbAlias` |
| `appendAuthTokenGuard(ctx, alias?, opts?)` | Register the guard AND write `opts.prefix` into the config |
| `makeAuthTokenGuard(alias?, opts?)` | The guard itself |
| `makeAccessTokenResource(dbAlias?)` | The Mongo resource, with its three indexes |
| `prefixOf(context, opts?)` | The deployment's prefix: guard options → config → default |
| `hashAccessToken(token)` · `mintAccessToken(prefix)` | The stored form; one minted `{ token, hash, display }` |
| `setupAuthTokenCoguard(entrypoints, guard?)` | Append the guard to every entrypoint that already has one |
| `listAccessTokens` · `createAccessToken` · `revokeAccessToken` | The three handlers |
| `AuthTokenGuardOptions` (`prefix`, `denyAliases`, `touchInterval`, `resourceAlias`, `profileAlias`) · `AuthTokenConfig` · `AccessTokenResource` | Types |

## Wiring

```typescript
appendAuthTokenResources(context, AUTH_IDENTITY_DB_ALIAS)
appendAuthTokenGuard(context, GUARD_AUTH_TOKEN, {
  prefix: 'vib_',
  denyAliases: TOKEN_DENIED_ROUTES,
})
```

**The prefix is written into the configuration, because the guard is not the only reader.** The
minting handler has no guard instance to ask and resolves it through `prefixOf(ctx)`, and the two
MUST agree: a deployment that told only the guard issues `owl_…` tokens its own guard refuses to
claim, and every request 401s with nothing anywhere saying why.

Register the store against the **same `dbAlias` as the identity resources**. The guard reads a
token's profile back on every request, and splitting the two across databases makes every
authenticated call a cross-database join nobody wrote.

## The store

`hash` is **uniquely** indexed — two records answering one presented secret would make revocation a
coin toss. `entityId`/`profileId` are plain indexed strings, never declared ObjectId references,
because that is how the identity records they point at store them, and a reference declared on one
side of a join and not the other finds nothing. No `$jsonSchema` is applied: the write path is one
handler with a validated body, and a collection schema would have to be kept in step with a record
the guard writes to (`lastUsedAt`) on every request.

SHA-256 rather than a password hash is deliberate. The input is 192 bits of machine-generated
randomness, so there is no dictionary to slow down, and the hash is computed on **every** API
request — a deliberately slow function here would be a deliberate rate limit on the deployment's
whole authenticated surface.

## The guard verifies; it never authenticates

`authenticated()` returns `null`. Nothing is exchanged, no envelope is signed, no session begins: a
caller presents a credential it was handed once, and the guard turns it into the same `Auth` payload
every other guard produces — so ownership gates, entitlement gates and handlers written against a
browser session work unchanged for an API client. The `token` field carries the **display** form, so
a log or an audit trail can hold it safely.

Three properties keep it from colliding with the guards beside it:

- it claims a header only when the value carries the deployment's prefix, under `AUTH-TOKEN` **or**
  `Bearer`;
- **it intersects the token's scopes with its profile's on every request** — and loads the profile
  per request, which is what makes revoking a person's access revoke every token they ever minted
  without a single token record being touched. `ALL_SCOPES` on either side widens to the other. A
  revoked token, an expired token, a missing profile and an expired profile all refuse;
- `entitySlug` is resolved through `ENTITY_RESOLVER` when one is registered, so the payload is
  identical to a browser session's rather than carrying a raw id.

`lastUsedAt` is a **throttled, fire-and-forget** write (`touchInterval`, default 5 minutes). A usage
timestamp is never a reason to fail a request, and awaiting it would put a database write on the
critical path of every authenticated call. It answers one question — "is this token still in use?" —
and is not an access log.

## A token may never mint or revoke a token

Minting is the one operation that turns a stolen credential into a permanent one: a token that can
create tokens survives the revocation of the token that leaked. `createAccessToken` and
`revokeAccessToken` refuse a request whose `auth.type` is `AuthroizationType.AuthToken`, and a
deployment additionally names those routes in the guard's **deny list**, so the refusal is a 401 at
the boundary rather than a check every future handler has to remember.

Minting only ever narrows: asking for a scope the caller does not hold is **refused**, not silently
dropped — a token that quietly grants less than it was asked for fails later, somewhere else, with
an error about the wrong thing. Revoke is idempotent (a retry looks like a second revoke), and
another profile's token answers exactly as an unknown id does, so an owner learns nothing about
tokens that are not theirs.

## The coguard admits a token everywhere, and the deny list lives in the GUARD

```typescript
setupAuthTokenCoguard(managerEntrypoints as Array<{ guards?: string[] }>)
```

An API client drives the same surface a browser does — projects, stories, files — so admitting the
token only on a dedicated prefix would mean a second copy of every route. The coguard **appends**,
never substitutes: the primary guard stays first and still claims its own credential, and this one
matches only a value carrying the prefix. It skips entrypoints that have no guard, and it is
idempotent.

**Run it after the final binding**, because it reads the guard list each entrypoint actually ended
up with.

Routes that must stay behind an interactive session — opening a checkout, starting an OAuth flow,
minting another token — are named in `AuthTokenGuardOptions.denyAliases` rather than skipped here.
A child entrypoint inherits every guard its ancestors declare and **cannot drop one**, so the only
place left to say "not with this credential" is the moment the guard decides whether the request is
its business at all. Refusing in `match` is what makes it a 401 instead of a route that quietly
works.

## Tests

`bun test ./tests` in the package — what the guard claims, what it resolves (including that a token
can never outrank its profile), the mint/list/revoke rules, and the coguard's four properties.

## Depends On

- `@owlmeans/auth-token` — the contracts · `@owlmeans/auth`, `@owlmeans/auth-common`
- `@owlmeans/server-auth-identity` — the profile a token is bound to
- `@owlmeans/mongo-resource`, `@owlmeans/server-api`, `@owlmeans/server-context`
- `@noble/hashes`, `@scure/base`

## Related

- [[auth-token]] — the format, the routes and the client carrier guard
- [[web-auth-token]] — the management panel · [[auth-protocol]] · [[server-auth]]
