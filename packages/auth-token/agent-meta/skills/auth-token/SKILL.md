---
name: auth-token
description: How to use @owlmeans/auth-token — the contracts behind long-lived access tokens (API keys) — the token format and its deployment prefix, the three management routes, the Authorization parsing that Bearer needs, and the client-side carrier guard a CLI or an MCP server authenticates with. Auto-invoked when importing the token entrypoints, the carrier guard, parseAuthorizationHeader, or an access-token type.
user-invocable: false
---
<!-- AUTO-GENERATED — do not edit. Regenerate via sync-agent-meta. -->

# @owlmeans/auth-token

**Layer:** Auth shared
**Install:** `"@owlmeans/auth-token": "^0.1.18-rc.6"` in `dependencies`

The contract half of long-lived access tokens: the record shape, the route declarations, the
format helpers, and one client-side guard that presents a token it was handed. The server half —
the store, the verifying guard and the handlers — is `@owlmeans/server-auth-token`; the management
UI is `@owlmeans/web-auth-token`.

## Key Exports

| Export | Description |
|--------|-------------|
| `makeAuthTokenEntrypoints(opts?)` | The three routes (`list` GET, `create` POST, `revoke` DELETE `/:id`) under a `/tokens` base. `opts`: `parent`, `path`, `guard` |
| `makeTokenCarrierGuard(alias, opts)` | A client `GuardService` that presents one token. `opts.token` is a value or a thunk; `opts.scheme` is `'auth-token'` (default) or `'bearer'` |
| `parseAuthorizationHeader(header)` | `{ scheme, value }` with the scheme lower-cased, or `null` |
| `isAccessToken(value, prefix)` · `displayOf(token, prefix)` | Whether a value is one of this deployment's tokens; the half of it that may be shown again |
| `CreateAccessTokenSchema` · `AccessTokenParamsSchema` | The ajv body/params filters |
| `authToken` | `{ base, list, create, revoke }` route aliases |
| `GUARD_AUTH_TOKEN` · `AUTH_TOKEN_RESOURCE` · `AUTH_TOKEN_COLLECTION` | `'guard:auth-token'`, `'auth-token:token'`, `'access-token'` |
| `AUTH_TOKEN_DEFAULT_PREFIX` | `'owl_'` — a deployment overrides it |
| `AUTH_TOKEN_SECRET_BYTES` (24) · `AUTH_TOKEN_DISPLAY_LENGTH` (8) | 192 bits of randomness; 8 characters kept for display |
| `AUTH_TOKEN_TOUCH_INTERVAL` (5 min) · `AUTH_TOKEN_MAX_TTL` (366 d) · `AUTH_TOKEN_NAME_MAX` (64) | Tuning |
| `AUTH_TOKEN_SCHEME` · `BEARER_SCHEME` | `'auth-token'`, `'bearer'` — lower-cased, for comparison |
| `AccessTokenRecord`, `AccessTokenView`, `CreateAccessToken`, `IssuedAccessToken`, `AccessTokenList`, `TokenCarrierOptions`, `AuthTokenEntrypointOptions` | Types |

## The prefix is what makes a token CLAIMABLE

A token is `<prefix><base58(24 random bytes)>`. The prefix is per deployment (`vib_`, `acme_`), and
the guard answers `match` only for a value that starts with it — so an access token and an Ed25519
session bearer arrive under the same `Authorization` header without either guard shadowing the
other, and two deployments never mistake each other's credentials for their own.

The plaintext exists exactly once, in the create response. What is stored is its hash; what a list
shows forever after is `display` — the prefix plus 8 characters, enough to tell two of your own
tokens apart and far too little to replay.

## Both `AUTH-TOKEN` and `Bearer` are accepted, and that is why this package parses headers itself

A third-party client configured with a URL sends `Bearer` whatever the documentation says. But
`extractAuthToken` (`@owlmeans/auth-common`) compares the prefix against `type.toUpperCase()`, so it
matches `AUTH-TOKEN` and can **never** match `Bearer`. `parseAuthorizationHeader` is the
replacement: it lower-cases the scheme so a caller compares once, takes the first of several headers
a proxy folded together, keeps a value that itself contains spaces, and answers `null` for a scheme
with no value behind it.

## The carrier guard is how a process with no browser authenticates

`authMiddleware` asks every guard an entrypoint declares for `authenticated(req)` and stamps the
first non-null answer onto the header — so registering the carrier under the alias the routes
already name (`DEFAULT_GUARD`, usually) makes an **unchanged route declaration** work from a CLI, an
MCP server or a test.

```typescript
context.registerService(makeTokenCarrierGuard(DEFAULT_GUARD, { token, scheme: 'auth-token' }))
context.registerMiddleware(authMiddleware)
```

There is no session, no refresh and no storage: the token is a long-lived credential the caller was
handed. `opts.token` may be a thunk because a long-running process reads it from an environment
variable and must not cache it past a reconfiguration.

## The management surface is deliberately not a CRUD

There is no update. A token's scopes and lifetime are fixed at issuance, because a token that can be
widened later is a grant nobody can reason about from the moment it was created.

```typescript
context.registerEntrypoints(makeAuthTokenEntrypoints({ parent: account.base, path: '/tokens' }))
```

Mount it under an account section: the ownership gate that already guards a person's own settings
then guards the credentials that speak for them. A base with a parent inherits its guard and gate; a
base without one carries `opts.guard`.

`CreateAccessToken.expiresIn` is **seconds** (the server clamps it to `AUTH_TOKEN_MAX_TTL`), while a
UI usually offers days — convert at the form, and omit the field entirely for "never" rather than
sending a zero.

## Depends On

- `@owlmeans/auth` — `AuthRole`, the `Authorization` header name
- `@owlmeans/context`, `@owlmeans/entrypoint`, `@owlmeans/resource`, `@owlmeans/route`

## Related

- [[server-auth-token]] — the store, the verifying guard, the handlers and the coguard
- [[web-auth-token]] — the management panel and its hook
- [[auth-protocol]] — where long-lived tokens sit among the other authentication paths
- [[auth-common]] — `authMiddleware`, `DEFAULT_GUARD`, `extractAuthToken`
