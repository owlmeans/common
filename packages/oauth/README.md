# @owlmeans/oauth

Shared OAuth 2.1 contracts for OwlMeans authorization servers and clients: the device authorization
grant (RFC 8628) and authorization code + PKCE `S256`, protected-resource (RFC 9728) and
authorization-server (RFC 8414) metadata types, Client ID Metadata Documents, the session-guarded
consent protocols, the `_oauth` consent flow, fetch-only client helpers, code and redirect-URI
formats, and the OAuth error family. It is the meeting point of three packages that never import
each other: `@owlmeans/server-oauth` (the authorization server), `@owlmeans/web-oauth` (the consent
screens) and `@owlmeans/cli-auth` (the command-line credential holder). An app imports it to declare
the consent routes, to drive a device or code sign-in from any runtime, or to catch
`SignInRequired`. It runs no server. What a grant yields is an ordinary `@owlmeans/auth-token`
access token with an audience; people signing in to an OwlMeans app itself use `@owlmeans/oidc` /
`@owlmeans/client-auth`, not this package.

## Installation

```bash
bun add @owlmeans/oauth@^0.1.18-rc.16
```

## Concepts

- **Two grants** — device authorization for a CLI or stdio MCP server (the client polls the token
  endpoint), authorization code + PKCE for a browser-capable client (the redirect carries the code).
- **Wire endpoints vs. consent API** — `/oauth/authorize`, `/oauth/token`, `/oauth/device_authorization`,
  `/oauth/register`, `/oauth/revoke` and the `.well-known` documents are raw RFC routes. Only the
  consent API (`load` / `approve` / `deny` by `:ref`) and three screens are entrypoints.
- **Consent flow** — `oauthFlow` (`_oauth`): `verify` → `consent` → (`sign-in` → `consent`) → `done`.
  It is suspended around sign-in and never rides `?flow=` on the dispatcher.
- **Polling outcome** — `pollDeviceToken` answers `authorized` / `denied` / `expired` / `aborted`;
  only a wire fault throws.
- **User code** — `XXXX-XXXX` over `BCDFGHJKLMNPQRSTVWXZ`; the `device_code` is never shown and is
  stored only as a hash.
- **Redirect matching** — loopback hosts match on any port (RFC 8252 §7.3); everything else must be
  byte-identical.

## Usage

### Declare the consent surface

Mount it under a guarded parent (an account section) so only the person's own session can approve.

```typescript
import { makeOAuthProtocols } from '@owlmeans/oauth'

export const oauthProtocols = makeOAuthProtocols({ parent: account.base })   // path defaults to '/oauth-consent'

context.registerEntrypoints(oauthProtocols)
```

The app also lists `oauthProtocols.approve` / `.deny` in the access-token guard's deny list, so a
token can never approve the minting of another token.

### Device sign-in from a CLI

```typescript
import { oauthClientHelper, signInRequired } from '@owlmeans/oauth'

const server = await oauthClientHelper.discoverAuthorizationServer('https://api.example.com')
const auth = await oauthClientHelper.requestDeviceAuthorization(server, {
  client_id: 'https://example.com/oauth/cli.json', resource: 'https://api.example.com', device_name: 'laptop',
})

console.error(`Open ${auth.verification_uri} and enter ${auth.user_code}`)

const outcome = await oauthClientHelper.pollDeviceToken(server, {
  clientId: 'https://example.com/oauth/cli.json',
  deviceCode: auth.device_code,
  interval: auth.interval,
  expiresAt: Date.now() + auth.expires_in * 1000,
})

if (outcome.status === 'authorized') {
  useToken(outcome.token)
}
```

`@owlmeans/cli-auth` wraps exactly this with a credentials file, a lock and background polling;
when it stops waiting it throws `signInRequired({ url, code, expiresAt })`.

### Authorization code + PKCE

```typescript
import { oauthClientHelper, pkceHelper } from '@owlmeans/oauth'

const { verifier, challenge } = pkceHelper.createPkcePair()
// send the browser to server.authorization_endpoint with code_challenge=challenge&code_challenge_method=S256

const token = await oauthClientHelper.exchangeAuthorizationCode(server, {
  code, redirectUri, clientId, codeVerifier: verifier, resource: 'https://api.example.com/mcp',
})
```

### Codes and redirect URIs on the server side

```typescript
import { oauthFormatHelper } from '@owlmeans/oauth'

const deviceCode = oauthFormatHelper.createDeviceCode()
const stored = oauthFormatHelper.hashDeviceCode(deviceCode)       // store this, never the plaintext
const userCode = oauthFormatHelper.createUserCode()               // 'BCDF-GHJK'
oauthFormatHelper.normalizeUserCode('bcdfghjk')                   // 'BCDF-GHJK'

oauthFormatHelper.matchesRedirectUri('http://127.0.0.1/cb', 'http://127.0.0.1:53111/cb')   // true
```

## API

### Helpers and functions

| Symbol | Kind | Purpose |
|---|---|---|
| `makeOAuthProtocols(opts?)` | function | `OAuthEntrypoints`: `base`, `load` (GET `/:ref`), `approve`/`deny` (POST `/:ref/approve\|deny`), `consentScreen`, `deviceScreen`, `doneScreen` (sticky frontend routes) |
| `oauthClientHelper`, `createOAuthClientHelper()` | helper | `discoverProtectedResource`, `discoverAuthorizationServer` (refuses issuer mismatch and missing `S256`), `requestDeviceAuthorization`, `exchangeAuthorizationCode`, `pollDeviceToken`, `revokeToken` — `fetch` only |
| `pkceHelper`, `createPkceHelper()` | helper | `createPkcePair`, `challengeFor`, `verifyPkce` |
| `oauthFormatHelper`, `createOAuthFormatHelper()` | helper | `createOpaqueSecret`, `hashOAuthSecret`, `createDeviceCode`, `hashDeviceCode`, `createUserCode`, `normalizeUserCode`, `hostOf`, `isLoopbackHost`, `matchesRedirectUri` |
| `oauthFlow`, `oauthFlowProvider` | flow | the `_oauth` `ShallowFlow` and a one-flow `FlowProvider` |
| `OAuthFlowStep` | enum | `Verify`, `Consent`, `SignIn`, `Done` |
| `signInRequired({ url, code?, expiresAt? })` | function | builds a `SignInRequired` with fields set and `<url> <code>` in the message |
| `ConsentParamsSchema` | AJV schema | `{ ref }`, 1–128 characters |
| `discoverAuthorizationServer`, `requestDeviceAuthorization`, `pollDeviceToken`, `revokeToken` | deprecated functions | `compat:factory-refactor` wrappers — call `oauthClientHelper` members |

### Errors

All extend `OAuthError` (a `ResilientError`) and are registered for marshalling.

| Symbol | Meaning |
|---|---|
| `OAuthError` | base; also wire faults such as `as-metadata:issuer-mismatch` |
| `OAuthRequestNotFound`, `OAuthRequestExpired` | the consent `ref` is unknown or past its TTL |
| `OAuthInvalidClient`, `OAuthInvalidRedirectUri` | the client or its redirect does not check out |
| `OAuthAccessDenied` | the person denied |
| `OAuthPending` | authorization still pending |
| `SignInRequired` | not approved yet; `url`, `code`, `expiresAt` set by `signInRequired()` |
| `TokenRejected` | a presented token was refused |

### Constants

| Group | Symbols |
|---|---|
| Aliases | `oauth` (`base`, `load`, `approve`, `deny`, `consentScreen`, `deviceScreen`, `doneScreen`) |
| Screen paths | `OAUTH_CONSENT_PATH`, `OAUTH_DEVICE_PATH`, `OAUTH_DONE_PATH` |
| Wire paths | `OAUTH_AUTHORIZE_PATH`, `OAUTH_TOKEN_PATH`, `OAUTH_DEVICE_AUTHORIZATION_PATH`, `OAUTH_REGISTER_PATH`, `OAUTH_REVOKE_PATH`, `OAUTH_AS_METADATA_PATH`, `OAUTH_PRM_PATH_PREFIX` |
| Protocol values | `DEVICE_CODE_GRANT_TYPE`, `AUTHORIZATION_CODE_GRANT_TYPE`, `PKCE_METHOD_S256`, `OAUTH_TOKEN_AUTH_METHOD_NONE` |
| Lifetimes | `OAUTH_REQUEST_TTL_SEC` (600), `OAUTH_CODE_TTL_SEC` (60), `OAUTH_DEFAULT_TOKEN_TTL_SEC` (90 days), `OAUTH_DEVICE_POLL_INTERVAL_SEC` (5), `OAUTH_DEVICE_SLOW_DOWN_STEP_SEC` (5) |
| Codes | `OAUTH_USER_CODE_ALPHABET`, `OAUTH_USER_CODE_GROUP_LENGTH`, `OAUTH_USER_CODE_GROUPS`, `OAUTH_DEVICE_CODE_BYTES` |
| CIMD / DCR | `CIMD_MIN_CACHE_SEC`, `CIMD_MAX_CACHE_SEC`, `CIMD_MAX_BYTES`, `CIMD_FETCH_TIMEOUT_MS`, `OAUTH_DCR_MAX_REDIRECT_URIS`, `OAUTH_DCR_CLIENT_TTL_MS` |
| Length limits | `OAUTH_CLIENT_ID_MAX`, `OAUTH_STATE_MAX`, `OAUTH_RESOURCE_MAX`, `OAUTH_SCOPE_MAX`, `OAUTH_REDIRECT_URI_MAX`, `OAUTH_DEVICE_NAME_MAX`, `OAUTH_CODE_VERIFIER_MIN`, `OAUTH_CODE_VERIFIER_MAX` |
| Flow | `OAUTH_FLOW` (`'_oauth'`), `OAUTH_PAYLOAD_KIND`, `OAUTH_PAYLOAD_REF` |

### Types

Clients and resources: `OAuthClientOrigin`, `OAuthClientRecord`, `OAuthDcrClientRecord`,
`OAuthResourceConfig`, `ClientIdMetadataDocument`, `ClientRegistrationRequest`,
`ClientRegistrationResponse`. Metadata: `ProtectedResourceMetadata`, `AuthorizationServerMetadata`.
Grants: `DeviceAuthorizationRequest`, `DeviceAuthorizationResponse`, `AuthorizeQuery`,
`AuthorizationCodeTokenRequest`, `DeviceCodeTokenRequest`, `OAuthTokenRequest`, `OAuthTokenSuccess`,
`OAuthTokenErrorCode`, `OAuthTokenError`, `OAuthTokenResponse`, `RevokeTokenRequest`. Consent:
`OAuthRequestKind`, `ConsentParams`, `ConsentView`, `ConsentDecisionResult`, `OAuthEntrypoints`,
`OAuthEntrypointOptions`. Client side: `PendingDeviceAuthorization`, `DeviceSignInOutcome`,
`PollDeviceTokenOptions`, `PkcePair`, and the helper interfaces `OAuthClientHelper`, `PkceHelper`,
`OAuthFormatHelper`.

## Common pitfalls

- A token must never approve, deny or mint a token: add `approve`/`deny` to the token guard's deny
  list.
- Do not treat `denied`/`expired`/`aborted` from `pollDeviceToken` as exceptions — they are outcomes.
- Construct `SignInRequired` through `signInRequired()`; the constructor takes only a message, so the
  fields would be missing.
- Never show or store the plaintext `device_code`; store `hashDeviceCode(...)`.
- Keep `_oauth` flow payload values free of commas — the payload is CSV-joined without escaping.
- In tests, pass `interval` in fractions of a second and `slowDownStepSec` explicitly rather than
  waiting out the RFC default.

The `oauth` skill covers the grants, the wire-vs-entrypoint split, the polling contract and the
`_oauth` flow.

## Related packages

- [`@owlmeans/server-oauth`](../server-oauth) — the authorization server: wire routes, consent handlers, client resolution
- [`@owlmeans/web-oauth`](../web-oauth) — the consent, device and done screens
- [`@owlmeans/cli-auth`](../cli-auth) — the command-line credential holder over the device grant
- [`@owlmeans/auth-token`](../auth-token) — the access token a grant issues, with its `audience`
- [`@owlmeans/flow`](../flow) — `ShallowFlow` / `FlowProvider` behind the `_oauth` flow
- [`@owlmeans/error`](../error) — `ResilientError`, the base of the OAuth errors

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
