---
name: auth
description: How to use @owlmeans/auth — the core authentication and authorization vocabulary shared by server and client, covering the Auth / AuthPayload / AuthCredentials types, the AuthRole and AuthenticationType enums, the error hierarchy (AuthUnknown, AuthenFailed, AuthForbidden …), the request JSON schemas, the entrypoint aliases, and entitySlugOf for reading the organization entity off a token. Auto-invoked when importing auth types, errors, schemas or constants, or when working with request authentication.
user-invocable: false
---

# @owlmeans/auth

**Layer:** Core
**Install:** `"@owlmeans/auth": "^0.1.18-rc.8"` in `dependencies`

Types, enums, errors and schemas only — no services, no wiring. Every other auth package builds on
this vocabulary, so a symbol belongs here exactly when both a server and a browser need to agree on
it.

## Key Exports

### Identity types

| Export | Description |
|--------|-------------|
| `Authorization` | RBAC base: `entitySlug?`, `scopes`, `permissions?`, `attributes?`, `permissioned?`, `denormalized?` |
| `ProfilePayload` | `Authorization` + `groups?` |
| `AuthPayload` | `ProfilePayload` + `type`, `role`, `userId`, `source?`, `profileId?`, `expiresAt?` |
| `AuthCredentials` | `AuthPayload` + `challenge`, `credential`, `publicKey?` — what a client posts to authenticate |
| `Auth` | `AuthPayload` + `token`, `isUser`, `createdAt` — the authenticated identity a guard resolves |
| `Profile` | `ProfilePayload` + `id`, `name`, `credential?`, `secret?` — a stored identity record |
| `Group` | `Authorization` + `id`, `name` |
| `AllowanceRequest` | `Partial<AuthPayload>` with a required `type` — asks for a challenge |
| `AllowanceResponse` | `{ challenge }` |
| `AuthToken` | `{ token }` — the bearer envelope on the wire |
| `PermissionSet` / `Capabilties` / `AttributeSet` | Scope-bound capability shapes |
| `RelyToken` | The rely-handshake token used by wallet/provider flows |

### Enums and constants

| Export | Description |
|--------|-------------|
| `AuthRole` | **String** enum: `User`, `Guest`, `Service`, `System`, `Admin`, `Superuser`, `Blocked` |
| `AuthenticationType` | How identity is proven: `BasicEd25519`, `OneTimeToken`, `ReCaptcha`, `WalletDid`, `RelyHandshake`, `WalletConsumer`, `WalletProvider`, `Google` (`'google-oauth'`), `Supervisor` (`'pk-supervisor'`) |
| `AuthroizationType` (sic) | How a request carries authorization: `AuthToken`, `Ed25519BasicToken`, `Ed25519BasicSignature` |
| `AuthenticationStage` | Client-side flow stage: `Error`, `Init`, `Allowence`, `Authenticate`, `Authentication`, `Authenticated` |
| `AUTH_HEADER` / `AUTH_QUERY` | `'authorization'` / `'token'` |
| `ENTITY_QUERY` / `PROFILE_QUERY` | `'entitySlug'` / `'profile'` |
| `ALL_SCOPES` / `AUTH_SCOPE` | `'*'` / `'__auth'` |
| `INCLUDE`, `EXCLUDE`, `WILDCARD`, `DELIMITER` | Permission-string grammar |
| `GUEST_ID`, `RELY_3RD` | Reserved ids |
| `AUTHEN`, `AUTHEN_INIT`, `AUTHEN_AUTHEN`, `AUTHEN_RELY` | Backend entrypoint aliases |
| `CAUTHEN`, `CAUTHEN_AUTHEN`, `CAUTHEN_AUTHEN_DEFAULT`, `CAUTHEN_AUTHEN_TYPED`, `CAUTHEN_FLOW_ENTER` | Front-end entrypoint aliases |
| `DISPATCHER`, `DISPATCHER_AUTHEN`, `DISPATCHER_SURROGATE` | Dispatcher and surrogate-window entrypoint aliases |
| `MOD_RECAPTCHA`, `CMOD_RECAPTCHA` | reCAPTCHA entrypoint aliases |

### Errors

`AuthError` is the root; everything below is a subclass and every class is i18n-aware through
`@owlmeans/error`.

| Error | Raise it when |
|-------|---------------|
| `AuthUnknown` | The thing being authenticated is not known at all — an unregistered plugin type, a request whose auth state is missing |
| `AuthManagerError` | The auth manager itself failed |
| `AuthManagerUnsupported` | The manager cannot serve this request shape |
| `AuthenFailed` | Authentication was attempted and rejected (bad challenge, bad code, bad signature) |
| `AuthenExists` | The identity being registered already exists |
| `AuthenPayloadError` | A required credential field is missing |
| `AuthPluginError` / `TypeMissmatchError` | A plugin misbehaved / was handed the wrong type |
| `AuthorizationError` | Authenticated, but the request carries no usable authorization |
| `AuthForbidden` | Authenticated and understood — and not allowed |
| `ProfileError` / `ProfileConsistencyError` | A profile is missing or internally inconsistent |

### Schemas and helpers

| Export | Description |
|--------|-------------|
| `AuthorizationSchema`, `ProfilePayloadSchema`, `AuthPayloadSchema` | Payload validation; `AuthPayloadSchema.required` is `['scopes', 'role', 'type']` |
| `PartialAuthPayloadSchema`, `AllowanceRequestSchema` | The `/authentication/init` body |
| `AuthCredentialsSchema` | The `/authentication/authenticate` body — spreads `AuthPayloadSchema.required`, so `type`, `role` and `scopes` are mandatory on every authenticate call |
| `AuthSchema`, `AuthTokenSchema`, `OptionalAuthTokenSchema` | Resolved auth and bearer-token bodies |
| `ProfileSchema`, `RelyChallengeSchema`, `PermissionSetSchema`, `AttributeSetSchema`, `CapabiltiesSchema` | Record and permission schemas |
| `ScopeValueSchema`, `PermissionValueSchema`, `ResourceValueSchema`, `AttributeValueSchema`, `EntitySlugValueSchema`, `GroupValueSchema`, `TypeNameSchema`, `EnumValueSchema`, `IdValueSchema`, `DateSchema`, `AuthRoleSchema` | Reusable scalar schemas |
| `entitySlugOf(payload)` | The organization entity carried by an auth payload — its `entitySlug`, falling back to an `entityId` the payload may carry instead — see below |
| `verifyAuth`, `verifyAuthCredentials` | Validate against `AuthSchema` / `AuthCredentialsSchema` |
| `isAuth`, `isAuthCredentials`, `isAuthToken` | Type guards |
| `buildSupervisorPayload`, `SupervisorCredentialPayload` | The payload the PK supervisor login signs — see the `supervisor-auth` skill |

`AuthTokenSchema` caps `token` at 1024 characters. A route that accepts a token wrapping a full
credential envelope needs its own wider schema.

## The organization entity on a token

`entitySlug` is the organization-entity value this package declares: `Authorization.entitySlug`,
the renameable, human-readable name of the customer organization, and what travels in tokens, URLs,
query params and request bodies. No `entityId` is declared on any type here — the stable record id
an implementation stores its rows against belongs to whichever package owns the organization
registry, and is resolved from the slug at the server boundary.

Read the value through `entitySlugOf()` rather than off the field. A token is signed once and then
read for as long as it lives, across deployments, and the helper absorbs that spread: when
`entitySlug` is absent it returns an `entityId` the payload carries instead, so a payload that names
the organization under either field resolves through one code path. That fallback is why the helper
is the only supported way to get the value out of a payload:

```typescript
import { entitySlugOf } from '@owlmeans/auth'

const slug = entitySlugOf(req.auth)   // string | undefined
```

Because of that fallback the result is not guaranteed to be a slug: a payload carrying only
`entityId` yields that id. Treat it as an opaque organization key, never as a name to compose from
and never as a database key written directly — `@owlmeans/auth-common` exports `entityKeyOf` /
`requireEntityKey` for storage keys, and they prefer the resolved id; a user-facing name wants the
resolved entity's current slug.

## AuthRole is a string enum

Always use the members; a numeric literal does not compile.

```typescript
import { AuthRole } from '@owlmeans/auth'
import type { AuthCredentials } from '@owlmeans/auth'

const creds: AuthCredentials = { role: AuthRole.User, /* … */ } as AuthCredentials
```

## Usage

Throw from a handler when the request is missing the identity it needs:

```typescript
import { AuthUnknown, entitySlugOf } from '@owlmeans/auth'
import { handleRequest } from '@owlmeans/server-app'

export const list = handleRequest(async (req, context) => {
  const slug = entitySlugOf(req.auth)
  if (slug == null) throw new AuthUnknown('entity')

  return await listProjects(context, slug)
})
```

Rules of thumb:

- A gate that decides "not allowed" throws `AuthForbidden`; a handler that finds no identity to act
  on throws `AuthUnknown`; a failed credential check throws `AuthenFailed`.
- Keep ownership rules out of this package. Downstream apps compose `@owlmeans/entrypoint` gates or
  handler-level checks around these types.
- WebSocket wiring uses `Auth`, `AuthToken` and `AuthenticationStage` to move a token-bearing
  connection into an authenticated state.
- A provider login (Google/OIDC, OTP, supervisor) ultimately produces an ordinary `AuthPayload` with
  `userId`, `profileId`, `entitySlug` and `scopes`; `@owlmeans/server-auth-identity` stores the local
  identity behind it and returns that payload.

## Depends On

- `@owlmeans/error` — every error class extends `ResilientError`, which is what makes the messages
  translatable and re-throwable across the wire
- `ajv-formats` — date/time formats for the `verify*` helpers
- `ajv` — a **peer** dependency (`"*"`), not a direct one: `verifyAuth` / `verifyAuthCredentials`
  construct `new Ajv({ strict: false })`. Install it alongside this package, or those two helpers
  fail to resolve.
