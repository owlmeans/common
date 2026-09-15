# @owlmeans/server-oidc-rp

The server-side OIDC relying party. An application uses it when users sign in through an OIDC or
OAuth provider (an OIDC IAM, Google): it reads provider descriptors from `cfg.oidc.providers`, runs
discovery and the code exchange, registers the OIDC and Google plugins in the auth manager, and keeps
OIDC-wrapped tokens fresh. It also supplies the OIDC guard and UMA2 gate for a product whose
authorization is the provider's own grants. A product that uses the provider only to log in and keeps
authorization in local records uses `@owlmeans/server-auth-identity` plus its own `GateService`
instead of the guard and gate. Being a provider is `@owlmeans/server-oidc-provider`, the browser side
is `@owlmeans/web-oidc-rp`, and `appendIam()` from `@owlmeans/server-iam` performs the standard
registrations with the IAM gate.

## Installation

```bash
bun add @owlmeans/server-oidc-rp@^0.1.18-rc.31
```

## Concepts

- **Provider descriptor** — an entry of `cfg.oidc.providers`: `clientId`, `secret`, either
  `discoveryUrl` or `service` + `basePath`, optional `extraScopes`, `entityId`, `internal`, `def`.
- **Client service** — `OidcClientService` (`oidc-client`), the only way to reach a descriptor and
  the `OidcClientAdapter` that performs grants, refresh and introspection.
- **Account linking** — the optional `AccountLinkingService` named by
  `cfg.oidc.accountLinkingService`, which maps a provider profile onto a local `AuthPayload`.
- **Wrapped token** — a bearer that wraps a provider token set; the `WRAPPED_OIDC` service
  re-validates it (refresh or introspection) once `OIDC_WRAP_FRESHNESS` has passed.
- **UMA2 gate** — `makeOidcGate()` under `OIDC_GATE`, admitting a request only when the token's
  permission claim grants what the gate params ask for.
- **Token cache** — records in `AUTH_CACHE` whose ids are prefixed with `OIDC_TOKEN_STORE`; there is
  no separate resource.

## Usage

### Configure providers

```ts
import { GOOGLE_SERVICE } from '@owlmeans/oidc'
import { OIDC_ADMIN_CLIENT } from '@owlmeans/server-oidc-rp/auth'
import { AUTH_IDENTITY_LINKING } from '@owlmeans/server-auth-identity'

cfg.oidc ??= {}
cfg.oidc.providers ??= []
cfg.oidc.accountLinkingService = AUTH_IDENTITY_LINKING

// an internal admin client of the IAM; the issuer is reassembled from the `my-app-iam` service host
cfg.oidc.providers.push({
  clientId: OIDC_ADMIN_CLIENT,
  basePath: 'realms/master',
  service: 'my-app-iam',
  secret: process.env.IAM_ADMIN_SECRET!,
  internal: true,
})

// Google login; on a Google descriptor extraScopes is the whole scope
cfg.oidc.providers.push({
  clientId: process.env.GOOGLE_CLIENT_ID!,
  secret: process.env.GOOGLE_CLIENT_SECRET!,
  service: GOOGLE_SERVICE,
  extraScopes: 'openid profile email',
})
```

### Login-only: provider sign-in, local authorization

The API context registers the client service; the process that serves the auth manager imports the
plugin module once.

```ts
// context.ts
import { makeOidcClientService } from '@owlmeans/server-oidc-rp'

context.registerService(makeOidcClientService())
appendAuthIdentityResources(context, AUTH_IDENTITY_DB_ALIAS)
context.registerService(makeMyAppGate()) // a GateService over IdentityProfile scopes
```

```ts
// entrypoints.ts of the service that hosts the auth manager
import { entrypoints as authManagerEntrypoints } from '@owlmeans/server-auth/manager'
import '@owlmeans/server-oidc-rp/auth/plugins' // registers OIDC_CLIENT_AUTH and GOOGLE_CLIENT_AUTH
```

### Provider-authorized: guard, gate and bindings

```ts
// context.ts
import {
  appendOidcGuard, makeOidcClientService, makeOidcGate, makeOidcWrappingService,
} from '@owlmeans/server-oidc-rp'

context.registerService(makeOidcClientService())
context.registerService(makeOidcWrappingService())
context.registerService(makeOidcGate())
appendOidcGuard<C, T>(context)
```

```ts
// entrypoints.ts
import { withOidcGuard } from '@owlmeans/oidc'
import { makeAuthServiceEntrypoints, oidcEntrypoints } from '@owlmeans/server-oidc-rp'
import { bindAll } from '@owlmeans/server-entrypoint'
import { protocols } from '@owlmeans/entrypoint'

// decorate first, then make handlers from and bind the decorated objects
export const configuredProtocols = withOidcGuard(appProtocols)

export const serverBindings = [
  ...bindAll(protocols(configuredProtocols.api), [invoice.list, invoice.pay]),
  ...oidcEntrypoints,
  ...bindAll(makeAuthServiceEntrypoints('my-app-auth-api')),
]
```

### Call a provider with the client service

```ts
import { GOOGLE_SERVICE } from '@owlmeans/oidc'
import { DEFAULT_ALIAS as OIDC_CLIENT, requestedScope } from '@owlmeans/server-oidc-rp'
import type { OidcClientService } from '@owlmeans/server-oidc-rp'
import { OIDC_ADMIN_CLIENT } from '@owlmeans/server-oidc-rp/auth'

const oidc = context.service<OidcClientService>(OIDC_CLIENT)

const admin = oidc.findProvider(provider => provider.clientId === OIDC_ADMIN_CLIENT && provider.internal === true)
if (admin != null) {
  const client = await oidc.getClient(admin.clientId)
  const { access_token } = await client.grantWithCredentials()
  // call the provider's admin API with access_token
}

const google = oidc.findProvider(provider => provider.service === GOOGLE_SERVICE)
const scope = requestedScope(google?.extraScopes) // base scopes + extras, deduplicated
```

### Read the provider token set behind a request

```ts
import { AUTH_CACHE } from '@owlmeans/server-auth'
import { OIDC_TOKEN_STORE } from '@owlmeans/server-oidc-rp'
import type { OidcTokenSetParameters } from '@owlmeans/server-oidc-rp'
import type { Resource, ResourceRecord } from '@owlmeans/resource'
import { decodeJwt } from 'jose'

interface TokenRecord extends ResourceRecord { payload?: OidcTokenSetParameters }

const record = await context.resource<Resource<TokenRecord>>(AUTH_CACHE)
  .load(`${OIDC_TOKEN_STORE}:token:${request.auth!.token}`)

// only the id_token is a JWT; an access token is opaque
const claims = record?.payload?.id_token != null ? decodeJwt(record.payload.id_token) : undefined
```

## API

### Root export

| Symbol | Kind | Purpose |
|---|---|---|
| `makeOidcClientService(alias = DEFAULT_ALIAS)` | function | The relying-party service over `cfg.oidc.providers` |
| `makeOidcWrappingService()` | function | Registers `WRAPPED_OIDC`, which refreshes and re-issues wrapped tokens |
| `makeOidcGate(alias = OIDC_GATE)` | function | UMA2 gate; throws `AuthForbidden` without a matching permission |
| `appendOidcGuard<C, T>(context, opts?)` | function | Register the OIDC guard; `opts` is `OidcGuardOptions` from `@owlmeans/oidc` |
| `oidcEntrypoints` | const | Server bindings of `oidcProtocols.init` and `oidcProtocols.authenticate` |
| `makeAuthServiceEntrypoints(serviceAlias, prefix = 'oidc-api')` | function | Provider-list and token-update protocol declarations guarded by `GUARD_ED25519` |
| `requestedScope(extraScopes?)` | function | `OIDC_RP_BASE_SCOPES` plus a descriptor's extras, deduplicated |
| `createGateModel(ctx)` | function | Permission model: `loadPermissions(auth, params)` |
| `extractPermissionSets(claim)` | function | Validate a permissions claim into `PermissionSet[]` or `undefined` |
| `authService` | const | Aliases `authService.provider.list`, `authService.auth.update` |
| `DEFAULT_ALIAS` | const | `'oidc-client'` |
| `DEF_OIDC_ACCOUNT_LINKING`, `DEF_OIDC_PROVIDER_API` | const | Default aliases of the linking and provider-API seams |
| `OIDC_TOKEN_STORE` | const | Record-id prefix inside `AUTH_CACHE` — not a resource alias |
| `OIDC_AUTH_LIFTETIME` | const | 24 h TTL of a stored token record |
| `OIDC_WRAP_FRESHNESS` | const | Window inside which a validated record is returned unchanged |
| `PROVIDER_CACHE_TTL` | const | Exported but unused |
| `OidcClientService`, `OidcClientAdapter` | type | Client service and per-provider adapter |
| `OidcTokenSet`, `OidcTokenSetParameters`, `OidcGrantChecks`, `OidcServerMetadata`, `OidcIntrospectionResponse`, `OidcClientDescriptor` | type | Owned replacements for `openid-client` types |
| `AccountLinkingService`, `AccountMeta`, `ProviderApiService` | type | Optional seams |
| `OidcRpConfig`, `Config`, `Context` | type | `cfg.oidc` with `accountLinkingService?` / `providerApiService?`, and the server shapes |

### Subpaths

| Subpath | Symbol | Purpose |
|---|---|---|
| `./auth` | `OIDC_ADMIN_CLIENT` | `'admin-cli'` — the IAM admin client id |
| `./auth/plugins` | side-effect import, `plugins` | Registers `OIDC_CLIENT_AUTH` and `GOOGLE_CLIENT_AUTH` in the `@owlmeans/server-auth` manager registry |

## Common pitfalls

- A product that only logs in through the provider and authorizes against local identity records
  must not adopt `appendOidcGuard()` or `makeOidcGate()` as its authorization.
- Register the wrapping service whenever the guard is registered, or wrapped tokens expire
  mid-session.
- Resolve descriptors through `OidcClientService` (`findProvider`, `hasProvider`, `getConfig`,
  `getDefault`, `entityToClientId`); never scan `cfg.oidc.providers` in application code.
- `registerTemporaryProvider` is reference-counted — pair every call with
  `unregisterTemporaryProvider`.
- Decode only `id_token`. An access token's format is provider-private; use `introspect` when its
  contents are needed.
- PKCE verifiers are consume-once: a repeated exchange for one authorization code fails even though
  the first one succeeded.
- The token cache is `AUTH_CACHE` at `${OIDC_TOKEN_STORE}:…` ids; `context.resource(OIDC_TOKEN_STORE)`
  resolves nothing.
- The provider client's allowlist must include every scope `requestedScope` yields, or the provider
  rejects the whole request with `invalid_scope`.
- A server context has no `.url()` on a frontend entrypoint; compose absolute URLs with
  `makeSecurityHelper(ctx).makeUrl(entry.address(), entry.path())` from `@owlmeans/config`.

## Related packages

- [`@owlmeans/oidc`](../oidc) — shared OIDC types, `withOidcGuard`, `OIDC_GATE`, `oidcProtocols`
- [`@owlmeans/server-auth`](../server-auth) — `AUTH_CACHE` and the manager plugin registry
- [`@owlmeans/server-auth-identity`](../server-auth-identity) — local identity behind account linking
- [`@owlmeans/server-iam`](../server-iam) — `appendIam()` with the IAM gate
- [`@owlmeans/server-oidc-provider`](../server-oidc-provider) — the provider side
- [`@owlmeans/web-oidc-rp`](../web-oidc-rp) — the browser side
- [`@owlmeans/auth-common`](../auth-common) — `DEFAULT_GUARD`, which `withOidcGuard()` decorates

<!-- owlmeans:agent-guidance:start -->
## Agent guidance

This package ships embedded agent skills under `agent-meta/`. After installing your
`@owlmeans/*` packages, run the OwlMeans agent-skills installer to place them into
your project's skill store (`.agents/skills/`):

```sh
npx @owlmeans/agent-skills@^0.1.18-rc.27
```

The embedded files are version-matched to this package release. Do not edit them
directly — they are regenerated on each publish. To contribute guidance edits,
open a PR against the source monorepo.
<!-- owlmeans:agent-guidance:end -->
