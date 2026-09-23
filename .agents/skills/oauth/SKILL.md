---
name: oauth
description: How to use @owlmeans/oauth — the shared layer of OwlMeans OAuth sign-in: the two grants (device authorization RFC 8628, authorization code + PKCE S256), the consent protocols (makeOAuthProtocols), the `_oauth` flow, fetch-only client helpers (discovery, device authorization, polling, revoke), user/device-code and redirect-URI matching, and the error family incl. SignInRequired. Auto-invoked when a project needs an authorization server, a browser consent screen or a CLI/MCP browser sign-in, when importing oauth constants/types/helpers, or when reasoning about which grant a client should use.
user-invocable: false
---

# @owlmeans/oauth

**Layer:** Auth shared (beside `auth-token`)
**Install:** `"@owlmeans/oauth": "^0.1.18-rc.9"` in `dependencies`
**Halves:** `@owlmeans/server-oauth` (the authorization server), `@owlmeans/web-oauth` (the consent
screens), `@owlmeans/cli-auth` (the command-line credential holder). None of the three imports
another — they meet only here.

## What sign-in yields

A regular `vib_`-style **access token** from `@owlmeans/auth-token` — listed and revocable in the
same settings screen as a hand-made one, 90 days by default (`OAUTH_DEFAULT_TOKEN_TTL_SEC`). There
are no refresh tokens and no new credential type: when it expires or is revoked the client signs in
again. What differs from a hand-made token is its **audience** (`AccessTokenRecord.audience`, RFC
8707): a token minted through a grant is scoped to the `resource` it was issued for.

## Two grants, one consent UI, one issuer

| Client | Grant | How it catches up |
|---|---|---|
| A CLI / stdio MCP server | Device authorization (RFC 8628) | HTTP polling of the token endpoint |
| An MCP URL host / any browser-capable client | Authorization code + PKCE `S256` (OAuth 2.1, MCP authorization spec) | The redirect to the client's own callback |

**Polling, not a socket, for the device grant.** There is no unauthenticated long-lived connection
to defend, the high-entropy `device_code` never leaves the polling process, the server paces the
poll with `interval` and `slow_down`, and it works over SSH and in containers.

## Key Exports

| Export | Description |
|--------|-------------|
| `oauth` | Frozen alias table: `base`, `load`, `approve`, `deny`, `consentScreen`, `deviceScreen`, `doneScreen` |
| `makeOAuthProtocols(opts?)` | The consent surface. `opts`: `parent?`, `path?` (default `/oauth-consent`), `guard?`. Returns `OAuthEntrypoints` |
| `oauthFlow` · `oauthFlowProvider` · `OAuthFlowStep` · `OAUTH_PAYLOAD_KIND` · `OAUTH_PAYLOAD_REF` | The `_oauth` flow (`OAUTH_FLOW`), its step names, payload keys, and a one-flow `FlowProvider` |
| `discoverProtectedResource(origin, path?)` · `discoverAuthorizationServer(issuer)` | RFC 9728 / RFC 8414 fetches; the second refuses an `issuer` mismatch and a server without `S256` |
| `requestDeviceAuthorization(server, body)` · `pollDeviceToken(server, opts)` · `exchangeAuthorizationCode(server, req)` · `revokeToken(server, req)` | Fetch-only clients, any runtime |
| `createPkcePair()` · `challengeFor(v)` · `verifyPkce(v, c)` | PKCE, `S256` only |
| `createOpaqueSecret` · `hashOAuthSecret` · `createDeviceCode` · `hashDeviceCode` | Secrets and their stored (SHA-256) form |
| `createUserCode()` · `normalizeUserCode(input)` | `XXXX-XXXX` over `OAUTH_USER_CODE_ALPHABET` (`BCDFGHJKLMNPQRSTVWXZ`) |
| `hostOf` · `isLoopbackHost` · `matchesRedirectUri(registered, candidate)` | Redirect-URI rules (below) |
| `OAuthError` family · `SignInRequired` · `signInRequired({url, code?, expiresAt?})` · `TokenRejected` | Errors |
| Constants | `OAUTH_*_PATH` (wire paths), `OAUTH_AS_METADATA_PATH`, `OAUTH_PRM_PATH_PREFIX`, the `*_TTL_SEC`, `OAUTH_DCR_*`, `CIMD_*`, `PKCE_METHOD_S256`, grant-type strings |
| Types | `OAuthClientRecord`, `ConsentView`, `ConsentDecisionResult`, `OAuthResourceConfig`, `AuthorizationServerMetadata`, `DeviceSignInOutcome`, request/response shapes |

## Wire endpoints are raw routes, not entrypoints

`/oauth/authorize`, `/oauth/device_authorization`, `/oauth/token`, `/oauth/register`,
`/oauth/revoke` and the two `.well-known` documents are fixed by RFCs (form bodies, un-enveloped
`{error, error_description}`, redirects), so `@owlmeans/server-oauth` mounts them as raw Fastify
routes. Only the **consent API** (`load` / `approve` / `deny`, by `:ref`) is an entrypoint tree,
mounted under whatever *guarded* parent the app chooses — an account section, so the ownership
gate that protects a person's settings protects the power to mint a credential on their behalf.
The three screens (`consentScreen`, `deviceScreen`, `doneScreen`) are parentless `sticky` frontend
routes with no `service` override: ordinary in-app screens, not a full-reload hop like `DISPATCHER`.

## Rules that hold for every grant

- **A token can never mint, approve or deny a token.** The app lists `approve`/`deny` in the token
  guard's `denyAliases`, and the handlers call `refuseTokenAuth` as well. A leaked credential must
  not survive the revocation of the credential that leaked.
- **A bad client or `redirect_uri` never redirects.** Only after the pair is checked against the
  client's own registration may an error travel back to that redirect (with `state` and `iss`).
- **`iss` on every authorization response** (RFC 9207) and `authorization_response_iss_parameter_supported`
  in the metadata — the mix-up defence.
- **PKCE is `S256` only**; codes are single-use and live `OAUTH_CODE_TTL_SEC` (60 s); a request
  lives `OAUTH_REQUEST_TTL_SEC` (600 s).
- **`device_code` is stored only as `hashDeviceCode(...)`** and never shown to a person; the
  person sees the `user_code` (`XXXX-XXXX`, no vowels, no `0/O/1/I`).
- **Redirect URIs** (`matchesRedirectUri`): loopback (`localhost`, `127.0.0.1`, `::1`) matches on
  scheme, host, path and query but **any port** (RFC 8252 §7.3); every other pair must be
  byte-identical.
- **Audience is opt-in at the guard**, never inferred: a token with an `audience` is admitted only
  by a token guard configured with `resources` that intersect it (`/server-auth-token`).

## The polling contract

`pollDeviceToken(server, { clientId, deviceCode, interval, expiresAt, signal?, onInterval?, slowDownStepSec? })`
returns a `DeviceSignInOutcome` — `authorized` (with `token`), `denied`, `expired` or `aborted`.
Those are **answers, not exceptions**; only a wire fault throws `OAuthError`. `authorization_pending`
continues, `slow_down` adds `OAUTH_DEVICE_SLOW_DOWN_STEP_SEC` (override `slowDownStepSec` in tests).
The interval is never clamped, so a test can drive it in milliseconds.

`SignInRequired` carries `url`, `code`, `expiresAt` — set by the `signInRequired()` factory, **not**
the constructor (`ResilientError.registerErrorClass` needs a plain `(message = 'error')`
constructor). It never crosses a wire; it is thrown and caught in the one waiting process.
`TokenRejected` says a presented token was refused, distinct from having none. The factory also puts
the code in the MESSAGE (`<url> <code>`), because an agent-facing phrase table (`viable-sdk`
`REFUSALS`) is handed the message alone.

## The `_oauth` flow

`oauthFlow` (name `OAUTH_FLOW = '_oauth'`) has fixed steps: `verify` (device screen, `next` →
`consent`), `consent` (`sign-in` explicit → `sign-in`; `approve` → `done`; `deny` explicit →
`done`), `sign-in` (`DISPATCHER`, `next` → `consent`), `done` (done screen). The payload is CSV-joined
with no escaping, so keys stay short (`kind`, `ref`) and values carry no commas.

It is **never** the live model on `/dispatcher` and never rides `?flow=`: the single live flow slot
belongs to OIDC sign-in. Before leaving for the dispatcher the consent screen suspends it
(`suspendFlow` in `@owlmeans/client-flow`) and the sign-in that follows resumes it
(`resumeSuspendedFlow`, via the landing rule in `/login-plugins`). Its steps address concrete
entrypoint aliases, so no `configureFlows` merge is needed, and destinations are aliases from
registered definitions — never stored URLs, so it cannot become an open redirect.

## Testing

Category A (`bun test ./tests`, no mocks): `client`, `flow`, `format` and `pkce` specs. Polling
tests pass `interval` in fractions of a second and `slowDownStepSec` explicitly. After `bun run build`
check that `build/` contains no `from '@/…'`.
