---
name: oidc
description: How to use @owlmeans/oidc — the OIDC names both sides share — the OIDC_GATE alias, the guard, the requested-scope contract, provider descriptors, the dispatcher entrypoints and the error query params. Auto-invoked when importing OIDC types or constants, wiring OIDC into a guard(), or declaring an identity provider in configuration.
user-invocable: false
---
<!-- AUTO-GENERATED — do not edit. Regenerate via sync-agent-meta. -->

# @owlmeans/oidc

**Layer:** Core
**Install:** `"@owlmeans/oidc": "^0.1.18-rc.13"` in `dependencies`

The shared half of the OIDC stack: no transport, no library. It owns the names, the shapes and the
guard that the server relying party (`@owlmeans/server-oidc-rp`), the browser relying party
(`@owlmeans/web-oidc-rp`) and the embedded provider (`@owlmeans/server-oidc-provider`) must agree on.

## Key Exports

| Export | Description |
|--------|-------------|
| `OIDC_GATE` | Gate alias to pass to `gate(...)` inside `guard(...)` |
| `OIDC_GUARD` | The guard's alias |
| `OIDC_GUARD_CACHE` | A resource-alias constant nothing reads — the guard has no cache lookup, so registering a resource under it changes no behaviour |
| `makeOidcGuard(opts?)` / `appendOidcGuard(context, opts?)` | The wrapped-token guard, and its registration. The target-specific packages wrap these |
| `setupOidcGuard(entrypoints, coguards?)` | Appends the two dispatcher entrypoints and prepends `OIDC_GUARD` to every entrypoint already guarded by a coguard (default `DEFAULT_GUARD`) |
| `entrypoints` | Those two declarations: `DISPATCHER_OIDC_INIT` (`POST /authenticate/oidc/init`) and `DISPATCHER_OIDC` (`POST /authenticate/oidc/process`) |
| `DISPATCHER_OIDC_INIT`, `DISPATCHER_OIDC` | Their aliases |
| `OIDC_WRAPPED_TOKEN`, `WRAPPED_OIDC` | The authorization-header scheme for an OIDC-wrapped token, and the service alias that refreshes one |
| `OIDC_CLIENT_AUTH`, `GOOGLE_CLIENT_AUTH` | Authentication plugin types — the generic OIDC one and the Google one |
| `GOOGLE_SERVICE` | Provider service value for Google (`'google'`) |
| `OIDC_RP_BASE_SCOPES` / `OIDC_RP_BASE_SCOPE` | The scopes every OwlMeans RP requests, as array / space-delimited string |
| `EMAIL_SCOPE`, `PERMISSIONS_SCOPE`, `PERMISSIONS_CLAIM` | The standard email scope; the integrated-IAM grant scope and the claim it produces |
| `OIDC_CODE_QUERY`, `OIDC_ERROR_QUERY`, `OIDC_ERROR_DESCRIPTION_QUERY` | Redirect-URI params an authorization server sets on success and on failure |
| `INTERACTION`, `INTERACTION_PATH`, `INTERACTION_UID` | Interaction screen alias, path, and the uid path param the path must declare |
| `PROVIDER_INTERACTION`, `OIDC_AUTHEN_MODULE`, `OIDC_FLOW` | The provider-side interaction alias, the IAM authentication entrypoint alias, and the flow name |
| `DEFAULT_PATH`, `DEFAULT_FRONT` | `'oidc'` and `'oidc-client'` — the provider's default base path and the default front service alias |
| `OidcProviderDescriptor` | One identity provider as configuration: `clientId`, `secret?`, `discoveryUrl?`, `service?`/`basePath?`, `redirectUri?`, `extraScopes?`, `entityId?`, `idOverride?`, the three endpoint overrides `authEndpoint?`/`tokenEndpoint?`/`userinfoEndpoint?`, plus the presentation fields below |
| `OidcProviderConfig` | A descriptor plus `internal?` (machine use only) and `apiClientId?` (the admin client) |
| `OidcSharedConfig` / `WithSharedConfig` | `cfg.oidc`: `providers`, `restrictedProviders`, `clientCookie.interaction` |
| `OidcIamConfig` | `{ iamMode?: 'keycloak' \| 'integrated' }` — the IAM-mode seam, kept here to avoid a cycle with `@owlmeans/iam` |
| `OidcGuard`, `OidcGuardOptions` | The guard service type, and `{ coguards, cache?, tokenService? }` — only `coguards` (its **first** entry, default `DEFAULT_GUARD`) and `tokenService` are read; `cache` is declared and never used |
| `OIDCAuthInitParams`, `OIDCClientAuthPayload`, `OIDCTokenUpdate`, `CommonTokenSetParams` | The dispatcher wire shapes |
| `OIDCAuthInitParamsSchema`, `OIDCClientAuthPayloadSchema`, `OIDCTokenUpdateSchema`, `ProviderProfileDetailsSchema` | Their AJV schemas |
| `ProviderProfileDetails`, `OidcUserDetails`, `OidcProviderSettings` | What an identity provider reports about a subject |
| `WrappedOIDCService` | The `AuthorizationService` that keeps a wrapped token fresh |

## Usage

```typescript
import { entrypoint, guard, gate } from '@owlmeans/entrypoint'
import { route } from '@owlmeans/route'
import { DEFAULT_GUARD } from '@owlmeans/auth-common'
import { OIDC_GATE } from '@owlmeans/oidc'

entrypoint(
  route(accountAlias, '/account'),
  guard(DEFAULT_GUARD, gate(OIDC_GATE, ['my-service-account--read']))
)
```

The verification itself happens in `@owlmeans/server-oidc-rp` (server) and `@owlmeans/web-oidc-rp`
(browser); this package gives both sides one name to refer to. `OIDC_GATE` is for OIDC/UMA-style
authorization. A product that authenticates over OIDC but authorizes against its own identity
resources declares its own gate alias instead.

## Scope names are a cross-package contract

`OIDC_RP_BASE_SCOPES` is the one definition of what an OwlMeans relying party asks an authorization
server for, and two sides read it from here:

- the **RP** builds its request from it (`requestedScope()` in `@owlmeans/server-oidc-rp`);
- whoever **registers the client** must allow at least these scopes — an authorization server
  rejects the entire request with `invalid_scope` when a requested scope is one it supports but the
  client is not allowed to use.

Never hardcode a scope string on either side. Adding one to `OIDC_RP_BASE_SCOPES` must widen every
client allowlist derived from it in the same change.

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
