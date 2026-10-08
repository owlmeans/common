# @owlmeans/auth-token

The contract half of long-lived access tokens (API keys) on the OwlMeans auth rails: the stored
record shape, the token format and its deployment prefix, the three management route declarations
with their AJV schemas, `Authorization` header parsing that accepts `Bearer`, and a client-side
carrier guard that presents a token it was handed. A shared package imports it to declare the token
routes and types; a CLI, a test or an MCP connector imports it for the carrier guard. It stores and
verifies nothing — the token store, the verifying guard and the handlers are
`@owlmeans/server-auth-token`, and the management UI is `@owlmeans/web-auth-token`. Browser sessions
are `@owlmeans/client-auth`, not this package.

## Installation

```bash
bun add @owlmeans/auth-token@^0.1.18-rc.32
```

## Concepts

- **Token** — `<prefix><base58 of 24 random bytes>`. The prefix (`owl_` by default, overridden per
  deployment) makes a token claimable: a guard matches only values that start with it, so an access
  token and a session bearer share the `Authorization` header without shadowing each other.
- **Record** — `AccessTokenRecord`: the SHA-256 `hash` of the plaintext (never the plaintext), a
  `display` form, the owning `userId`/`profileId`/`entityId`, `scopes`, `role`, timestamps and an
  optional OAuth `audience`.
- **Display** — the prefix plus `AUTH_TOKEN_DISPLAY_LENGTH` (8) characters of the secret; enough to
  tell tokens apart, useless as a credential. The plaintext appears once, in `IssuedAccessToken`.
- **Management surface** — `list`, `create` and `revoke` only. There is no update: scopes and
  lifetime are fixed at issuance.
- **Audience** — `audience?: string[]` is set only on tokens minted through an OAuth grant; a guard
  configured with `resources` admits such a token only when the lists intersect.
- **Carrier guard** — a client `GuardService` with no session, refresh or storage; `authMiddleware`
  stamps its `authenticated()` answer onto the request header.

## Usage

### Declare the management routes

Mount the base under an account section so the ownership gate already guarding a person's settings
guards their tokens too.

```typescript
import { makeAuthTokenEntrypoints } from '@owlmeans/auth-token'

export const tokenEntrypoints = makeAuthTokenEntrypoints({ parent: account.base, path: '/tokens' })

context.registerEntrypoints(tokenEntrypoints)
```

A base without a parent carries `opts.guard` instead:

```typescript
import { GUARD_AUTH_TOKEN, makeAuthTokenEntrypoints } from '@owlmeans/auth-token'

const tokens = makeAuthTokenEntrypoints({ guard: GUARD_AUTH_TOKEN })
```

### Authenticate a non-browser client with a token

Register the carrier under the alias the routes already name, and unchanged route declarations work
from a CLI or a connector.

```typescript
import { DEFAULT_GUARD, authMiddleware } from '@owlmeans/auth-common'
import { makeTokenCarrierGuard } from '@owlmeans/auth-token'

context.registerService(makeTokenCarrierGuard(DEFAULT_GUARD, {
  token: () => process.env.OWL_TOKEN ?? '',   // a thunk is re-read on every request
  scheme: 'bearer',                            // default 'auth-token' → `AUTH-TOKEN <token>`
  onRejected: async () => { await signInAgain() },
}))
context.registerMiddleware(authMiddleware)
```

### Parse and display tokens

```typescript
import { AUTH_TOKEN_DEFAULT_PREFIX, BEARER_SCHEME, AUTH_TOKEN_SCHEME, tokenFormatHelper } from '@owlmeans/auth-token'

const header = tokenFormatHelper.parseAuthorizationHeader(req.headers.authorization)
if (header != null && (header.scheme === BEARER_SCHEME || header.scheme === AUTH_TOKEN_SCHEME)
  && tokenFormatHelper.isAccessToken(header.value, AUTH_TOKEN_DEFAULT_PREFIX)) {
  // claim it
}

tokenFormatHelper.displayOf('owl_ABCDEFGHIJKLMNOP', 'owl_')   // 'owl_ABCDEFGH'
```

### Create a token from a client

```typescript
import type { CreateAccessToken, IssuedAccessToken } from '@owlmeans/auth-token'

const body: CreateAccessToken = { name: 'CI deploy', scopes: ['project:read'], expiresIn: 30 * 24 * 3600 }
const issued: IssuedAccessToken = await context.entrypoint(tokenEntrypoints.create).call({ body })
// issued.token is the only time the plaintext is available
```

## API

### Functions and helpers

| Symbol | Kind | Purpose |
|---|---|---|
| `makeAuthTokenEntrypoints(opts?)` | function | `{ base, list, create, revoke }` protocols: `GET /`, `POST /`, `DELETE /:id` under `opts.path ?? '/tokens'`; `opts.parent` or `opts.guard` for the base |
| `makeTokenCarrierGuard(alias, opts)` | function | client `GuardService`; `authenticated()` → `AUTH-TOKEN <t>` or `Bearer <t>`, `null` for an empty token; `update()` calls `opts.onRejected` |
| `tokenFormatHelper`, `createTokenFormatHelper()` | helper | the three members below |
| `tokenFormatHelper.parseAuthorizationHeader(header)` | member | `{ scheme, value }` with scheme lower-cased; first of a folded array; `null` without a value |
| `tokenFormatHelper.isAccessToken(value, prefix)` | member | value starts with the prefix and is longer than it |
| `tokenFormatHelper.displayOf(token, prefix)` | member | prefix + 8 characters of the secret |
| `CreateAccessTokenSchema` | AJV schema | `name` 1–64, `scopes?` ≤ 32 items, `expiresIn?` integer seconds 60…366 days |
| `AccessTokenParamsSchema` | AJV schema | `{ id }`, 1–128 characters |

### Constants

| Symbol | Value |
|---|---|
| `GUARD_AUTH_TOKEN` | `'guard:auth-token'` |
| `AUTH_TOKEN_RESOURCE`, `AUTH_TOKEN_COLLECTION` | `'auth-token:token'`, `'access-token'` |
| `AUTH_TOKEN_DEFAULT_PREFIX` | `'owl_'` |
| `AUTH_TOKEN_SECRET_BYTES`, `AUTH_TOKEN_DISPLAY_LENGTH` | `24`, `8` |
| `AUTH_TOKEN_TOUCH_INTERVAL` | 5 minutes in ms — how often `lastUsedAt` is written |
| `AUTH_TOKEN_MAX_TTL` | 366 days in ms |
| `AUTH_TOKEN_NAME_MAX` | `64` |
| `authToken` | frozen route aliases `{ base, list, create, revoke }` (`'auth-token:*'`) |
| `AUTH_TOKEN_SCHEME`, `BEARER_SCHEME` | `'auth-token'`, `'bearer'` (lower-cased, for comparison) |

### Types

| Symbol | Purpose |
|---|---|
| `AccessTokenRecord` | the stored record (hash, display, owner ids, scopes, role, dates, `audience?`) |
| `AccessTokenView` | the record without `hash` — what a caller may see |
| `CreateAccessToken` | `{ name, scopes?, expiresIn? }` — `expiresIn` in seconds |
| `IssuedAccessToken` | `{ token, record }` |
| `AccessTokenList`, `AccessTokenParams` | `{ items }`, `{ id }` |
| `TokenCarrierOptions` | `{ token: string \| () => string \| Promise<string>, scheme?, onRejected? }` |
| `AuthTokenEntrypointOptions`, `AuthTokenEntrypoints` | `makeAuthTokenEntrypoints` input and output |
| `AuthorizationHeader`, `TokenFormatHelper` | parsed header and the format helper interface |

## Common pitfalls

- Do not use `extractAuthToken` from `@owlmeans/auth-common` for these tokens — it compares against
  the upper-cased type and never matches `Bearer`; use `tokenFormatHelper.parseAuthorizationHeader`.
- `expiresIn` is seconds, not days; omit it for "never" rather than sending `0`.
- The plaintext is returned only by `create`; never store or log it. Lists show `display`.
- Give each deployment its own prefix so two deployments never claim each other's tokens.
- Pass a thunk as `token` in long-running processes so a reconfigured credential is picked up.
- Do not add an update route: a token that can be widened after issuance is a grant nobody can
  reason about.

The `auth-token` skill covers the prefix rule, header parsing, the carrier guard and the management
surface; the `server-auth-token` skill covers the store and the verifying guard.

## Related packages

- [`@owlmeans/server-auth-token`](../server-auth-token) — token store, verifying guard with audience admission, handlers
- [`@owlmeans/web-auth-token`](../web-auth-token) — the token-management panel and hook
- [`@owlmeans/server-oauth`](../server-oauth) — mints audience-scoped tokens through OAuth grants
- [`@owlmeans/auth-common`](../auth-common) — `authMiddleware`, `DEFAULT_GUARD`
- [`@owlmeans/cli-auth`](../cli-auth) — browser sign-in for a CLI, whose result a carrier guard can present
- [`@owlmeans/entrypoint`](../entrypoint) — protocol declarations and `GuardService`

<!-- owlmeans:agent-guidance:start -->
## Agent guidance

This package ships embedded agent skills under `agent-meta/`. After installing your
`@owlmeans/*` packages, run the OwlMeans agent-skills installer to place them into
your project's skill store (`.agents/skills/`):

```sh
npx @owlmeans/agent-skills@^0.1.18-rc.49
```

The embedded files are version-matched to this package release. Do not edit them
directly — they are regenerated on each publish. To contribute guidance edits,
open a PR against the source monorepo.
<!-- owlmeans:agent-guidance:end -->
