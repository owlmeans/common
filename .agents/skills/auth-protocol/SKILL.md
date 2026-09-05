---
name: auth-protocol
description: Comprehensive reference for the OwlMeans authentication and authorization protocol — the Ed25519, OIDC, provider-backed local identity, email-OTP and PK-supervisor paths, the core types and error hierarchy, guards and gates, the trust resource, the envelope shape, organization-entity resolution, the refresh flow, and the mocking points. Auto-invoked when files under auth*, *oidc*, server-auth-identity, did*, wled or client-payment are touched.
---

# OwlMeans Auth Protocol

This skill is the canonical reference for how authentication and authorization work across the monorepo. Read it before refactoring auth code, adding a new guard, or extending the auth-related packages.

## Protocol paths

The system supports multiple authentication paths that share the same `Auth` and `Authorization` types and the same envelope shape but diverge in the first half of the flow.

### Ed25519 (self-signed)

Use case: service-to-service, wallet provider, backend clients, high-security browser-issued tokens.

1. **Allowance**: client posts `AllowanceRequest` (a partial `AuthPayload`) to `/authentication/init`. Server returns `AllowanceResponse { challenge }`.
2. **Credential generation**: client builds `AuthCredentials` (challenge + ephemeral payload), signs the canonicalized payload with its Ed25519 keypair via `packAuthCredentials()` (`@owlmeans/basic-keys`), posts to `/authentication/authenticate`.
3. **Credential envelope**: the auth manager opens the signed challenge with the `AUTH_SRV_KEY` record it loads from the `TRUSTED` config resource via `trust()` (`@owlmeans/auth-common/utils`), burns the decoded challenge into `AUTH_CACHE` (create-once, so one challenge is spent once), then hands the credential to the plugin for its type. The basic-ed25519 plugin loads the caller's own `TRUSTED` record by `userId` and verifies the signature over the challenge, then rewrites the credential's `type` to `AuthenticationType.OneTimeToken` with a fresh one-time token as its challenge. The manager canonicalizes `entitySlug` through `ENTITY_RESOLVER` where one is registered, stamps its own trusted id onto `credential.credential`, and answers with an `EnvelopeModel<AuthCredentials>` of the credential's own type, signed with `AUTH_SRV_KEY`.
4. **Token exchange**: the client posts that envelope as an `AuthToken` to the consuming service's `DISPATCHER_AUTHEN` entrypoint (`/authenticate`). `makeAuthService.authenticate()` (`@owlmeans/server-auth`) verifies it against `AUTH_SRV_KEY`, burns the one-time token into its own `AUTH_CACHE`, checks that `credential.credential` names the auth manager, builds the `Auth` from the credential's `userId` / `scopes` / `role` / `profileId` / `entitySlug`, and returns it as an envelope of type `ed25519-basic-token` signed with that service's own key.
5. **Bearer**: client sends `Authorization: ED25519-BASIC-TOKEN <encoded>`.
6. **Server verification**: incoming requests hit `makeAuthService` (`@owlmeans/server-auth`), whose `match` looks for the `ED25519-BASIC-TOKEN` bearer, whose `handle` verifies the envelope against the service key and resolves the carried `Auth` into the response, and whose `unpack(token)` returns the same `Auth` outside a request.

`makeBasicEd25519Guard` (`@owlmeans/auth-common`) is a **different** mechanism on the same key material: it matches `ED25519-BASIC-SIGNATURE`, where the caller signs body + timestamp/nonce headers per request instead of presenting a bearer. See the `auth-common` skill.

### OIDC (delegated)

Use case: browser clients, third-party IdP integration, multi-tenant SaaS.

1. Standard OAuth2 authorization-code flow. The relying party redirects to the provider and the return leg exchanges the code: `makeOidcClientService` (`@owlmeans/server-oidc-rp`) replays the stored PKCE verifier and grants the token set.
2. Server decodes the ID token, builds an `Auth` from its claims, and wraps it in an envelope of type `oidc-wrapped-token` signed with the service key — the bearer is `OIDC-WRAPPED-TOKEN <encoded>`.
3. Subsequent requests are matched and handled by `makeOidcGuard` (`@owlmeans/oidc`), which verifies the envelope signature against the service key and delegates freshness to the `WRAPPED_OIDC` service.
4. Refresh: `makeOidcWrappingService` (`@owlmeans/server-oidc-rp`) re-validates the stored token set — introspection, or a refresh grant once `expires_at` has passed — and re-signs the wrapped token. When the value changes, the guard returns it in the **`TOKEN_UPDATE` response header** (`'auth-token-refresh'`, `@owlmeans/auth-common`); an empty value means the session is over. It is a header, not a route: `@owlmeans/server-api` lists it in `exposedHeaders` and `@owlmeans/api`'s client service feeds it back into `AuthService.update()`. Where the deployment has a separate auth manager, the wrapper reaches it over the `external-auth:auth:update` entrypoint that `setupAuthServiceEntrypoints` registers at `/<prefix>/auth/update`.

### Provider-Backed Local Identity

Use case: apps such as `product-viable` that use Google/OIDC as login bootstrap but authorize against local product identity.

1. Browser imports `@owlmeans/web-oidc-rp/auth/plugins`, which registers OIDC and Google plugins in `@owlmeans/client-auth`.
2. The plugin persists auth control state, redirects to the provider, restores state on return, and submits code/query params as `AuthCredentials`.
3. Server exchanges the provider code through `@owlmeans/server-oidc-rp` and maps `ProviderProfileDetails` through `@owlmeans/server-auth-identity`.
4. `AUTH_IDENTITY_ORG_ENTITY`, `AUTH_IDENTITY_ACCOUNT`, `AUTH_IDENTITY_PROFILE` and `AUTH_IDENTITY_CREDENTIALS` store the organization entity and the local account/profile/provider-link data. A second login method on the same email adds a CREDENTIAL to the person's existing profile — it never mints a second identity or a second organization.
5. Server returns a normal OwlMeans bearer token carrying the organization's `entitySlug`. Downstream product gates authorize against local profile scopes, not against `OIDC_GATE`.

### Email one-time code

Use case: passwordless sign-in where no external IdP is wanted.

1. Client posts `{ type: 'email-otp', userId: <email> }` to `/authentication/init`.
2. `@owlmeans/server-auth-otp` mails a six-digit code, stores it in Redis under a TTL, and answers with a challenge of `"<email>::<nonce>"` — the nonce is what keeps two independent attempts for one address from colliding in the manager's anti-replay cache.
3. Client posts the code as `AuthCredentials.credential`; the plugin verifies and consumes it, resolves the identity through `AUTH_IDENTITY_LINKING`, and the manager signs the credential envelope as usual.

### PK supervisor (development only)

Use case: deterministic end-to-end tests, and operator access to a development or stage environment.

1. Client posts `{ type: 'pk-supervisor', userId }` to `/authentication/init`, receiving a single-use challenge.
2. It signs `buildSupervisorPayload(challenge, userId, salt)` (`@owlmeans/auth`) with one of the project's TRUSTED private keys and posts `{ salt, signature }` as the credential.
3. The server plugin verifies the signature against the allowlisted TRUSTED records, resolves or registers the target user, and the ordinary envelope exchange finishes the flow.

Never enabled in real production — see the `supervisor-auth` skill.

## Core types

Exported from `@owlmeans/auth`:

- `Authorization` — RBAC primitive: `entitySlug?`, `scopes`, `permissions?`, `attributes?`, `permissioned?`, `denormalized?`.
- `ProfilePayload` — `Authorization` plus `groups?`.
- `AuthPayload` — `ProfilePayload` plus `type`, `role`, `userId`, `source?`, `profileId?`, `expiresAt?`.
- `AuthCredentials` — `AuthPayload` plus `challenge`, `credential`, `publicKey?`: the challenge/response pair signed during authentication.
- `Auth` — `AuthPayload` plus `token`, `isUser`, `createdAt`: the full authenticated identity a guard resolves.
- `Profile` — a stored identity record: `ProfilePayload` plus `id`, `name`, `credential?`, `secret?`.
- `AllowanceRequest` — partial `AuthPayload` with a required `type`, triggering challenge generation.
- `AllowanceResponse` — `{ challenge }`.
- `AuthToken` — `{ token }`, used in entrypoint query auth.
- `PermissionSet` / `Capabilties` / `AttributeSet` — scope-bound capability shapes.

**`entitySlug` is the only organization-entity value on the wire.** It is the customer
organization's renameable, human-readable name; the stable `entityId` an implementation keys its
rows on never appears in a token, a URL or a body. Read the slug with `entitySlugOf(payload)`
(`@owlmeans/auth`) rather than off the field.

## Enums and constants

`@owlmeans/auth` constants:

- `AuthRole` — **string** enum: `User`, `Guest`, `Service`, `System`, `Admin`, `Superuser`, `Blocked`. Never use numeric literals for `role` fields — always use `AuthRole.User` etc.
- `AuthenticationType` — how identity is proven: `BasicEd25519`, `OneTimeToken`, `ReCaptcha`, `WalletDid`, `RelyHandshake`, `WalletConsumer`, `WalletProvider`, `Google` (`'google-oauth'`), `Supervisor` (`'pk-supervisor'`).
- `AuthroizationType` (sic) — how a request carries authorization: `AuthToken`, `Ed25519BasicToken`, `Ed25519BasicSignature`.
- `AuthenticationStage` — the client flow's stage: `Error`, `Init`, `Allowence`, `Authenticate`, `Authentication`, `Authenticated`.
- `AUTH_HEADER = 'authorization'`, `AUTH_QUERY = 'token'`, `ENTITY_QUERY = 'entitySlug'`, `PROFILE_QUERY = 'profile'`.
- `DISPATCHER`, `DISPATCHER_AUTHEN`, `DISPATCHER_SURROGATE` — the return-leg and login-window entrypoint aliases.

`@owlmeans/auth-common` constants:

- `DEF_AUTH_SRV = 'auth'` and its alias `DEFAULT_GUARD = 'auth'`.
- `GUARD_ED25519 = 'guard:ed25519-basic-signature'`.
- `TOKEN_UPDATE = 'auth-token-refresh'`.
- `DISPATCHER_PATH = '/dispatcher'` and `SURROGATE_PATH = '/surrogate'` — both reserved paths.
- `ENTITY_RESOLVER = 'entity-resolver'` and `ENTITY_SLUG_PATTERN` — the organization-entity contract.

`@owlmeans/oidc` constants:

- `OIDC_GATE = 'oidc-gate'` — the `gate(...)` value to attach OIDC enforcement to an entrypoint.
- `GOOGLE_CLIENT_AUTH = 'google-oauth'` — browser plugin type for Google OAuth.
- `GOOGLE_SERVICE = 'google'` — provider service key used by backend config and identity linking.

For apps that use OIDC/Google only as a login provider and then authorize against local identity resources, declare a product-specific gate alias instead of reusing `OIDC_GATE`.

## Errors

`@owlmeans/auth` exports, root first: `AuthError` → `AuthUnknown`, `AuthorizationError` → `AuthForbidden`, `ProfileError` → `ProfileConsistencyError`, and `AuthManagerError` → `AuthManagerUnsupported`, `AuthenFailed` (→ `AuthenExists`, `AuthenPayloadError`) and `AuthPluginError` (→ `TypeMissmatchError`). Each is i18n-aware via `@owlmeans/error`.

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

`trust()` lives on the `@owlmeans/auth-common/utils` subpath, not the package root:

```ts
import { trust } from '@owlmeans/auth-common/utils'
import { TRUSTED } from '@owlmeans/config'

// { user: TrustedRecord, key: KeyPairModel }
const { user, key } = await trust(context, TRUSTED, context.cfg.alias ?? context.cfg.service)
```

It loads the record by `name` (pass a fourth argument to match on another field) and throws
`SyntaxError` when there is none.

`TrustedRecord` (`@owlmeans/auth-common`) is a `ConfigRecord` with an `id`, carrying `Profile` minus `permissions` / `attributes` — in practice a `name`, a `credential` (the public key) and, for identities this deployment signs as, a `secret`. `trust()` returns a signing key pair when the record has a secret and a verify-only one otherwise. The `TRUSTED` config resource (`@owlmeans/config`) is the system's source of truth for known signing identities — the auth service, peer services, wallet providers, supervisors.

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
- `makeAuthService(alias?)` / `appendAuthService(ctx, alias?)` (`@owlmeans/server-auth`) — the bearer guard.
- `setupAuthServiceEntrypoints(entrypoints, serviceAlias, prefix = 'oidc-api')` (`@owlmeans/server-oidc-rp`) — registers the `external-auth:provider:list` and `external-auth:auth:update` routes, both behind `GUARD_ED25519`.
- `makeOidcWrappingService`, `makeOidcGate`, `makeOidcClientService`, `appendOidcGuard`, `setupOidcGuard` — wire OIDC into a server context (`@owlmeans/server-oidc-rp`).

Client-side:
- `appendAuthService(ctx, alias?)` (`@owlmeans/client-auth`) — the client auth service with persistent storage.
- `setupExternalAuthentication(service)` (`@owlmeans/client-auth`) — point `CAUTHEN_FLOW_ENTER` at the service an external provider redirects into.
- `appendLogin(ctx)` (`@owlmeans/client-auth/login`) — the login-plugin host; `@owlmeans/web-client`'s `makeContext` already calls it.
- `appendOidcGuard()`, `setupOidcGuard()` — `@owlmeans/web-oidc-rp` for browser-side.

Local identity and the organization entity:
- `appendAuthIdentityResources(context)` (`@owlmeans/server-auth-identity`) — registers the org-entity registry, the account/profile/credentials resources, the linking service and the entity resolver.
- `AUTH_IDENTITY_LINKING` — the service that maps provider profile details onto an `AuthPayload`.
- `AUTH_IDENTITY_PROFILE` — the durable authorization profile: `entityId`, `role`, `scopes`, optional expiry.
- `ENTITY_RESOLVER` — turns the token's `entitySlug` (current, retired, or the frozen `iamKey`) into a stable `OrgEntityRef`. Registering it is what tells the boundary this deployment has organizations.

Read identity records with `load()` or `list()`. Never use `take()` in an authorization lookup — it is delete-and-return, so it consumes the record it answers with.

## Entity resolution is part of the protocol

Two places resolve the organization entity, and both are required:

1. **At the auth manager**, before the credential envelope is signed. Whatever slug a plugin left on
   `credential.entitySlug` is resolved and rewritten to the current one, so a token is canonical for
   as long as it lives. An unresolvable value throws `AuthenFailed('entity')`.
2. **At every server boundary that establishes authentication** — the HTTP boundary, and any socket
   that authenticates after its connection is open — via `attachEntity(context, request)`
   (`@owlmeans/auth-common`), which sets `request.entity` and canonicalizes a retired slug.

Handlers then key their records on `entityKeyOf(req)` / `requireEntityKey(req)`, which prefer the
resolved id and fall back to the slug where no resolver is registered. A boundary that skips step 2
leaves `request.entity` empty and its handlers silently compare a slug against stored ids — which
surfaces as "this record does not exist", not as a missing resolution.

## Mocking points (for category-B tests)

The protocol exposes three natural mocking boundaries. The only allowed implementation lives in `@owlmeans/test-auth`:

1. **Guard substitution.** Replace the guard service in the context with `makeMockGuard({ auth })` so `match` always hits and `handle` resolves a chosen `Auth`. This bypasses signature verification entirely — useful when the spec is about behaviour downstream of authentication.
2. **TRUSTED resource substitution.** Register `makeMemoryTrustedResource([records])` so `trust()` finds whichever signers your spec needs without touching real config.
3. **Fixture keys + envelopes.** `makeFixtureKeyPair(seed)` returns a deterministic `KeyPairModel`. `signMockEnvelope(msg, type, kind?, kp?)` produces a properly-signed envelope using a fixture key. `makeBearer(auth, kp?)` returns a header value `ED25519-BASIC-TOKEN <encoded>`.

The protocol does **not** ship a fake JWKS server. For OIDC-end-to-end tests, exercise the real `makeOidcGuard` against an in-memory trusted resource and a fixture keypair. If a downstream test needs a hostable IdP fake, add it to `@owlmeans/test-auth` (don't roll one in a per-package `tests/`).

## OIDC dependency boundary and pinned versions

The OIDC packages wrap four upstream libraries. **No upstream type from those libraries is re-exported** through any `@owlmeans/*` package's public index. All public contracts use OwlMeans-owned types; the mapping layer is confined to each package's `src/service.ts`.

Each is pinned to an exact version, and [[oidc-versions]] owns those numbers plus the upgrade
checklist — read them there rather than duplicating them here:
- `oidc-provider` — in `@owlmeans/server-oidc-provider`
- `jose` — in `@owlmeans/server-oidc-provider` and `@owlmeans/server-oidc-rp`
- `openid-client` — in `@owlmeans/server-oidc-rp`
- `oidc-client-ts` — in `@owlmeans/web-oidc-rp` and `@owlmeans/mui-oidc-rp`
