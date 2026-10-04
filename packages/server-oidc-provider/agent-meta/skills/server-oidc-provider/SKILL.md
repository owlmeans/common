---
name: server-oidc-provider
description: How to use @owlmeans/server-oidc-provider — the embedded OIDC identity provider on top of the oidc-provider library — service wiring, the account and adapter seams, the interaction URL, how scopes are derived from claims, the organizations claim, extra discovery fields, pairwise subjects, and the response headers an authorization endpoint has to correct. Auto-invoked when serving OIDC endpoints from your own service.
user-invocable: false
---
<!-- AUTO-GENERATED — do not edit. Regenerate via sync-agent-meta. -->

# @owlmeans/server-oidc-provider

**Layer:** Server
**Install:** `"@owlmeans/server-oidc-provider": "^0.1.18-rc.48"` in `dependencies`
**Runtime deps:** `oidc-provider@9.11.1` (exact), `jose@6.2.5` (exact), `@types/oidc-provider@9.5.0`

Use this only when your service **is** the identity provider. For consuming someone else's issuer,
use `@owlmeans/server-oidc-rp`.

## Key Exports

| Export | Description |
|--------|-------------|
| `createOidcProviderService(alias?)` | The provider service factory |
| `appendOidcProviderService<C,T>(ctx, alias?)` | Registers it on a context |
| `createOidcProviderMiddleware(webAlias?, oidcAlias?)` | Loading-stage middleware that mounts the provider on the API server exactly once. Register it, or nothing is ever mounted |
| `OidcProviderService` | `instance()`, `update(api)`, `getInteraction(id)` and the live `oidc` provider |
| `OidcAccountService` | The account seam: `loadById(ctx, id, { clientId? })` — what `findAccount` delegates to |
| `OidcAdapterService` | The storage seam: `instance(name)` returns an `oidc-provider` `Adapter` |
| `OIDC_ACCOUNT_SERVICE`, `DEFAULT_ALIAS` | The default account-service alias and the default provider alias |
| `OidcConfig`, `OidcConfigAppend` | The `cfg.oidc` shape this package reads |
| `OidcCustomConfiguration` | `oidc-provider`'s `Configuration` plus `sectorIdentifierUriValidate`, which the pinned typings omit — the type of `cfg.oidc.customConfiguration` |
| `OidcAccountParams` | `{ clientId? }` — lets the account service scope its claims per client |
| `toClientMetadata(client)` | Maps a stored `OidcRegisteredClient` to `oidc-provider` `ClientMetadata` |
| `OidcRegisteredClient`, `OidcClientMetadata` | The stored-client shape `toClientMetadata` takes, and the `oidc-provider` metadata shape it returns, carrying `owlEntityId` |
| `Config`, `Context` | `ServerConfig`/`ServerContext` with `cfg.oidc` and the `debug.oidc` / `debug.oidcServer` / `debug.oidcData` switches |

## Wiring

```typescript
import { appendOidcProviderService, createOidcProviderMiddleware } from '@owlmeans/server-oidc-provider'

appendOidcProviderService<C, T>(context)
context.registerMiddleware(createOidcProviderMiddleware())
```

`cfg.oidc` supplies `clients` (`ClientMetadata[]`), `defaultKeys.RS256.pk` (a PKCS#8 PEM), and
optionally `basePath` (default `oidc`), `authService` (whose registered route the issuer is built
from — defaults to this service), `behindProxy`, `accountService`, `adapterService`,
`discoveryUris` (below) and `customConfiguration` (merged over the defaults below). The shape also declares `frontBase`, which
this package reads nowhere — setting it configures nothing.

A client's `redirect_uris` and `post_logout_redirect_uris` may be written as `{{service-alias}}/path`
and are expanded against that registered service's host. `discoveryUris` (field → URL) extends the
discovery document through the same expansion, merged over `customConfiguration.discovery` — that
is how a deployment advertises an endpoint another service serves, such as `IAM_API_METADATA`
(`owlmeans_iam_api`, the runtime IAM API). A field the provider derives itself cannot be overridden
this way. A client with no `client_secret` is refused
unless a debug flag is on, in which case one is generated and printed.

## Building the interaction URL

`interactions.url` must return the fully-qualified address of the `INTERACTION` screen, which is a
**frontend** route resolved from a **server** context. `url()` does not exist there — that helper is
attached only by `@owlmeans/client-entrypoint` — so the URL is assembled the way the browser's own
`url()` does it: take the entrypoint's `path()`, substitute the `INTERACTION_UID` path param, then
`makeSecurityHelper().makeUrl(entry.address(), path)`. `address()` is the address the entrypoint
answers on — the frontend service's, not this one's — so the base comes from it and must not be
prepended a second time.

## Scopes are derived from `claims`

`oidc-provider` adds every key of the `claims` configuration to the supported-scope set. Declaring
`claims.email` therefore makes `email` a **static** scope, and static scopes are checked against each
client's own `scope` allowlist: a client that omits one fails the whole authorization request with
`invalid_scope`. Whatever provisions clients for this provider must allow every scope the RP requests
(`OIDC_RP_BASE_SCOPES`), and the account service must emit the matching claims — a granted scope with
no claim behind it is silently empty.

The defaults this package sets: `claims` covers `email` (`email`, `email_verified`), `profile` (the
standard set), `PERMISSIONS_SCOPE` → `PERMISSIONS_CLAIM` and `ORGANIZATIONS_SCOPE` →
`ORGANIZATIONS_CLAIM`, both inert unless the account service actually emits them; `scopes` is
`openid profile offline_access permissions organizations`; `features.devInteractions` is off.
Anything under `cfg.oidc.customConfiguration` merges over these.

`organizations` is a static scope like any other: only a client whose allowlist names it may ask,
and a client that does not ask gets no `organizations` claim at all, so a single-organization
client's tokens never carry one.

## Pairwise subjects

The integrated IAM gives every client its own subject for one account. `subjectTypes`,
`pairwiseIdentifier` and `sectorIdentifierUriValidate` pass through `customConfiguration`
unchanged, and `tests/pairwise.spec.ts` drives the pinned provider through the whole design:

- `subjectTypes: ['pairwise']`, `pairwiseIdentifier: (ctx, accountId, client) => <subject>`, and
  `sectorIdentifierUriValidate: () => false`; each client carries `subject_type: 'pairwise'` and
  one constant `sector_identifier_uri` (https, never fetched, so its host may serve nothing — it
  only lets a client register redirect URIs on several hosts).
- The session and the grant name the ACCOUNT; `findAccount` is only ever asked for the account
  id. The id_token, userinfo and introspection all answer the pairwise subject, unchanged across a
  refresh; another client of the same session gets another one.
- **The account's `claims()` must return `sub` = the account id.** The provider applies
  `pairwiseIdentifier` to whatever `sub` it is given (`helpers/claims.js`), and introspection to
  `token.accountId` — an account service that returned the pairwise value itself would have it
  transformed a second time, and the id_token would no longer match introspection.
- With only `pairwise` supported it becomes every client's default `subject_type`; a client
  declaring `public` is refused.
- `sectorIdentifierUriValidate` is missing from `@types/oidc-provider` 9.5.0, which is why
  `OidcCustomConfiguration` declares it; drop that field when the typings carry it.

## oidc-provider v9 configuration

- **The provider is a Koa app**, and `Provider#use(fn)` splices `fn` **ahead of** the provider's own
  router, so a middleware registered that way runs before routing and resumes after `await next()`.
  The header corrections below are still mounted on the API server ahead of `oidc.callback()`, for
  the reason given there.
- **`enableHttpPostMethods` is `false`.** Set it only together with `cookies.long.sameSite: 'none'` —
  the configuration check throws `TypeError: HTTP POST Method support requires that
  cookies.long.sameSite is set to none` otherwise, at construction time.
- **DPoP is enabled.** Pass `features: { dPoP: { enabled: false } }` when the clients send no DPoP
  proofs.
- **Cookie `sameSite` is `lax`** for both `cookies.long` and `cookies.short`. Revisit it when the
  interaction UI lives on another subdomain.
- **Every key in `jwks.keys` needs a distinct `kid`.**
- There is no `provider.Account` getter — accounts come from the `findAccount` callback, which this
  package points at `OidcAccountService`.
- Outbound HTTP goes through the `fetch` configuration option, which mirrors the fetch API.

## jose v6 key import

`importPKCS8` returns a **non-extractable** `CryptoKey` for a private key. Pass `{ extractable: true }`
so the JWKS export succeeds:

```typescript
const key = await jose.importPKCS8(pkcs8Pem, 'RS256', { extractable: true })
const jwk = await jose.exportJWK(key)
```

## A refused account is a login, not a crash

`loadById` answering `undefined` refuses an account (another organization's subject, a disabled or
expired profile). The provider does not treat that as "not logged in": its `no_session` check reads
the raw `session.accountId`, so the login prompt is skipped, `loadGrant` builds no grant for an
unloaded account, and the consent prompt throws `TypeError … oidc.grant.getOIDCScopeEncountered` — the
relying party gets `server_error` / "oops! something went wrong".

The service therefore installs `makeInteractionPolicy()` (`src/utils/policy.ts`) as
`interactions.policy`: the provider's default policy plus an `account_refused` check on the login
prompt that requests a login whenever the session names an account the provider could not load. After
that login the provider's resume step signs the stale session out and continues the interrupted
request. A login that has just completed and is refused again (`oidc.result.login`) throws
`access_denied` instead of prompting, so a refusal can never loop. A consumer's own
`customConfiguration.interactions` is not merged — the service sets `policy` and `url` itself.
`tests/policy.spec.ts` drives a real provider through the whole sequence, including the upstream
crash as a canary: when a bump of `oidc-provider` makes that first test fail, the upstream fixed it
and the check may go.

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
wire — the header looks configured in code and is absent in production. Middleware registered before
the provider writes to the raw response, where helmet has already put its defaults, so the override
is what ships. Verify with `curl -D -` against the provider's
`.well-known/openid-configuration` rather than by reading the code.

## Depends On

- `@owlmeans/oidc`, `@owlmeans/server-api`, `@owlmeans/server-context`, `@owlmeans/config`,
  `@owlmeans/context`, `@owlmeans/entrypoint`, `@owlmeans/route`, `@noble/hashes`, `@scure/base`
- `fastify` (peer) — the API server this package mounts the provider onto
- `oidc-provider` v9, `jose` v6 — see [[oidc-versions]] for the pins and the upgrade checklist
