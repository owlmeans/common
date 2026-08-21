---
name: server-oidc-provider
description: How to use @owlmeans/server-oidc-provider — embedded OIDC identity provider built on the oidc-provider library. Auto-invoked when serving OIDC endpoints from your own service.
user-invocable: false
---
<!-- AUTO-GENERATED — do not edit. Regenerate via sync-agent-meta. -->

# @owlmeans/server-oidc-provider

**Layer:** Server
**Install:** `"@owlmeans/server-oidc-provider": "^0.1.18-rc.8"` in `dependencies`
**Runtime deps:** `oidc-provider@9.8.4` (exact), `jose@6.2.3` (exact)

## Key Exports

| Export | Description |
|--------|-------------|
| `createOidcProviderService(alias?)` | Factory for the embedded OIDC provider service |
| `appendOidcProviderService<C,T>(ctx, alias?)` | Register the provider service on a context |
| Constants | `DEFAULT_ALIAS`, `OIDC_ACCOUNT_SERVICE` |
| Types | `OidcProviderService`, `OidcAccountService`, `OidcAdapterService`, `Config`, `Context` |

## Usage

Use this only when your service IS the identity provider (e.g. self-hosted Keycloak alternative). For consuming an external IdP, use `@owlmeans/server-oidc-rp`.

```typescript
import { appendOidcProviderService } from '@owlmeans/server-oidc-provider'
appendOidcProviderService<C, T>(context)
```

The service mounts the oidc-provider Koa app onto Fastify via `api.server.use(base, oidc.callback())`. It wires `findAccount`, `interactions.url`, the JWKS, and optional adapter.

## Building the interaction URL (server context, frontend route)

`interactions.url` must return the fully-qualified address of the `INTERACTION` screen, which is a
**frontend** route resolved from a **server** context. `call()` does not exist there — it is attached
only by `@owlmeans/client-entrypoint` — so the URL is assembled the way `urlCall` does it in the
browser: resolve the route, substitute the `INTERACTION_UID` path param, then `makeSecurityHelper().makeUrl(route, path)`
so the frontend service's host and base are applied. Pass the entrypoint's own `getPath()` as the
path and let `makeUrl` supply the base — do not prepend it twice.

## Scopes are derived from `claims`

`oidc-provider` adds every key of the `claims` configuration to the supported-scope set
(`collectScopes`). Declaring `claims.email` therefore makes `email` a **static** scope, and static
scopes are checked against each client's own `scope` allowlist: a client that omits one fails the
whole authorization request with `invalid_scope`. Whatever provisions clients for this provider must
allow every scope the RP requests (`OIDC_RP_BASE_SCOPES`), and the account service must emit the
matching claims — a granted scope with no claim behind it is silently empty.

## oidc-provider v9 notes (important)

- **Provider is a Koa app instance.** `oidc.use()` callbacks where the work happens *after* `await next()` will **not** fire once a route is matched — Koa's downstream does not continue past matched routes in v9. Move post-response header work (e.g. CSP rewrites) to a **Fastify `onSend`/`preHandler` hook** scoped to the OIDC base path.
- **`enableHttpPostMethods`** defaults `false` — set it in the Provider config if your interaction UI POSTs to the authorization/end-session endpoints.
- **DPoP is enabled by default.** Add `features: { dPoP: { enabled: false } }` if RP clients do not send DPoP proofs.
- **Cookie `sameSite` defaults to `lax`** (was `none`). Adjust `cookies.*.sameSite` if the interaction UI is on a different subdomain.
- **JWKS `kid` must be unique.** Every key in `jwks.keys` needs a distinct `kid`.
- **Node 22+** required.

## jose v6 notes

`importPKCS8` now returns a **non-extractable `CryptoKey`** by default. Pass `{ extractable: true }` so `exportJWK` succeeds:

```typescript
const key = await jose.importPKCS8(pkcs8Pem, 'RS256', { extractable: true })
const jwk = await jose.exportJWK(key)
```

## Response headers the hardened defaults get wrong

`@fastify/helmet` runs with its defaults on every OwlMeans server, and two of them break an
authorization endpoint. Both are corrected by middleware this package mounts ahead of the provider.

- **`Cross-Origin-Opener-Policy: same-origin`** puts the authorization document in a fresh browsing
  context group, severing `window.opener` **permanently** — navigating back to the relying party
  afterwards does not restore it. That kills popup-based login, which is how an app embedded in an
  iframe must authenticate (see the `web-oidc-rp` skill). The provider sends `unsafe-none`.
- **`form-action 'self'`** blocks the provider's own interaction form posting across origins, so it
  is rewritten to `form-action *`.

**Set these as middleware, never as a Fastify `onSend` hook.** `oidc.callback()` is a Koa handler
mounted through Middie: it ends the response itself, outside Fastify's reply lifecycle, so `onSend`
never fires for any route the provider answers and anything set there silently never reaches the
wire — the header looks configured in code and is absent in production. Middleware registered
before the provider writes to the raw response, where helmet has already put its defaults, so the
override is what ships. Verify with `curl -D -` against `/<basePath>/.well-known/openid-configuration`
rather than by reading the code.

## Depends On

- `@owlmeans/oidc`, `@owlmeans/server-api`, `@owlmeans/server-context`
- `oidc-provider` v9, `jose` v6 (runtime — see [[oidc-versions]] for pinned versions and upgrade checklist)
