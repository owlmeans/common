# @owlmeans/auth

The core authentication and authorization vocabulary shared by server and client: the `Auth` /
`AuthPayload` / `AuthCredentials` types, the `AuthRole` and `AuthenticationType` enums, the auth
error hierarchy, AJV schemas for request bodies and record fields, the auth entrypoint aliases, and
`entitySlugOf()` for reading the organization entity off a token. An app imports it whenever code
on either side of the wire needs to name an identity, throw an auth error, or reuse a scalar schema
(`IdValueSchema`, `DateSchema`). It contains no services and no wiring: guards, the Ed25519 guard,
shared auth protocols and organization-entity resolution (`entityKeyOf`, `requireEntityKey`,
`attachEntity`) live in [`@owlmeans/auth-common`](../auth-common); the server auth service in
[`@owlmeans/server-auth`](../server-auth); the browser auth service in
[`@owlmeans/client-auth`](../client-auth).

## Installation

```bash
bun add @owlmeans/auth@^0.1.18-rc.8
```

`ajv` is a **peer** dependency — install it alongside, or `verifyAuth` / `verifyAuthCredentials`
fail to resolve.

## Concepts

- **Authorization** — the RBAC base every identity shape extends: `entitySlug?`, `scopes`,
  `permissions?` (`PermissionSet[]`), `attributes?`, `permissioned?`, `denormalized?`.
- **AuthPayload / Auth** — `AuthPayload` adds `type`, `role`, `userId`, `profileId?`,
  `expiresAt?`; `Auth` is the resolved identity a guard puts on `request.auth` (adds `token`,
  `isUser`, `createdAt`).
- **Allowance / credentials** — the two-step handshake: a client posts an `AllowanceRequest` to get
  a `challenge`, then posts `AuthCredentials` (`challenge` + `credential`) to authenticate.
- **Organization entity** — `entitySlug` is the renameable organization name and the only
  organization value on the wire. Read it with `entitySlugOf(payload)`. The stable `entityId` is
  never on the wire and is not declared here; server handlers get it from `requireEntityKey(req)` /
  `requireEntity(req)` in `@owlmeans/auth-common`.
- **Error hierarchy** — `AuthError` is the root of i18n-aware `ResilientError` subclasses that
  survive marshalling across a service boundary: `AuthUnknown` (no identity), `AuthenFailed`
  (credential rejected), `AuthForbidden` (authenticated, not allowed).
- **Authentication stage** — `AuthenticationStage` tracks a client or socket flow from `Init` to
  `Authenticated` (or `Error`).

## Usage

### Reuse scalar schemas in shared contracts

Field schemas keep ids, dates and scopes consistent across every app model.

```ts
import type { JSONSchemaType } from 'ajv'
import { DateSchema, IdValueSchema } from '@owlmeans/auth'

export interface Invoice {
  id?: string
  projectId: string
  total: number
  createdAt: Date
}

export const InvoiceSchema: JSONSchemaType<Invoice> = {
  type: 'object',
  properties: {
    id: { ...IdValueSchema, nullable: true },
    projectId: IdValueSchema,
    total: { type: 'number', minimum: 0 },
    createdAt: DateSchema,
  },
  required: ['projectId', 'total', 'createdAt'],
  additionalProperties: false,
}
```

### Throw typed errors from a handler

A handler that finds no identity throws `AuthUnknown`; one that finds an identity without the right
to act throws `AuthForbidden`. Organization-scoped records are keyed by the resolved id from
`requireEntityKey`, never by the slug on the token.

```ts
import { AuthForbidden, AuthUnknown } from '@owlmeans/auth'
import { requireEntityKey } from '@owlmeans/auth-common'
import { handlers } from '@owlmeans/server-api'
import { invoiceProtocols } from 'my-app-common'
import type { AppContext } from '../types.js'

const api = handlers<AppContext>()

export const listInvoices = api.request(invoiceProtocols.list, async (req, context) => {
  if (req.auth?.profileId == null) {
    throw new AuthUnknown('profile')
  }
  const entityId = requireEntityKey(req)          // stable record id, never from the token

  return await loadInvoices(context, entityId, req.params.projectId)
})

export const archiveInvoice = api.request(invoiceProtocols.archive, async (req, context) => {
  const entityId = requireEntityKey(req)
  if (!req.auth!.scopes.includes('invoice-admin')) {
    throw new AuthForbidden('permission')
  }

  return await archive(context, entityId, req.params.id)
})
```

### Deny access in a gate

A gate service declared on a protocol (`gate: { alias, params }`) asserts scopes and throws
`AuthForbidden` on denial.

```ts
import { createLazyService } from '@owlmeans/context'
import type { GateService } from '@owlmeans/entrypoint'
import { ALL_SCOPES, AuthForbidden } from '@owlmeans/auth'
import { entityKeyOf } from '@owlmeans/auth-common'

export const makeProjectGate = (alias: string = 'my-app:project-gate'): GateService =>
  createLazyService<GateService>(alias, {
    assert: async (req, _, params) => {
      if (req.auth == null) throw new AuthForbidden('auth')

      const entityId = entityKeyOf(req)
      if (entityId == null) throw new AuthForbidden('entity')

      // Params name the organization by its stable id, matching how grants are stored.
      const required = params.map(p => p.replace(/\{entity\}/g, entityId))
      const scopes = req.auth.scopes ?? []
      if (!required.every(p => scopes.includes(ALL_SCOPES) || scopes.includes(p))) {
        throw new AuthForbidden('permission')
      }
    },
  })
```

### Authenticate a socket connection

A socket authenticates after its connection is open, so it moves through `AuthenticationStage`
itself, sets the bearer token under `AUTH_HEADER`, and must call `attachEntity`.

```ts
import type { Auth, AuthToken } from '@owlmeans/auth'
import { AUTH_HEADER, AuthenFailed, AuthenticationStage, AuthUnknown } from '@owlmeans/auth'
import { attachEntity, DEFAULT_GUARD } from '@owlmeans/auth-common'
import type { AbstractRequest, AbstractResponse, GuardService } from '@owlmeans/entrypoint'
import { provideResponse } from '@owlmeans/entrypoint'
import type { AppContext } from '../types.js'

export const authenticateSocket = (context: AppContext, req: AbstractRequest) =>
  async (stage: AuthenticationStage, token: AuthToken) => {
    if (stage !== AuthenticationStage.Authenticate) throw new AuthUnknown('stage')

    req.headers ??= {}
    req.headers[AUTH_HEADER] ??= token.token

    const res: AbstractResponse<Auth> = provideResponse({ header: () => void 0 })
    if (!await context.service<GuardService>(DEFAULT_GUARD).handle(req, res) || res.value == null) {
      throw new AuthenFailed('guard')
    }

    req.auth = res.value
    await attachEntity(context, req)

    return [AuthenticationStage.Authenticated, true]
  }
```

### Build payloads, read the organization, widen a token schema

`AuthRole` is a string enum, `entitySlugOf` is the only supported way to read the organization off a
payload, and `AuthTokenSchema` caps `token` at 1024 characters — a route carrying a wrapped
credential envelope declares its own wider schema.

```ts
import type { JSONSchemaType } from 'ajv'
import type { AuthPayload, AuthToken } from '@owlmeans/auth'
import { AuthRole, AuthenticationType, entitySlugOf, isAuthToken } from '@owlmeans/auth'

const payload: AuthPayload = {
  type: AuthenticationType.OneTimeToken,
  role: AuthRole.User,
  userId: 'account-1',
  profileId: 'profile-1',
  entitySlug: 'acme-studio',
  scopes: ['my-app-project'],
}

const orgLabel = entitySlugOf(payload)   // string | undefined — opaque, never a database key

export const WrappedTokenSchema: JSONSchemaType<AuthToken> = {
  type: 'object',
  properties: { token: { type: 'string', minLength: 32, maxLength: 8192 } },
  required: ['token'],
  additionalProperties: false,
}

export const tokenOf = (body: unknown): string | undefined =>
  isAuthToken(body) ? body.token : undefined
```

## API

All symbols are exported from the package root (`@owlmeans/auth`); there are no subpath exports.

### Types

| Symbol | Kind | Purpose |
|--------|------|---------|
| `Authorization` | interface | RBAC base: `entitySlug?`, `scopes`, `permissions?`, `attributes?`, `permissioned?`, `denormalized?` |
| `ProfilePayload` | interface | `Authorization` + `groups?` |
| `AuthPayload` | interface | `ProfilePayload` + `type`, `role`, `userId`, `source?`, `profileId?`, `expiresAt?` |
| `AuthCredentials` | interface | `AuthPayload` + `challenge`, `credential`, `publicKey?` — the authenticate body |
| `Auth` | interface | `AuthPayload` + `token`, `isUser`, `createdAt` — the identity on `request.auth` |
| `Profile` | interface | `ProfilePayload` + `id`, `name`, `credential?`, `secret?` — a stored identity record |
| `Group` | interface | `Authorization` + `id`, `name` |
| `AllowanceRequest` | interface | `Partial<AuthPayload>` with required `type` — asks for a challenge |
| `AllowanceResponse` | interface | `{ challenge }` |
| `AuthToken` | interface | `{ token }` — the bearer envelope on the wire |
| `PermissionSet` | interface | `scope`, `title?`, `permissions: Capabilties`, `resources?` |
| `Capabilties` | interface | Map of capability name to `boolean \| number \| null` |
| `AttributeSet` | interface | `scope`, `attributes: string[]` |
| `RelyToken` | interface | Rely-handshake token: `nonce`, `pin?`, `token?`, `check?` |
| `SupervisorCredentialPayload` | interface | `{ salt, signature }` packed into a supervisor credential |

### Enums

| Symbol | Kind | Purpose |
|--------|------|---------|
| `AuthRole` | string enum | `User`, `Guest`, `Service`, `System`, `Admin`, `Superuser`, `Blocked` |
| `AuthenticationType` | string enum | How identity is proven: `BasicEd25519`, `OneTimeToken`, `ReCaptcha`, `WalletDid`, `RelyHandshake`, `WalletConsumer`, `WalletProvider`, `Google` (`'google-oauth'`), `Supervisor` (`'pk-supervisor'`) |
| `AuthroizationType` (sic) | string enum | How a request carries authorization: `AuthToken`, `Ed25519BasicToken`, `Ed25519BasicSignature` |
| `AuthenticationStage` | string enum | Flow stage: `Error`, `Init`, `Allowence`, `Authenticate`, `Authentication`, `Authenticated` |

### Constants

| Symbol | Kind | Purpose |
|--------|------|---------|
| `AUTH_HEADER` / `AUTH_QUERY` | const | `'authorization'` / `'token'` |
| `ENTITY_QUERY` / `PROFILE_QUERY` | const | `'entitySlug'` / `'profile'` query parameter names |
| `ALL_SCOPES` / `AUTH_SCOPE` | const | `'*'` / `'__auth'` |
| `INCLUDE`, `EXCLUDE`, `WILDCARD`, `DELIMITER` | const | Permission-string grammar: `'+'`, `'-'`, `'*'`, `':'` |
| `GUEST_ID`, `RELY_3RD` | const | Reserved ids: `'__guest'`, `'rely'` |
| `AUTHEN`, `AUTHEN_INIT`, `AUTHEN_AUTHEN`, `AUTHEN_RELY` | const | Backend authentication entrypoint aliases |
| `CAUTHEN`, `CAUTHEN_AUTHEN`, `CAUTHEN_AUTHEN_DEFAULT`, `CAUTHEN_AUTHEN_TYPED`, `CAUTHEN_FLOW_ENTER` | const | Front-end authentication entrypoint aliases |
| `DISPATCHER`, `DISPATCHER_AUTHEN`, `DISPATCHER_SURROGATE` | const | Dispatcher and surrogate login-window entrypoint aliases |
| `MOD_RECAPTCHA`, `CMOD_RECAPTCHA` | const | reCAPTCHA entrypoint aliases |

### Errors

Every class extends `ResilientError` (`@owlmeans/error`), is registered for marshalling, and takes
an optional message suffix (default `'error'`).

| Symbol | Kind | Purpose |
|--------|------|---------|
| `AuthError` | class | Root of the hierarchy |
| `AuthUnknown` | class | The subject is not known — missing auth state, unregistered plugin type |
| `AuthManagerError` | class | The auth manager itself failed |
| `AuthManagerUnsupported` | class | The manager cannot serve this request shape |
| `AuthenFailed` | class | Authentication attempted and rejected (bad challenge, code, signature) |
| `AuthenExists` | class | The identity being registered already exists |
| `AuthenPayloadError` | class | A required credential field is missing |
| `AuthPluginError` | class | An auth plugin misbehaved |
| `TypeMissmatchError` | class | A plugin was handed the wrong authentication type |
| `AuthorizationError` | class | Authenticated, but no usable authorization |
| `AuthForbidden` | class | Authenticated and understood — and not allowed |
| `ProfileError` / `ProfileConsistencyError` | class | A profile is missing / internally inconsistent |

### Schemas

| Symbol | Kind | Purpose |
|--------|------|---------|
| `AuthorizationSchema`, `ProfilePayloadSchema`, `AuthPayloadSchema` | JSON schema | Payload validation; `AuthPayloadSchema` requires `scopes`, `role`, `type` |
| `PartialAuthPayloadSchema`, `AllowanceRequestSchema` | JSON schema | The `authentication:init` body |
| `AuthCredentialsSchema` | JSON schema | The `authentication:authenticate` body; requires `challenge`, `credential`, `scopes`, `role`, `type` |
| `AuthSchema` | JSON schema | A resolved `Auth` |
| `AuthTokenSchema`, `OptionalAuthTokenSchema` | JSON schema | Bearer-token bodies; `token` is 32–1024 characters |
| `ProfileSchema` | JSON schema | A stored `Profile` |
| `PermissionSetSchema`, `AttributeSetSchema`, `CapabiltiesSchema` | JSON schema | Permission and attribute shapes |
| `RelyChallengeSchema` | JSON schema | A `RelyToken` |
| `ScopeValueSchema`, `PermissionValueSchema`, `ResourceValueSchema`, `AttributeValueSchema`, `GroupValueSchema`, `TypeNameSchema`, `EnumValueSchema`, `IdValueSchema` | JSON schema | Reusable string field schemas with length bounds |
| `EntitySlugValueSchema` | JSON schema | Organization slug field (3–256 characters) |
| `EntityValueSchema` | JSON schema | Deprecated alias of `EntitySlugValueSchema` |
| `DateSchema` | JSON schema | `date-time` formatted `Date` field |
| `AuthRoleSchema` | JSON schema | Enum of `AuthRole` values |

### Helpers

| Symbol | Kind | Purpose |
|--------|------|---------|
| `entitySlugOf(payload?)` | function | The organization carried by a payload: `entitySlug`, falling back to a legacy `entityId` |
| `verifyAuth(auth)` | function | Validate against `AuthSchema` (AJV with formats) |
| `verifyAuthCredentials(auth)` | function | Validate against `AuthCredentialsSchema` |
| `isAuth(value)` | type guard | Has `token` and `isUser` |
| `isAuthCredentials(value)` | type guard | Has `challenge` and `credential` |
| `isAuthToken(value)` | type guard | Has a string `token` |
| `buildSupervisorPayload(challenge, userId, salt)` | function | The canonical payload the PK supervisor login signs and verifies |

## Common pitfalls

- `AuthRole` is a **string** enum — use the members; numeric literals do not compile.
- Read the organization with `entitySlugOf()`, never `payload.entitySlug` directly. Its result may
  be a legacy `entityId`, so treat it as an opaque key: never compose names from it and never write
  it as a database key — use `requireEntityKey` / `requireEntity` from `@owlmeans/auth-common`.
- Never put `entityId` on the wire (tokens, URLs, query params, forms) — only `entitySlug`.
- Any code path that establishes authentication outside the HTTP boundary (sockets) must call
  `attachEntity(context, request)`, or `request.entity` stays empty.
- Pick the right error: a gate denial is `AuthForbidden`, a missing identity is `AuthUnknown`, a
  failed credential check is `AuthenFailed`.
- `AuthCredentialsSchema` requires `type`, `role` and `scopes` on every authenticate call.
- `AuthTokenSchema` caps `token` at 1024 characters; a route accepting a wrapped credential envelope
  needs its own wider schema.
- Keep ownership and permission rules out of this package — compose them in entrypoint gates or
  handlers around these types.
- `ajv` is a peer dependency; without it the `verify*` helpers fail to resolve.

## Related packages

- [`@owlmeans/auth-common`](../auth-common) — guards, shared auth protocols, organization-entity resolution
- [`@owlmeans/server-auth`](../server-auth) — server-side auth service and plugins
- [`@owlmeans/server-auth-identity`](../server-auth-identity) — local identity store behind provider logins
- [`@owlmeans/client-auth`](../client-auth) — browser auth service and login hooks
- [`@owlmeans/entrypoint`](../entrypoint) — protocols, guards and gates that consume these types
- [`@owlmeans/error`](../error) — `ResilientError`, the base of every auth error
- [`@owlmeans/socket`](../socket) — socket connections that authenticate through `AuthenticationStage`

<!-- owlmeans:agent-guidance:start -->
## Agent guidance

This package ships embedded agent skills under `agent-meta/`. After installing your
`@owlmeans/*` packages, run the OwlMeans agent-skills installer to place them into
your project's skill store (`.agents/skills/`):

```sh
npx @owlmeans/agent-skills@^0.1.18-rc.20
```

The embedded files are version-matched to this package release. Do not edit them
directly — they are regenerated on each publish. To contribute guidance edits,
open a PR against the source monorepo.
<!-- owlmeans:agent-guidance:end -->
