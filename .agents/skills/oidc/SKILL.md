---
name: oidc
description: How to use @owlmeans/oidc — the OIDC names both sides share — the OIDC_GATE alias, the guard, the requested-scope contract, provider descriptors, the dispatcher entrypoints, the organizations scope and switch protocols, and the error query params. Auto-invoked when importing OIDC types or constants, wiring OIDC into a protocol gate, or declaring an identity provider in configuration.
user-invocable: false
---

# @owlmeans/oidc

**Layer:** Core
**Install:** `"@owlmeans/oidc": "^0.1.18-rc.52"` in `dependencies`

The shared half of the OIDC stack: no transport, no library. It owns the names, the shapes and the
guard that the server relying party (`@owlmeans/server-oidc-rp`), the browser relying party
(`@owlmeans/web-oidc-rp`) and the embedded provider (`@owlmeans/server-oidc-provider`) must agree on.

## Key Exports

| Export | Description |
|--------|-------------|
| `OIDC_GATE` | Gate alias to pass in a protocol's `gate` option |
| `OIDC_GUARD` | The guard's alias |
| `OIDC_GUARD_CACHE` | A resource-alias constant nothing reads — the guard has no cache lookup, so registering a resource under it changes no behaviour |
| `makeOidcGuard(opts?)` / `appendOidcGuard(context, opts?)` | The wrapped-token guard, and its registration. The target-specific packages wrap these |
| `withOidcGuard(protocolTree, coguards?)` | Returns a decorated immutable protocol tree, prepending `OIDC_GUARD` to selected guarded declarations (default `DEFAULT_GUARD`) |
| `oidcProtocols` | Shared declarations: the sign-in pair `init` (`POST /authenticate/oidc/init`) and `authenticate` (`POST /authenticate/oidc/process`), and the organization switch `organizations` (`GET /authenticate/oidc/organizations`) and `organization` (`POST /authenticate/oidc/organization`, body `{ entitySlug }`), both guarded by `OIDC_GUARD` |
| `DISPATCHER_OIDC_INIT`, `DISPATCHER_OIDC`, `DISPATCHER_OIDC_ORGANIZATIONS`, `DISPATCHER_OIDC_ORGANIZATION` | Their aliases |
| `OIDC_WRAPPED_TOKEN`, `WRAPPED_OIDC` | The authorization-header scheme for an OIDC-wrapped token, and the service alias that refreshes one |
| `OIDC_CLIENT_AUTH`, `GOOGLE_CLIENT_AUTH` | Authentication plugin types — the generic OIDC one and the Google one |
| `GOOGLE_SERVICE` | Provider service value for Google (`'google'`) |
| `OIDC_RP_BASE_SCOPES` / `OIDC_RP_BASE_SCOPE` | The scopes every OwlMeans RP requests, as array / space-delimited string |
| `EMAIL_SCOPE`, `PERMISSIONS_SCOPE`, `PERMISSIONS_CLAIM` | The standard email scope; the integrated-IAM grant scope and the claim it produces |
| `ORGANIZATIONS_SCOPE`, `ORGANIZATIONS_CLAIM` | `'organizations'` — the tenanted-client scope and the claim carrying `OidcOrganizationClaim[]` |
| `ORGANIZATION_REFUSAL`, `ORGANIZATION_OWNER_REFUSAL` | `AuthForbidden` reasons: not one of the subject's organizations; the action needs its owner |
| `IAM_API_METADATA` | `'owlmeans_iam_api'` — the discovery-document field naming the provider's runtime IAM API |
| `OIDC_CODE_QUERY`, `OIDC_ERROR_QUERY`, `OIDC_ERROR_DESCRIPTION_QUERY` | Redirect-URI params an authorization server sets on success and on failure |
| `INTERACTION`, `INTERACTION_PATH`, `INTERACTION_UID` | Interaction screen alias, path, and the uid path param the path must declare |
| `PROVIDER_INTERACTION`, `OIDC_AUTHEN_MODULE`, `OIDC_FLOW` | The provider-side interaction alias, the IAM authentication entrypoint alias, and the flow name |
| `DEFAULT_PATH`, `DEFAULT_FRONT` | `'oidc'` and `'oidc-client'` — the provider's default base path and the default front service alias |
| `OidcProviderDescriptor` | One identity provider as configuration: `clientId`, `secret?`, `discoveryUrl?`, `service?`/`basePath?`, `redirectUri?`, `extraScopes?`, `entityId?`, `idOverride?`, the three endpoint overrides `authEndpoint?`/`tokenEndpoint?`/`userinfoEndpoint?`, plus the presentation fields below |
| `OidcProviderConfig` | A descriptor plus `internal?` (machine use only) and `apiClientId?` (the admin client) |
| `OidcSharedConfig` / `WithSharedConfig` | `cfg.oidc`: `providers`, `restrictedProviders`, `clientCookie.interaction` |
| `OidcIamConfig` | `{ iamMode?: 'keycloak' \| 'integrated' }` — the IAM-mode seam, kept here to avoid a cycle with `@owlmeans/iam` |
| `OidcGuard`, `OidcGuardOptions` | The guard service type, and `{ coguards, cache?, tokenService? }` — only `coguards` (its **first** entry, default `DEFAULT_GUARD`) and `tokenService` are read; `cache` is declared and never used |
| `OIDCAuthInitParams`, `OIDCClientAuthPayload`, `OIDCTokenUpdate`, `CommonTokenSetParams` | The dispatcher wire shapes; init's `entitySlug?` is the organization the person asks to act in |
| `OIDCAuthInitParamsSchema`, `OIDCClientAuthPayloadSchema`, `OIDCTokenUpdateSchema`, `ProviderProfileDetailsSchema`, `OidcOrganizationSwitchSchema` | Their AJV schemas — closed (the server's AJV strips an undeclared field silently, so every field a caller sends is declared), except `OIDCClientAuthPayloadSchema`, which admits any further string param of the provider's redirect |
| `OidcOrganizationClaim` | `{ entitySlug, entityKey, title?, owner, groups?, home? }` — one organization of the subject as the provider claims it; `entityKey` is the frozen IAM key and never leaves a server |
| `OidcPermissionSetClaim` | `PermissionSet` + `entitySlug?` — a set bound to that organization |
| `OidcOrganizationItem`, `OidcOrganizationList`, `OidcOrganizationSwitch` | The switch's wire shapes: `{ entitySlug, title?, owner, groups?, home?, acting }` items (no key), the `{ items }` list, the `{ entitySlug }` body |
| `WrappedOIDCUpdate` | `AuthToken` + `entity?: ResolvedEntity` — what `WrappedOIDCService.update` answers |
| `ProviderProfileDetails`, `OidcUserDetails`, `OidcProviderSettings` | What an identity provider reports about a subject |
| `WrappedOIDCService` | The `AuthorizationService` that keeps a wrapped token fresh; `update` answers a `WrappedOIDCUpdate` |

## Usage

```typescript
import { contract, protocol, typed } from '@owlmeans/entrypoint'
import { route } from '@owlmeans/route'
import { DEFAULT_GUARD } from '@owlmeans/auth-common'
import { OIDC_GATE } from '@owlmeans/oidc'

protocol(
  route(accountAlias, '/account'),
  contract(typed<Account>()),
  { guards: DEFAULT_GUARD, gate: { alias: OIDC_GATE, params: ['my-service-account--read'] } },
)
```

The verification itself happens in `@owlmeans/server-oidc-rp` (server) and `@owlmeans/web-oidc-rp`
(browser); this package gives both sides one name to refer to. `OIDC_GATE` is for OIDC/UMA-style
authorization only (`server-oidc-rp` → Rules).

## Scope names are a cross-package contract

`OIDC_RP_BASE_SCOPES` is the one definition of what an OwlMeans relying party asks an authorization
server for, and two sides read it from here:

- the **RP** builds its request from it (`requestedScope()` in `@owlmeans/server-oidc-rp`);
- whoever **registers the client** must allow at least these scopes — an authorization server
  rejects the entire request with `invalid_scope` when a requested scope is one it supports but the
  client is not allowed to use.

Never hardcode a scope string on either side. Adding one to `OIDC_RP_BASE_SCOPES` must widen every
client allowlist derived from it in the same change.

## Organizations of a tenanted client

A client that asks for `ORGANIZATIONS_SCOPE` gets two claims from the integrated provider: the
`organizations` claim (`OidcOrganizationClaim[]`) and the FULL `permissions` claim, in which a set
bound to an organization carries `entitySlug`. A client that never asks gets the flattened claim of
the one organization it acts in and no `organizations` claim — so the scope is what turns tenancy
on, and a single-organization client never sees an `organizations` claim or a set carrying
`entitySlug`.

Only the relying party's server sees the claims; what the session keeps and what the browser token
carries is governed by `server-oidc-rp` → "Organizations".

The guard attaches `updated.entity` to the request whenever the wrapping service answers one. A
relying party of a tenanted client has no organization registry of its own, so this is the only
way `req.entity` gets set there; `attachEntity` (`@owlmeans/auth-common`) keeps it only while its
`slug` is exactly the token's.

The switch is two protocols guarded by `OIDC_GUARD` alone — they act on the session the wrapped
token names, after the guard has validated it against the provider. There is no per-request
organization selector: the server's AJV strips unknown query keys, and the session, not the
request, decides which organization a request acts in.

## Provider descriptors

`cfg.oidc.providers` is the list. `discoveryUrl` is the canonical form — the fully-qualified issuer,
used verbatim; `service` + `basePath` is the legacy fallback that reassembles the issuer from a
registered service host, and it forces the relying party to know the provider's URL layout.

Presentation lives on the descriptor too, because a browser never talks to the issuer directly and
has no discovery document to read a name out of: `label` (the human-readable name), `icon` (an icon
registry **name**, never markup), `order` (ascending; absent sorts after the default) and `hidden`
(registered but never offered). `internal: true` means machine use and is never offered either.

`def` marks the default provider, and **both sides read it**. On the server, `getDefault()` in
`@owlmeans/server-oidc-rp` returns the `clientId` of the first provider carrying the flag, and the
init handler resolves the OIDC client from that value before it looks at `entityId` at all — so `def`
in a server config decides which provider the browser-starts-server-finishes flow runs against. In
the browser it drives presentation as well: `@owlmeans/web-oidc-rp` gives the flagged provider a
login method of `order` 20 (unless the descriptor sets its own) and renders it with primary emphasis.

`restrictedProviders` narrows what an application may use: `false` forbids identity-provider sign-in
outright, `true` allows only the default one, and an array is an allowlist matched against a
provider's `entityId ?? service ?? clientId`.

`authEndpoint`, `tokenEndpoint` and `userinfoEndpoint` name a provider's endpoints outright, for a
provider reached without discovery. The shipped reader of all three is the Google sign-in plugin in
`@owlmeans/server-oidc-rp`, which falls back to Google's own endpoints when they are absent; a
descriptor that carries a `discoveryUrl` gets its endpoints from the discovery document instead and
these fields do nothing.

## Depends On

- `@owlmeans/entrypoint`, `@owlmeans/route`, `@owlmeans/auth`, `@owlmeans/auth-common`,
  `@owlmeans/basic-envelope`, `@owlmeans/config`, `@owlmeans/context`, `@owlmeans/resource`
- `ajv` (peer) — the schemas above are `JSONSchemaType` declarations
