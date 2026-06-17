---
name: auth-protocol
description: Comprehensive reference for the OwlMeans authentication and authorization protocol — Ed25519 path, OIDC path, provider-backed local identity, core types, errors, guards, gates, trust resource, envelope shape, refresh flow, and mocking points. Auto-invoked when files under auth*, *oidc*, server-auth-identity, did*, wled, client-payment are touched.
---

# OwlMeans Auth Protocol

This skill is the canonical reference for how authentication and authorization work across the monorepo. Read it before refactoring auth code, adding a new guard, or extending the auth-related packages.

## Protocol paths

The system supports multiple authentication paths that share the same `Auth` and `Authorization` types and the same envelope shape but diverge in the first half of the flow.

### Ed25519 (self-signed)

Use case: service-to-service, wallet provider, backend clients, high-security browser-issued tokens.

1. **Allowance**: client posts `AllowanceRequest` (a partial `AuthPayload`) to `/authentication/init`. Server returns `AllowanceResponse { challenge }`.
2. **Credential generation**: client builds `AuthCredentials` (challenge + ephemeral payload), signs the canonicalized payload with its Ed25519 keypair via `packAuthCredentials()` (`@owlmeans/basic-keys`), posts to `/authentication/authenticate`.
3. **Token exchange**: server resolves the signer from the `TRUSTED` config resource via `trust()` (`@owlmeans/auth-common`), verifies the signature, builds an `Auth`, wraps it in an `EnvelopeModel` of type `ed25519-basic-token` signed with the service's own key, and returns the tokenized envelope.
4. **Bearer**: client sends `Authorization: ED25519-BASIC-TOKEN <encoded>`.
5. **Server verification**: incoming requests hit `makeBasicEd25519Guard` (`@owlmeans/auth-common`) which `match`-es the header, `unpack`-s the envelope, and `handle`-s by resolving an `Auth` into the response.

### OIDC (delegated)

Use case: browser clients, third-party IdP integration, multi-tenant SaaS.

1. Standard OAuth2 code flow via `makeOidcGuard` (`@owlmeans/oidc`).
2. Server validates the ID token, wraps the resulting `Auth` in an envelope of type `oidc-wrapped-token` signed with the service key.
3. Subsequent requests carry the wrapped token; the OIDC guard verifies the envelope signature and freshness.
4. Refresh: `wrapper().update()` (`@owlmeans/oidc`) exchanges a stale token transparently — alias `TOKEN_UPDATE` (`@owlmeans/auth-common`).

### Provider-Backed Local Identity

Use case: apps such as `product-viable` that use Google/OIDC as login bootstrap but authorize against local product identity.

1. Browser imports `@owlmeans/web-oidc-rp/auth/plugins`, which registers OIDC and Google plugins in `@owlmeans/client-auth`.
2. The plugin persists auth control state, redirects to the provider, restores state on return, and submits code/query params as `AuthCredentials`.
3. Server exchanges the provider code through `@owlmeans/server-oidc-rp` and maps `ProviderProfileDetails` through `@owlmeans/server-auth-identity`.
4. `AUTH_IDENTITY_ACCOUNT`, `AUTH_IDENTITY_PROFILE`, and `AUTH_IDENTITY_CREDENTIALS` store local account/profile/provider-link data.
5. Server returns a normal OwlMeans bearer token. Downstream product gates authorize against local profile scopes, not against `OIDC_GATE`.

## Core types

Exported from `@owlmeans/auth`:

- `Auth` (l. 110) — the full authenticated identity, includes `token`, `userId`, `role`, `scopes`, `permissions?`, `attributes?`, `entityId?`, `createdAt`, `isUser`.
- `AuthPayload` (l. 27) — minimal identity tuple; `Auth extends AuthPayload`.
- `AuthCredentials` (l. 3) — challenge/response pair signed during authentication.
- `Authorization` (l. 77) — RBAC primitive: `entityId?`, `scopes`, `permissions?`, `attributes?`, `permissioned?`, `denormalized?`.
- `AllowanceRequest` (l. 150) — partial `AuthPayload` triggering challenge generation.
- `AllowanceResponse` (l. 172) — `{ challenge }`.
- `AuthToken` (l. 176) — `{ token }`, used in module query auth.
- `PermissionSet` (l. 134) / `Capabilties` (l. 141) / `AttributeSet` (l. 145) — scope-bound capability shapes.

## Enums and constants

`@owlmeans/auth` constants:

- `AuthRole` — **string** enum: `User`, `Guest`, `Service`, `System`, `Admin`, `Superuser`, `Blocked`. Never use numeric literals for `role` fields — always use `AuthRole.User` etc.
- `AuthenticationType` — `BasicEd25519`, `OneTimeToken`, `ReCaptcha`, `WalletDid`, `RelyHandshake`, `WalletConsumer`, `WalletProvider`.
- `AuthroizationType` (sic) — `AuthToken`, `Ed25519BasicToken`, `Ed25519BasicSignature`.
- `AUTH_HEADER = 'authorization'`, `AUTH_QUERY = 'token'`, `ENTITY_QUERY = 'entity'`, `PROFILE_QUERY = 'profile'`.

`@owlmeans/auth-common` constants:

- `DEF_AUTH_SRV = 'auth'` and its alias `DEFAULT_GUARD = 'auth'`.
- `TOKEN_UPDATE = 'auth-token-refresh'`.
- `DISPATCHER_PATH = '/dispatcher'`.

`@owlmeans/oidc` constants:

- `OIDC_GATE = 'oidc-gate'` — the `gate(...)` value to attach OIDC enforcement to a module.
- `GOOGLE_CLIENT_AUTH = 'google-oauth'` — browser plugin type for Google OAuth.
- `GOOGLE_SERVICE = 'google'` — provider service key used by backend config and identity linking.

For apps that use OIDC/Google only as a login provider and then authorize against local identity resources, declare a product-specific gate alias instead of reusing `OIDC_GATE`.

## Errors

`@owlmeans/auth` exports: `AuthError`, `AuthManagerError`, `AuthenFailed`, `AuthenExists`, `AuthenPayloadError`, `AuthPluginError`, `TypeMissmatchError`, `AuthorizationError`, `AuthForbidden`, `ProfileError`, `ProfileConsistencyError`. Each is i18n-aware via `@owlmeans/error`.

## Guard interface

`GuardService` (`@owlmeans/entrypoint`):

```ts
export interface GuardService extends InitializedService {
  token?: string                                           // client-side
  authenticated: (req?: Partial<AbstractRequest>) => Promise<string | null>
  match: EntrypointMatch                                   // server-side
  handle: EntrypointHandler
}
```

`AuthService extends GuardService` with `authenticate(token)`, `update(token)`, `user()`, `store<T>()` — see `@owlmeans/auth-common`.

Guards are services registered on the context under their alias (`DEFAULT_GUARD` = `'auth'` is the canonical alias). A request is matched and handled by the guard whose `match()` returns `true`; `handle()` resolves an `Auth` into the response via `res.resolve(auth)`.

## Trust resource

`trust()` (`@owlmeans/auth-common`):

```ts
export const trust = async (context, resource, userName, field = 'name') => {
  const trustedUser = await context.resource<Resource<TrustedRecord>>(resource).load(userName, field)
  /* …keyPair derived from trustedUser.secret or trustedUser.credential… */
}
```

`TrustedRecord` (`@owlmeans/auth-common`) extends `Profile` minus `permissions` / `attributes`. The `TRUSTED` config resource is the system's source of truth for known signing identities — the auth service, peer services, wallet providers, etc.

## Envelope shape

`@owlmeans/basic-envelope` envelope type:

```
{
  t: string                    // type, e.g. "ed25519-basic-token", "oidc-wrapped-token"
  msg: string                  // base64(JSON.stringify(payload)) or raw string
  sig?: string                 // signature over {t, msg, dt, ttl}
  dt: number                   // creation timestamp (ms)
  ttl: number | null           // time-to-live (ms); null = no expiry
}
```

`makeEnvelopeModel(type, kind?)` (`@owlmeans/basic-envelope`) builds a model with `send(msg, ttl)`, `sign(key, kind?)`, `verify(key)`, `tokenize()`, `wrap()`. `EnvelopeKind.Token` produces a string for HTTP headers; `EnvelopeKind.Wrap` produces a transport-friendly object.

## Key model

`KeyPairModel` (`@owlmeans/basic-keys`):

```ts
export interface KeyPairModel {
  sign: (data) => Promise<string>
  verify: (data, signature) => Promise<boolean>
  export: () => string         // private, "ed25519:<base64>"
  exportPublic: () => string   // public,  "ed25519:<base64>"
  exportAddress: () => string
  encrypt / decrypt / dcrpt
}
```

`makeKeyPairModel(input?)` (`@owlmeans/basic-keys`) accepts a `KeyPair`, an `ed25519:<base64>` string, or `undefined` for random. `fromPubKey(credential)` builds a public-only model. `packAuthCredentials(auth, extra, signer)` signs an `AuthCredentials` for the Ed25519 path.

## Setup wiring

Server-side:
- `setupAuthServiceModules(modules, serviceAlias, prefix?)` (`@owlmeans/server-oidc-rp`) — registers provider list and token-update routes.
- `makeAuthService(alias)` (`@owlmeans/server-auth`) — factory for the server `AuthService`.
- `makeOidcWrappingService`, `makeOidcGate` — wire OIDC into a server context (`@owlmeans/server-oidc-rp`).

Client-side:
- `setupExternalAuthentication(service)` (`@owlmeans/client-auth`) — wire OAuth/OIDC flows for a client context.
- `appendAuthService(ctx, alias?)` (`@owlmeans/client-auth`) — attach the client auth service with persistent storage.
- `appendOidcGuard()`, `setupOidcGuard()` — `@owlmeans/web-oidc-rp` for browser-side.

Local identity:
- `appendAuthIdentityResources(context)` — registers identity account/profile/credentials resources and the linking service.
- `AUTH_IDENTITY_LINKING` — service that maps provider profile details into an `AuthPayload`.
- `AUTH_IDENTITY_PROFILE` — durable authorization profile with `entityId`, `role`, `scopes`, and optional expiry.

Read identity records with `load()` or `list()`. Do not use `pick()` for authorization lookups because `pick()` deletes the matching record.

## Mocking points (for category-B tests)

The protocol exposes three natural mocking boundaries. The only allowed implementation lives in `@owlmeans/test-auth`:

1. **Guard substitution.** Replace the guard service in the context with `makeMockGuard({ auth })` so `match` always hits and `handle` resolves a chosen `Auth`. This bypasses signature verification entirely — useful when the spec is about behaviour downstream of authentication.
2. **TRUSTED resource substitution.** Register `makeMemoryTrustedResource([records])` so `trust()` finds whichever signers your spec needs without touching real config.
3. **Fixture keys + envelopes.** `makeFixtureKeyPair(seed)` returns a deterministic `KeyPairModel`. `signMockEnvelope(msg, type, kind?, kp?)` produces a properly-signed envelope using a fixture key. `makeBearer(auth, kp?)` returns a header value `ED25519-BASIC-TOKEN <encoded>`.

The protocol does **not** ship a fake JWKS server. For OIDC-end-to-end tests, exercise the real `makeOidcGuard` against an in-memory trusted resource and a fixture keypair. If a downstream test needs a hostable IdP fake, add it to `@owlmeans/test-auth` (don't roll one in a per-package `tests/`).

## OIDC dependency boundary and pinned versions

The OIDC packages wrap four upstream libraries. **No upstream type from those libraries is re-exported** through any `@owlmeans/*` package's public index. All public contracts use OwlMeans-owned types; the mapping layer is confined to each package's `src/service.ts`.

Current exact pins (see [[oidc-versions]] for full upgrade checklist):
- `oidc-provider@9.8.4` — in `@owlmeans/server-oidc-provider`
- `jose@6.2.3` — in `server-oidc-provider` and `server-oidc-rp`
- `openid-client@6.8.4` — in `@owlmeans/server-oidc-rp`
- `oidc-client-ts@3.5.0` — in `@owlmeans/web-oidc-rp` and `@owlmeans/mui-oidc-rp`
