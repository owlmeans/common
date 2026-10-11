# @owlmeans/server-oauth

The server half of `@owlmeans/oauth`: a standards-facing OAuth 2.1 authorization server for an
OwlMeans backend. It serves RFC 8414 and RFC 9728 metadata, the authorization-code grant with PKCE
`S256`, the device authorization grant (RFC 8628), Dynamic Client Registration (RFC 7591, public
clients only), revocation (RFC 7009), Client ID Metadata Documents with an SSRF pre-flight, and the
session-guarded consent handlers. On approval it mints an ordinary `@owlmeans/auth-token` access
token with an `audience`. An API uses it when a CLI, an MCP host or another browser-capable client
must sign a person in through the browser. It is not an OpenID Connect provider — interactive sign-in
to OwlMeans apps is `@owlmeans/server-oidc-provider`; hand-made API keys alone need only
`@owlmeans/server-auth-token`.

## Installation

```bash
bun add @owlmeans/server-oauth@^0.1.18-rc.22
```

`fastify` (`^5.12.5`) is a peer dependency.

## Concepts

- **Raw routes** — the RFC endpoints are mounted as raw Fastify routes by a `Loading`-stage context
  middleware, inside one encapsulated plugin with its own `application/x-www-form-urlencoded`
  parser. They are never entrypoints.
- **Consent handlers** — `load` / `approve` / `deny` are ordinary entrypoint handlers bound onto
  `makeOAuthProtocols()` from `@owlmeans/oauth`, under a guarded parent.
- **Lazy URL options** — `OAuthUrlOption` is a string or a function of the context, resolved on
  every call, because hostnames from mounted secrets are not readable when `makeContext` runs.
- **Pending store** — one resource (`OAUTH_PENDING_RESOURCE`) holds `req:`, `usr:`, `dev:` and
  `code:` records; device and authorization codes are stored only hashed; codes are single-use.
- **Client resolution** — static (config), then CIMD (an https `client_id` fetched behind the SSRF
  guard), then DCR (a Mongo store with a TTL index).
- **Audience** — a minted token carries `audience = [resource]` when the request named one; the token
  guard admits it only where its `resources` intersect.

## Usage

### Wire the server

```typescript
import { makeSecurityHelper } from '@owlmeans/config'
import { OAUTH_CONSENT_PATH, OAUTH_DEVICE_PATH } from '@owlmeans/oauth'
import { appendOAuthServer } from '@owlmeans/server-oauth'

appendOAuthServer(context, {
  issuer: ctx => makeSecurityHelper(ctx).makeUrl(ctx.cfg.services[API]!),
  consentUrl: ctx => makeSecurityHelper(ctx).makeUrl(ctx.cfg.services[WEB]!, OAUTH_CONSENT_PATH),
  deviceUrl: ctx => makeSecurityHelper(ctx).makeUrl(ctx.cfg.services[WEB]!, OAUTH_DEVICE_PATH),
  resources: [
    { resource: ctx => makeSecurityHelper(ctx).makeUrl(ctx.cfg.services[API]!) },
    { resource: ctx => `${makeSecurityHelper(ctx).makeUrl(ctx.cfg.services[API]!)}/mcp`, path: '/mcp' },
  ],
  clients: [{
    clientId: 'my-cli', clientName: 'My CLI',
    redirectUris: ['http://localhost/callback', 'http://127.0.0.1/callback'],
  }],
  dcrDbAlias: IDENTITY_DB_ALIAS,
})
```

To keep pending records in Redis, register `makeRedisResource(OAUTH_PENDING_RESOURCE)` **before**
this call; otherwise an in-process `static-resource` fallback is registered.

### Bind the consent handlers

```typescript
import { makeOAuthProtocols } from '@owlmeans/oauth'
import { approveConsent, denyConsent, loadConsent } from '@owlmeans/server-oauth'

const oauthProtocols = makeOAuthProtocols({ parent: account.base })

export const oauthHandlers = {
  load: loadConsent(oauthProtocols.load).bind,
  approve: approveConsent(oauthProtocols.approve).bind,
  deny: denyConsent(oauthProtocols.deny).bind,
}
```

Then deny those routes to token callers and enforce audiences on the token guard
(`@owlmeans/server-auth-token`):

```typescript
import { GUARD_AUTH_TOKEN } from '@owlmeans/auth-token'
import { oauth } from '@owlmeans/oauth'
import { appendAuthTokenGuard } from '@owlmeans/server-auth-token'

appendAuthTokenGuard(context, GUARD_AUTH_TOKEN, {
  denyAliases: [oauth.approve, oauth.deny],
  resources: ctx => [makeSecurityHelper(ctx).makeUrl(ctx.cfg.services[API]!)],
})
```

### Answer a resource server's 401

```typescript
import { oauthMetadataOf } from '@owlmeans/server-oauth'

reply.code(401).header(
  'www-authenticate',
  oauthMetadataOf(context).protectedResourceChallenge('/mcp', { error: 'invalid_token' }),
)
// Bearer error="invalid_token", resource_metadata="https://api.example.com/.well-known/oauth-protected-resource/mcp"
```

## Endpoints

| Route | Behaviour |
|---|---|
| `GET /.well-known/oauth-authorization-server` | RFC 8414 metadata; `registration_endpoint` only when DCR is on |
| `GET /.well-known/oauth-protected-resource[/<path>]` | RFC 9728, one document per configured resource; unknown path → 404 |
| `GET /oauth/authorize` | verifies client and `redirect_uri` first (a bad pair answers 400 text, never redirects), then PKCE and `resource`; 302 to `consentUrl?ref=<id>` |
| `POST /oauth/device_authorization` | `device_code`, `user_code`, `verification_uri` = `deviceUrl`, `expires_in` 600, `interval` 5 |
| `POST /oauth/token` | code grant (single-use code, exact redirect, PKCE) or device grant (`authorization_pending`, `slow_down`, `access_denied`, `expired_token`, or the token once); `cache-control: no-store` |
| `POST /oauth/register` | RFC 7591, public clients, https or http-loopback redirect URIs |
| `POST /oauth/revoke` | always 200; the presented token revokes itself |

## API

### Wiring and handlers

| Symbol | Kind | Purpose |
|---|---|---|
| `appendOAuthServer(ctx, opts)` | function | write `cfg.oauth` (resource paths stored without the leading slash), register the pending and DCR resources if absent, mount the routes |
| `appendOAuthRoutes(ctx)` | function | the `Loading`-stage middleware mounting the raw routes |
| `loadConsent(protocol)`, `approveConsent(protocol)`, `denyConsent(protocol)` | handler makers | consent API; `approve`/`deny` call `refuseTokenAuth` and take the organization from `makeEntityScope(req).requireEntityKey()` |
| `handleAuthorize`, `handleDeviceAuthorization`, `handleToken`, `handleRegister`, `handleRevoke` | functions | endpoint logic, returning outcome objects; exported for tests |
| `makeOAuthDcrClientResource(dbAlias?)` | function | Mongo resource for DCR clients (unique `clientId`, TTL on `expiresAt`) |

### Per-context helpers (memoized per context)

| Symbol | Members |
|---|---|
| `oauthMetadataOf(ctx)` / `makeOAuthMetadataHelper` | `resolveOAuthUrl`, `authorizationServerMetadata`, `requireIssuer`, `isKnownResource`, `protectedResourceMetadata`, `protectedResourceChallenge` |
| `oauthPendingOf(ctx)` / `makeOAuthPendingHelper` | request CRUD, `resolveRequestRef`, `requirePending`, user/device-code indexes, `createAuthorizationCode`, `takeAuthorizationCode` |
| `oauthClientsOf(ctx)` / `makeOAuthClientsHelper` | `staticClientOf`, `dcrClientOf`, `registerDcrClient`, `resolveClient` |
| `oauthMintOf(ctx)` / `makeOAuthMintHelper` | `tokenNameOf({ clientName, label })`, `mint(subject, resource, meta)` |

### Stateless helpers

| Symbol | Members |
|---|---|
| `cimdHelper`, `createCimdHelper()` | `fetchClientIdMetadataDocument`, `forgetCachedClientIdMetadataDocument` (tests only) |
| `ssrfHelper`, `createSsrfHelper()` | `isPrivateAddress`, `assertPublicHostname` |

Deprecated (`compat:factory-refactor`): `authorizationServerMetadata(ctx)`, `isKnownResource(ctx, r)`,
`protectedResourceMetadata(ctx, path)`, `protectedResourceChallenge(ctx, path, opts?)` — call the
`oauthMetadataOf(ctx)` members.

### Constants

| Symbol | Value |
|---|---|
| `SERVER_OAUTH` | `'server-oauth'` |
| `OAUTH_PENDING_RESOURCE` | `'oauth:pending'` |
| `OAUTH_DCR_RESOURCE`, `OAUTH_DCR_COLLECTION` | `'oauth:dcr-client'`, `'oauth-dcr-client'` |
| `PENDING_REQUEST_PREFIX`, `PENDING_CODE_PREFIX`, `PENDING_DEVICE_INDEX_PREFIX`, `PENDING_USER_CODE_INDEX_PREFIX` | `'req:'`, `'code:'`, `'dev:'`, `'usr:'` |

### Types

| Symbol | Purpose |
|---|---|
| `OAuthServerOptions` | `issuer`, `consentUrl`, `deviceUrl`, `resources`, `clients?`, `pendingResourceAlias?`, `dcrDbAlias?`, `tokenTtlSec?` (default 90 days), `allowDynamicRegistration?`, `allowClientIdMetadataDocuments?` (both default `true`) |
| `OAuthUrlOption`, `OAuthStaticClient` | lazy URL; a configured client |
| `OAuthServerConfig`, `OAuthServerContext` | `ServerConfig` with `oauth?`; the server context with the API server |
| `OAuthPendingRequestRecord`, `OAuthUserCodeIndexRecord`, `OAuthDeviceCodeIndexRecord`, `OAuthAuthorizationCodeRecord`, `OAuthPendingResource` | pending store shapes |
| `OAuthRequestStatus`, `OAuthApprovedSubject`, `OAuthDcrClientRecord` | request status, approved subject, DCR record |
| `AuthorizeOutcome`, `DeviceAuthorizationOutcome`, `RegisterOutcome`, `TokenOutcome`, `TokenRequestBody`, `MintMeta` | handler inputs and outcomes |
| `OAuthMetadataHelper`, `OAuthPendingHelper`, `OAuthPendingMatch`, `OAuthClientsHelper`, `CimdHelper`, `SsrfHelper`, `OAuthMintHelper` | helper interfaces |

## Common pitfalls

- Never put a string starting with `/` into `cfg` — the server config reader replaces such leaves
  with file contents (`ENOENT: open '/mcp'` at boot). `appendOAuthServer` strips resource paths for
  this reason; keep other path-like values out of config.
- Pass hostnames as functions of the context, not strings computed in `makeContext`.
- Mount the consent API under a guarded parent and list `approve`/`deny` in the token guard's
  `denyAliases`; a token must never approve the minting of a token.
- Without `resources` on the token guard, audience-restricted tokens are admitted everywhere.
- Register a Redis pending resource before `appendOAuthServer`, not after.
- Build the `WWW-Authenticate` header with `protectedResourceChallenge`; `Bearer, …` with a leading
  comma is malformed.
- Responses omit optional fields with no value; never send `null` for an optional string.
- The SSRF guard is a pre-flight, not a connection pin; DNS rebinding remains out of its reach.

The `server-oauth` skill covers wiring, the lazy URL and config-leaf rules, endpoints, storage,
client resolution and the consent handlers; the `oauth` skill covers the shared contracts.

## Related packages

- [`@owlmeans/oauth`](../oauth) — constants, consent protocols, client helpers and errors
- [`@owlmeans/server-auth-token`](../server-auth-token) — token issuance, `refuseTokenAuth`, the guard with `denyAliases` and `resources`
- [`@owlmeans/auth-token`](../auth-token) — the access-token record and its `audience`
- [`@owlmeans/web-oauth`](../web-oauth) — the consent, device and done screens
- [`@owlmeans/cli-auth`](../cli-auth) — a device-grant client for command-line tools
- [`@owlmeans/server-api`](../server-api) — the Fastify server the routes mount on, and `handlers()`
- [`@owlmeans/redis-resource`](../redis-resource) — optional pending-record store

<!-- owlmeans:agent-guidance:start -->
## Agent guidance

This package ships embedded agent skills under `agent-meta/`. After installing your
`@owlmeans/*` packages, run the OwlMeans agent-skills installer to place them into
your project's skill store (`.agents/skills/`):

```sh
npx @owlmeans/agent-skills@^0.1.18-rc.52
```

The embedded files are version-matched to this package release. Do not edit them
directly — they are regenerated on each publish. To contribute guidance edits,
open a PR against the source monorepo.
<!-- owlmeans:agent-guidance:end -->
