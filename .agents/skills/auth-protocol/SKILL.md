---
name: auth-protocol
description: Comprehensive reference for the OwlMeans authentication and authorization protocol — the Ed25519, OIDC, provider-backed local identity, email-OTP, hosted-app (integrated provider) and PK-supervisor paths, the identity model (one account per e-mail, credentials on the account, profile rows per app and organization, organizations with groups), pairwise subjects, the acting organization as session state and its switch, the four permission kinds, the core types and error hierarchy, guards and gates, the trust resource, the envelope shape, organization-entity resolution, the refresh flow, and the mocking points. Auto-invoked when files under auth*, *oidc*, *iam*, server-auth-identity, did*, wled or client-payment are touched.
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
2. Server decodes the ID token — only the id_token; an access token's format is provider-private — builds an `Auth` from its claims, and wraps it in an envelope of type `oidc-wrapped-token` signed with the service key — the bearer is `OIDC-WRAPPED-TOKEN <encoded>`. The token set and, for a tenanted client, the organizations stay in the server-side session record ("Organizations and the session").
3. Subsequent requests are matched and handled by `makeOidcGuard` (`@owlmeans/oidc`), which verifies the envelope signature against the service key and delegates freshness to the `WRAPPED_OIDC` service.
4. Refresh: `makeOidcWrappingService` (`@owlmeans/server-oidc-rp`) re-validates the stored token set — introspection, or a refresh grant once `expires_at` has passed; current userinfo on every request under `sessionValidation: 'required'` — and re-signs the wrapped token. When the value changes, the guard returns it in the **`TOKEN_UPDATE` response header** (`'auth-token-refresh'`, `@owlmeans/auth-common`); an empty value means the session is over. It is a header, not a route: `@owlmeans/server-api` lists it in `exposedHeaders` and `@owlmeans/api`'s client service feeds it back into `AuthService.update()`. Where the deployment has a separate auth manager, the wrapper reaches it over the `external-auth:auth:update` declaration from `makeAuthServiceEntrypoints`, bound at `/<prefix>/auth/update`.

### Provider-backed local identity

Use case: a deployment that signs its own people in through Google, OIDC or an e-mail code and authorizes against its own identity store (`@owlmeans/server-auth-identity`).

1. Browser imports `@owlmeans/web-oidc-rp/auth/plugins`, which registers OIDC and Google plugins in `@owlmeans/client-auth`.
2. The plugin persists auth control state, redirects to the provider, restores state on return, and submits code/query params as `AuthCredentials`.
3. Server exchanges the provider code through `@owlmeans/server-oidc-rp`. The Google plugin refuses a userinfo whose `email_verified` is not `true` (`AuthenFailed('email-verified')`): the address is what links the sign-in to an account.
4. The linking service (`AUTH_IDENTITY_LINKING`) maps `ProviderProfileDetails` onto the identity model ("The identity model"): `getLinkedProfile` follows the method's credential to its account and answers the row of THIS deployment's app in the account's main organization; otherwise `linkProfile(details, { username: verifiedEmail })` runs `ensureAccount` — a further method of a known address becomes another credential on the same account, a new address registers an account with a personal organization — and `ensureProfile` for the deployment's own app there (`owner: true`, `scopes: ['*']`).
5. Server returns a normal OwlMeans bearer token carrying the organization's `entitySlug` and the row's `profileId`. Downstream product gates authorize against that row — requiring its `service` to be the deployment's own app, because the same organization holds hosted apps' rows — not against `OIDC_GATE`.

### Email one-time code

Use case: passwordless sign-in where no external IdP is wanted.

1. Client posts `{ type: 'email-otp', userId: <email> }` to `/authentication/init`.
2. `@owlmeans/server-auth-otp` mails a six-digit code, stores it in Redis under a TTL, and answers with a challenge of `"<email>::<nonce>"` — the nonce is what keeps two independent attempts for one address from colliding in the manager's anti-replay cache.
3. Client posts the code as `AuthCredentials.credential`; the plugin verifies and consumes it, resolves the identity through the linking service `cfg.otp.identityAlias` names (default `AUTH_IDENTITY_LINKING`), and the manager signs the credential envelope as usual. An integrated provider's end-user login names the e-mail proof linking service there instead (next path).

### Hosted-app sign-in through the integrated provider

Use case: an application a deployment hosts (a generated target) signs its end users in against the deployment's own OIDC provider (`@owlmeans/server-oidc-provider` with `@owlmeans/iam-integrated`), over the same identity store.

1. The application's server relying party (`appendIam` of `@owlmeans/server-iam`) sends the browser to the provider with the base scopes plus `permissions` (and `organizations` for a tenanted client); a provisioned client's allowlist is a superset of everything a relying party asks for.
2. The provider's login screen runs the e-mail code against the deployment's auth manager with the e-mail proof linking service (`makeEmailProofLinkingService`). Its payload proves the address and identifies nobody: `profileId: IAM_EMAIL_PROOF` (`'proof:email'`), `userId` = the address, one narrow end-user scope, no `entitySlug` — and it writes nothing.
3. The provider's interaction finalizer verifies that proof, loads the interaction's client and calls `subjects.signIn(clientId, { email })`: the account (one per address; the e-mail code a credential on it), its primary row of the app as owner of the personal organization, and — for staff of the client's owning organization — the staff row there. The provider grant and session name the ACCOUNT id.
4. `findAccount` asks `subjects.resolve(clientId, accountId)` for the claims. `null` (no row of the app, a disabled or expired primary row) refuses the account, and the provider's `account_refused` login check sends the browser back to the login screen instead of failing the consent.
5. The claims: `sub` = the pairwise subject, `email`, `permissions`, and `organizations` under its scope. The account's record id never leaves the provider.

**Pairwise subjects.** Every client sees its own subject for one account: `profileIdOf(clientId, accountId)` (`subjects.identify`) — the very `profileId` of the account's rows of that app — the same in the id_token, userinfo and introspection, and different for every other client, so two apps cannot correlate their users. The provider configuration that produces it (pairwise-only, the sector URI, `claims()` answering the account id) is governed by `server-oidc-provider` → "Pairwise subjects".

### PK supervisor (development only)

Use case: deterministic end-to-end tests, and operator access to a development or stage environment.

1. Client posts `{ type: 'pk-supervisor', userId }` to `/authentication/init`, receiving a single-use challenge.
2. It signs `buildSupervisorPayload(challenge, userId, salt)` (`@owlmeans/auth`) with one of the project's TRUSTED private keys and posts `{ salt, signature }` as the credential.
3. The server plugin verifies the signature against the allowlisted TRUSTED records, resolves or registers the target user, and the ordinary envelope exchange finishes the flow.

Never enabled in real production — see the `supervisor-auth` skill.

## The identity model

One store (`@owlmeans/server-auth-identity`) serves a deployment's own app and every app it hosts.
Its records, fields, indexes, races and events are governed by the `server-auth-identity` skill;
the protocol relies on these rules:

- **Account** — the person, ONE per e-mail; `entityId` = its personal organization. Every sign-in
  method (e-mail code, Google, PK supervisor) is a **credential** on the account, never on a row.
- **Profile row** — one per (account, app, organization); `service` = the app (the deployment's own
  key, or a hosted app's client id); `profileId = profileIdOf(service, accountId)` is computed, the
  same on every row of one (account, app), and is the pairwise subject that app's client sees. The
  PRIMARY row (in the personal organization) carries `home` and `disabled`.
- **Organization** (`OrgEntity`) — `slug` (the wire `entitySlug`, renameable), `iamKey` (frozen,
  claimed as `entityKey`, server-side only) and the organization's **groups** inside the document.
- Registration anywhere creates the account, its personal organization and an owner row of the app
  signing in. The address IS the identity: every caller of `ensureAccount` must have verified it.

## Organizations and the session

Tenancy is a property of the hosted app's client (`IamClientConfig.users` / `.operators`,
`iam` skill): with neither flag every subject acts in the client's owning organization; with either,
the client asks for `ORGANIZATIONS_SCOPE` and each subject acts in organizations of its own.

- **The acting organization is session state of the relying party**, never a request parameter.
  The exchange picks it, every validation re-picks it by `entityKey`, and only the switch moves it —
  governed by `server-oidc-rp` → "Organizations" (claims, session record, browser-token contents,
  the switch handlers).
- **The request entity** on such a relying party is `{ id: entityKey, slug, iamKey: entityKey }`,
  attached by the OIDC guard; `requireEntityKey(req)` answers the `entityKey` — the tenant key a
  hosted app stores its records by (`auth-common` → "The organization entity").
- **Browser**: `listOrganizations` / `switchOrganization` (`client-iam`). **Server**:
  `organizationsOf` / `organizationOf` and the runtime IAM client `iamRuntime` (`server-iam`) over the
  provider's runtime IAM API (`makeIamRuntimeProtocols`, `iam` skill), advertised as the discovery
  field `owlmeans_iam_api`.

## Permission kinds

What a grant binds to — nothing, an organization (`entityScoped`), resource ids (`resourceScoped`) or
both — is a property of its DEFINITION, and `defaultClass` (`none` / `user` / `member` / `owner`)
says who holds it without a grant. `hasPermission(auth, name, { scope?, resourceId?, entitySlug? })`
is fail-closed on a bound set. The model is governed by the `iam` skill ("Permission kinds",
"Default classes"); the gate that asserts it by `server-iam` ("How the gate decides").

## Types, constants and errors

The payload chain is `Authorization` (`entitySlug?`, `scopes`, `permissions?`, …) → `ProfilePayload`
(+ `groups?`) → `AuthPayload` (+ `type`, `role`, `userId`, `profileId?`, …) → `AuthCredentials`
(+ `challenge`, `credential`) for authentication and `Auth` (+ `token`, `isUser`, `createdAt`) for a
resolved identity. **`entitySlug` is the only organization-entity value on the wire**; read it with
`entitySlugOf(payload)`, never off the field. Where each name is governed:

- types, `AuthRole` (a **string** enum), `AuthenticationType`, query/header constants, the error
  hierarchy (`AuthError` root; `AuthUnknown` 400, `AuthorizationError` → `AuthForbidden`,
  `AuthenFailed` …) — the `auth` skill;
- guard aliases (`DEFAULT_GUARD`, `GUARD_ED25519`), `TOKEN_UPDATE`, reserved paths, `ENTITY_RESOLVER`
  — the `auth-common` skill;
- `OIDC_GATE`, the Google plugin/service names, the `permissions` / `organizations` scopes and their
  refusal reasons, `IAM_API_METADATA` — the `oidc` skill. An app that uses a provider only to sign in
  and authorizes against local identity declares its own gate alias (`server-oidc-rp` → Rules).

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

It loads the record by `name` (a fourth argument matches another field), throws `SyntaxError` when
there is none, and answers a signing key pair when the `TrustedRecord` carries a `secret`, a
verify-only one otherwise. The `TRUSTED` config resource is the source of truth for known signing
identities — the auth service, peer services, wallet providers, supervisors (`auth-common`).

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

`KeyPairModel` (`@owlmeans/basic-keys`, `basic-keys` skill) signs, verifies and exports
`ed25519:<base64>` keys; `makeKeyPairModel(input?)` builds one, `fromPubKey(credential)` a
verify-only one, and `packAuthCredentials(auth, extra, signer)` signs an `AuthCredentials` for the
Ed25519 path.

## Setup wiring

Server-side:
- `makeAuthService(alias?)` / `appendAuthService(ctx, alias?)` (`@owlmeans/server-auth`) — the bearer guard.
- `makeAuthServiceEntrypoints(serviceAlias, prefix = 'oidc-api')` (`@owlmeans/server-oidc-rp`) — returns `external-auth:provider:list` and `external-auth:auth:update` declarations, both behind `GUARD_ED25519`; bind them in the serving app.
- `makeOidcWrappingService`, `makeOidcGate`, `makeOidcClientService`, `appendOidcGuard`, `oidcEntrypoints` — wire OIDC services and server-local bindings into a server context (`@owlmeans/server-oidc-rp`). Decorate the app protocol tree with `withOidcGuard` from `@owlmeans/oidc` before binding it.
- `appendIam(context)` (`@owlmeans/server-iam`) — the same four registrations with the IAM gate in place of `makeOidcGate()`, for an application signing in against an IAM provider.

Client-side:
- `appendAuthService(ctx, alias?)` (`@owlmeans/client-auth`) — the client auth service with persistent storage.
- `setupExternalAuthentication(service)` (`@owlmeans/client-auth`) — point `CAUTHEN_FLOW_ENTER` at the service an external provider redirects into.
- `appendLogin(ctx)` (`@owlmeans/client-auth/login`) — the login-plugin host; `@owlmeans/web-client`'s `makeContext` already calls it.
- `appendOidcGuard()`, `oidcEntrypoints()` — `@owlmeans/web-oidc-rp` for browser-side bindings; `withOidcGuard` decorates the shared protocol tree.
- `appendIam(context, opts?)`, `withIamGuard`, `iamEntrypoints()` (`@owlmeans/client-iam`) — the same in one import, plus the consent-before-sign-in precondition and the organization switch.

Local identity and the organization entity:
- `appendAuthIdentityResources(context, dbAlias?, { service? })` (`@owlmeans/server-auth-identity`) — registers the org-entity registry, the account/profile/credentials resources, the linking service for the deployment's own app key `service`, the entity resolver and the identity-events seam.
- `AUTH_IDENTITY_LINKING` — the service that maps provider profile details onto an `AuthPayload` of the deployment's own app.
- `AUTH_IDENTITY_PROFILE` — the profile rows: one per (account, app, organization), the record authorization reads (`role`, `scopes`, `permissions`, `groups`, optional expiry).
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

A relying party of a tenanted client has no registry to resolve from: there the OIDC guard attaches
the session's acting organization itself, and `attachEntity` keeps it only while its slug is exactly
the token's (`auth-common` → "The organization entity").

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
