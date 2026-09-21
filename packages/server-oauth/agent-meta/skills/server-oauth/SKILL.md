---
name: server-oauth
description: How to use @owlmeans/server-oauth — the OAuth 2.1 authorization server for an OwlMeans backend: appendOAuthServer, the raw Fastify routes (RFC 8414/9728 metadata, authorize, device_authorization, token, register, revoke), static/CIMD/DCR clients and the SSRF guard, the pending-record store, the session-guarded consent handlers, protectedResourceChallenge for resource servers, and the lazy URL options. Auto-invoked when adding sign-in-by-browser to an API, mounting the consent handlers, giving an MCP/URL host a 401 challenge, or diagnosing a boot crash on `open '/mcp'`.
user-invocable: false
---
<!-- AUTO-GENERATED — do not edit. Regenerate via sync-agent-meta. -->

# @owlmeans/server-oauth

**Layer:** Server
**Install:** `"@owlmeans/server-oauth": "^0.1.18-rc.2"` in `dependencies`
**Contracts:** `@owlmeans/oauth` — constants, protocols, client helpers, errors
**Issues through:** `@owlmeans/server-auth-token` (`issueAccessToken`, `refuseTokenAuth`)

## Key Exports

| Export | Description |
|--------|-------------|
| `appendOAuthServer(ctx, opts)` | Write `cfg.oauth`, register the pending store and DCR store if absent, mount the routes |
| `appendOAuthRoutes(ctx)` | The `Loading`-stage middleware that mounts the raw routes (called by the above) |
| `loadConsent` · `approveConsent` · `denyConsent` | Handler makers for `makeOAuthProtocols().load/approve/deny` — `bind` them onto the app's protocols |
| `protectedResourceChallenge(ctx, resourcePath, { error? })` | The `WWW-Authenticate` value for a resource server: `Bearer [error="…", ]resource_metadata="…"` |
| `authorizationServerMetadata` · `protectedResourceMetadata` · `requireIssuer` · `isKnownResource` · `resolveOAuthUrl` | Metadata and the lazy resolver |
| `resolveClient` · `staticClientOf` · `fetchClientIdMetadataDocument` · `dcrClientOf` · `registerDcrClient` · `makeOAuthDcrClientResource(dbAlias?)` | Client sources |
| `assertPublicHostname` · `isPrivateAddress` | The SSRF pre-flight |
| `handleAuthorize` · `handleDeviceAuthorization` · `handleToken` · `handleRegister` · `handleRevoke` · `mint` | The endpoint logic, exported for tests |
| `OAUTH_PENDING_RESOURCE` (`oauth:pending`) · `OAUTH_DCR_RESOURCE` (`oauth:dcr-client`) | Resource aliases |
| `OAuthServerOptions` · `OAuthStaticClient` · `OAuthUrlOption` · `OAuthServerConfig` · `OAuthServerContext` | Types |

## Wiring

```typescript
appendOAuthServer(context, {
  issuer: apiOrigin,                       // OAuthUrlOption — a FUNCTION of the context
  consentUrl: ctx => makeSecurityHelper(ctx).makeUrl(ctx.cfg.services[WEB]!, OAUTH_CONSENT_PATH),
  deviceUrl:  ctx => makeSecurityHelper(ctx).makeUrl(ctx.cfg.services[WEB]!, OAUTH_DEVICE_PATH),
  resources: [{ resource: apiOrigin }, { resource: mcpResource, path: '/mcp' }],
  clients: [{ clientId: 'my-cli', clientName: 'My CLI',
              redirectUris: ['http://localhost/callback', 'http://127.0.0.1/callback'] }],
  dcrDbAlias: AUTH_IDENTITY_DB_ALIAS,      // the alias the identity/token resources use
})
```

Options: `tokenTtlSec` (default `OAUTH_DEFAULT_TOKEN_TTL_SEC`, 90 days), `pendingResourceAlias`,
`allowDynamicRegistration` and `allowClientIdMetadataDocuments` (both default on).

The app must also: bind `loadConsent`/`approveConsent`/`denyConsent` under a **guarded** parent
(`makeOAuthProtocols({ parent })`), put `approve` and `deny` in the token guard's `denyAliases`,
register `@owlmeans/server-auth-token`'s resources and guard, and give the guard `resources` so
audiences are enforced (below).

## Every URL option is lazy — and no cfg leaf may be path-like

Two config-timing rules, both learned from a crash:

1. **`OAuthUrlOption = string | ((ctx) => string)`, resolved per call (`resolveOAuthUrl`).**
   `appendOAuthServer` runs from `makeContext`, before the config middleware has swapped file
   pointers (`services[X].host` is a mounted-secret file path until the Configuration stage).
   Baking a hostname in at registration reads a path or nothing. A function calling
   `makeSecurityHelper(ctx).makeUrl(ctx.cfg.services[X]!, path?)` resolves at request time; omit
   `path` for a bare origin with no trailing slash.
2. **The server config reader (`fileConfigReader`, `@owlmeans/server-context`) replaces EVERY string
   leaf of `cfg` that starts with `/` or `file://` by the contents of that file** — it walks
   `cfg.oauth` like everything else. A resource `path: '/mcp'` therefore killed the API at boot with
   `ENOENT: open '/mcp'`. `appendOAuthServer` stores each resource `path` **without its leading
   slash**, and `resourceConfigFor` compares slash-insensitively, so callers may still write
   `path: '/mcp'`. Never put a path-like string in `cfg` (in this package or any other) — keep such
   values as segments without a slash, in a function, or in code. `tests/config-reader.spec.ts`
   walks `cfg.oauth` for exactly these leaves; unit tests do not run the reader, so only a test
   like it, or a live deploy, can catch the mistake.

## Endpoints — raw Fastify routes, never entrypoints

Mounted by a `Loading`-stage context middleware inside one encapsulated `server.register(...)`
plugin that adds its own `application/x-www-form-urlencoded` parser (server-api registers none, and
a global one would change every other route). The RFCs fix the wire formats, so these cannot be
entrypoints.

| Route | Behaviour |
|---|---|
| `GET /.well-known/oauth-authorization-server` | RFC 8414. `S256` only, auth method `none`, both grants, `client_id_metadata_document_supported`, `authorization_response_iss_parameter_supported`; `registration_endpoint` only when DCR is on. `cache-control: public, max-age=3600` |
| `GET /.well-known/oauth-protected-resource[/<path>]` | RFC 9728, one document per configured resource. Registered as an exact route plus a `/*` route (no ambiguous wildcard); an undeclared path answers 404 |
| `GET /oauth/authorize` | Validates client and `redirect_uri` first; a bad one answers 400 text and **never redirects**. Then checks `response_type`, PKCE `S256`, `resource` — those errors go to the verified redirect with `state` and `iss`. Stores `req:<id>` and 302s to `consentUrl?ref=<id>` |
| `POST /oauth/device_authorization` | RFC 8628: `device_code`, `user_code`, `verification_uri` = `deviceUrl`, `verification_uri_complete` = `deviceUrl?user_code=…`, `expires_in` 600, `interval` 5; `device_name` (extension) is capped at `OAUTH_DEVICE_NAME_MAX` |
| `POST /oauth/token` | Code grant: `take` of `code:<sha256>` (single use — a replay reads exactly like a wrong code), then exact `redirect_uri`, PKCE, client re-check. Device grant: `authorization_pending`, `slow_down`, `access_denied`, `expired_token`, or the token delivered once. `cache-control: no-store` |
| `POST /oauth/register` | RFC 7591, public clients only: 1–`OAUTH_DCR_MAX_REDIRECT_URIS` URIs, https or http-loopback, no fragments |
| `POST /oauth/revoke` | RFC 7009: 200 for any token; the presented token revokes itself (hash lookup, idempotent) |

## Storage

All short-lived records live in **one resource** (`OAUTH_PENDING_RESOURCE`) as id-namespaced shapes:
`req:<id>` (the request both grants build the consent screen from), `usr:<user_code>` and
`dev:<sha256(device_code)>` (indexes onto the request id), `code:<sha256(code)>` (single-use, TTL
`OAUTH_CODE_TTL_SEC`). An app that wants Redis registers `makeRedisResource(OAUTH_PENDING_RESOURCE)`
**before** `appendOAuthServer`; otherwise a `static-resource` fallback is registered (same rule as
`AUTH_CACHE`). Every write passes an absolute TTL again — a redis `update` drops it. **Secrets are
stored only hashed:** `hashOAuthSecret` for a device code and an authorization code, the same reason
an access token is.

DCR clients live in `makeOAuthDcrClientResource(dbAlias)`, a mongo-resource with a unique
`clientId` index and a real TTL index on `expiresAt`; use bumps `lastUsedAt`, so activity, not
registration, keeps a client alive (`OAUTH_DCR_CLIENT_TTL_MS`).

## Clients — resolved in this order

1. **Static** (`cfg.oauth.clients`) — never fetched, never expiring; the deployment's own CLI/MCP.
2. **CIMD** — an `https` `client_id` with a real path (no fragment, credentials or dot segments) is
   fetched: `assertPublicHostname` pre-flight (refuses loopback, RFC 1918, link-local, ULA, incl.
   IPv4-mapped IPv6), `redirect: 'manual'`, `CIMD_FETCH_TIMEOUT_MS`, `CIMD_MAX_BYTES` enforced while
   reading, and the document's `client_id` must equal the URL. Cached for its `max-age` clamped to
   `CIMD_MIN_CACHE_SEC`–`CIMD_MAX_CACHE_SEC`; failures are never cached, and a refusal returns
   `null`, never a throw. The guard is a pre-flight, not a connection pin — DNS rebinding is out of
   its reach.
3. **DCR** — the mongo store, if registered.

The consent screen says how a client is known (`static`, `cimd` with the `client_id` host, `dcr`
"unverified") and warns when every registered redirect is loopback (`localhostOnly`).

## The token's name, and the wire's nulls

An issued token is named `tokenNameOf({ clientName, label })` — `"Viable MCP · my-laptop"`, the label
being the device name (device grant) or the redirect host (code grant), at most `AUTH_TOKEN_NAME_MAX`
characters. That name is the only thing that tells one connector's token from another when the person
revokes one in Settings, so it names the client and the place, never the protocol. A registration
(and any other) response **omits** an optional field it has no value for — a client that validates
the body (the MCP SDK does) rejects `null` for an optional string.

## Consent handlers

`load` returns a `ConsentView`. `approve` calls `refuseTokenAuth(req, …)` first, snapshots the
subject from `req.auth` + `requireEntityKey(req)` (never from a token payload), then:
device grant — **mints immediately** (`mint` → `issueAccessToken`) and stores the token on the
request for exactly one delivery to the poller; code grant — mints nothing, stores a hashed
single-use code carrying the subject, deletes the request and answers `{ redirect }` with `code`,
`state` and `iss`. `deny` mirrors it with `error=access_denied` (a device request is left `denied`
so the next poll answers `access_denied`). A `:ref` is a request id **or** a normalised user code
(`resolveRequestRef`). The token record's name and `audience` are set in `mint`
(`audience = [resource]` when the request named one; none otherwise), `expiresIn` is
`cfg.oauth.tokenTtlSec`, and scopes only ever narrow the subject's own (`issueAccessToken`).

## Resource servers

`protectedResourceChallenge(ctx, '/mcp', { error: 'invalid_token' })` builds the 401
`WWW-Authenticate` header — space after `Bearer`, comma only between parameters (a leading
`Bearer, …` is malformed and some clients silently fail on it). Every resource server (the URL MCP
host, the REST API) calls it rather than composing the header. Audience is enforced by the guard:
give `makeAuthTokenGuard`/`appendAuthTokenGuard` a `resources` option (a list or a function of the
context); a token with an `audience` is admitted only where the lists intersect, and a token with
none (hand-made) is admitted everywhere.

## Testing

Category B: `bun test ./tests` with real `static-resource` stores, no Redis or Mongo
(`tests/context.ts` builds the context; the route-mounting middleware is never fired). Specs cover
the code flow, the device flow (incl. `slow_down`), clients (static/CIMD/DCR), metadata, revoke,
SSRF, lazy URLs, the config-reader leaf check, and `routes.spec.ts` — real Fastify `inject`
against the mounted routes (form parser, redirects, headers). Use public IP literals for CIMD test
URLs so no DNS is needed.
