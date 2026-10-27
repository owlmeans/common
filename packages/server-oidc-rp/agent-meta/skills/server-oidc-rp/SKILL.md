---
name: server-oidc-rp
description: How to use @owlmeans/server-oidc-rp — the server-side OIDC relying party — appendOidcGuard, oidcEntrypoints and makeAuthServiceEntrypoints, the OidcClientService and its adapter, the requested-scope contract, the UMA2 gate, the wrapped-token service, the acting organization of a tenanted session and its switch, and the owned public types that keep openid-client out of the public surface. Auto-invoked when importing server-oidc-rp helpers or configuring identity providers on a server.
user-invocable: false
---
<!-- AUTO-GENERATED — do not edit. Regenerate via sync-agent-meta. -->

# @owlmeans/server-oidc-rp

**Layer:** Server
**Install:** `"@owlmeans/server-oidc-rp": "^0.1.18-rc.63"` in `dependencies`

## Key Exports

| Export | Description |
|--------|-------------|
| `makeOidcClientService(alias?)` | The relying-party service: reads `cfg.oidc.providers`, runs discovery, hands back client adapters |
| `makeOidcWrappingService()` | Registers `WRAPPED_OIDC` — refreshes and re-issues an OIDC-wrapped token before it goes stale, and answers the acting organization as `entity` |
| `makeOidcGate(alias?)` | The UMA2 gate, registered under `OIDC_GATE` |
| `appendOidcGuard<C, T>(context, opts?)` | Registers the OIDC guard on a server context. `opts` is `OidcGuardOptions` (`@owlmeans/oidc`) and is forwarded to the base guard unchanged |
| `oidcEntrypoints` | Server-local bindings for the shared `oidcProtocols`: `init`, `authenticate`, and the switch `organizations` / `organization` |
| `makeAuthServiceEntrypoints(serviceAlias, prefix?)` | Returns provider-list and token-update protocol declarations, guarded by `GUARD_ED25519`. `prefix` defaults to `oidc-api` |
| `requestedScope(extraScopes?)` | The `scope` of an authorization request — base scopes plus the provider's extras, deduplicated |
| `createGateModel(ctx)` | The UMA2 permission model — `loadPermissions(auth, params)` |
| `extractPermissionSets(claim)` | Shape-validates a `permissions` claim into `OidcPermissionSetClaim[]` (bindings kept), or `undefined` |
| `oidcOrganizationHelper.extractOrganizations(claim)` | Shape-validates an `organizations` claim; `undefined` = no claim (a client without the scope) |
| `oidcOrganizationHelper.pickOrganization(orgs, { entityKey?, entitySlug? })` | The acting organization — see "Organizations" in the `sessions` part |
| `oidcOrganizationHelper.actingPermissionSets(sets, entitySlug?)` | The sets a browser token may carry: unbound ones plus the acting organization's, binding stripped |
| `oidcOrganizationHelper.actingAuth(user, org, sets?)` | `user` re-shaped for `org`: its slug, groups and flattened sets, nothing of the previous organization |
| `oidcOrganizationHelper.resolvedEntityOf(org)` | `{ id: entityKey, slug: entitySlug, iamKey: entityKey }` |
| `oidcOrganizationHelper.organizationItemOf(org, acting?)` | The switch's key-less view of one organization |
| `oidcCacheOf(context).sessionRecord(token)` | The `:token:` record behind a wrapped token's `token`; `AuthorizationError('record')` when gone |
| `OIDCAuthCache` | The cache record type (verifier, exchange and session records share it) |
| `authService` | The service entrypoint aliases: `authService.provider.list`, `authService.auth.update` |
| `DEFAULT_ALIAS` | `'oidc-client'` — the relying-party service alias |
| `DEF_OIDC_ACCOUNT_LINKING`, `DEF_OIDC_PROVIDER_API` | Default aliases of the two optional seams below |
| `OIDC_TOKEN_STORE` | The **record-id prefix** this package composes cache ids from — not a resource alias. See "Where the tokens are cached" in the `sessions` part |
| `OIDC_AUTH_LIFTETIME` | Seven days — the absolute TTL of an issued wrapper and its stored token record |
| `OIDC_WRAP_FRESHNESS` | How long a validated record stays fresh: inside this window of its last validation the wrapping service returns the token unchanged, past it the token is re-validated and re-issued |
| `PROVIDER_CACHE_TTL` | Exported, but its only use in the package is commented out — it configures nothing |
| `AccountLinkingService` | Optional seam: turn a provider profile into a local `AuthPayload` (`getLinkedProfile`, `linkProfile(details, { username })`, `linkCredentials`, `getOwnerProfiles`, `getOwnerCredentials`) |
| `ProviderApiService` | Optional seam onto the provider's own admin API (`getUserDetails`, `getSettings`) |
| `OidcRpConfig` | `cfg.oidc` plus `accountLinkingService?` and `providerApiService?` |

### Subpath exports

- `./auth` — `OIDC_ADMIN_CLIENT` (`'admin-cli'`)
- `./auth/plugins` — importing it registers the `OIDC_CLIENT_AUTH` and `GOOGLE_CLIENT_AUTH` plugins
  into the `@owlmeans/server-auth` manager registry

## Wiring

```typescript
import { appendOidcGuard, makeOidcWrappingService, makeOidcGate, makeOidcClientService } from '@owlmeans/server-oidc-rp'

context.registerService(makeOidcClientService())
context.registerService(makeOidcWrappingService())
context.registerService(makeOidcGate())
appendOidcGuard<C, T>(context)
```

```typescript
import { withOidcGuard } from '@owlmeans/oidc'
import { oidcEntrypoints, makeAuthServiceEntrypoints } from '@owlmeans/server-oidc-rp'
import { bindAll } from '@owlmeans/server-entrypoint'

export const configuredProtocols = withOidcGuard(protocols)
export const serverBindings = [
  ...bindAll(configuredProtocols.api),
  ...oidcEntrypoints,
  ...bindAll(makeAuthServiceEntrypoints('my-auth-api')),
]
```

Decorate the application tree before binding it; do not mutate declarations or append protocol
objects to a server entrypoint list. `oidcEntrypoints` are bindings and are spread once. The
auth-service helper returns declarations, so bind those declarations in the serving app.

```typescript
// config
cfg.oidc ??= {}
cfg.oidc.providers ??= []
cfg.oidc.providers.push({
  clientId: OIDC_ADMIN_CLIENT,
  basePath: 'realms/master',
  // the alias of a registered service whose host the issuer is reassembled from;
  // a provider reachable by its own URL carries `discoveryUrl` instead
  service: 'my-iam',
  secret: '/etc/master-secret/oidc-admin-secret',
  internal: true
})
```

A consumer that only needs the IAM defaults calls `appendIam()` from `@owlmeans/server-iam`, which
performs the four registrations above with the IAM gate in place of `makeOidcGate()`.

## Rules

- An application that uses an identity provider **only to log in**, and then maps the subject onto a
  local identity through `@owlmeans/server-auth-identity`, must not adopt `appendOidcGuard()` or
  `makeOidcGate()` (`OIDC_GATE`) as its authorization mechanism. Those decide against the
  provider's grants; a product that owns its own identity records declares its own gate alias and
  `GateService` over them.
- The browser starts the flow and the server finishes it: the exchange, the account linking and the
  bearer token an application actually carries are all produced here.
- Register the wrapping service whenever the guard is registered — an OIDC-wrapped token that nothing
  refreshes expires mid-session.
- A provider configured with `sessionValidation: 'required'` is authoritative on every protected
  request: the wrapper must require same-client introspection and current userinfo claims. An
  invalid provider token clears the local wrapper (401); an authority or registry outage fails
  closed as `AuthUnavailable` (503) without deleting a valid local session.
- When `AUTH_SESSION_MANAGER` is registered, exchange creates a tracked OIDC session and the
  wrapper rejects pre-registry tokens. It acknowledges a changed authorization revision only after
  live provider validation, and never extends the original wrapper/cache expiry while doing so.
- Provider descriptors, token sets, PKCE verifiers, authorization codes and cached challenge
  records are secrets. Do not log them or pass them to diagnostics.

## Depends On

- `@owlmeans/oidc`, `@owlmeans/server-auth`, `@owlmeans/server-context`, `@owlmeans/server-entrypoint`,
  `@owlmeans/server-api`, `@owlmeans/auth`, `@owlmeans/auth-common`, `@owlmeans/basic-envelope`,
  `@owlmeans/client-entrypoint`, `@owlmeans/config`, `@owlmeans/context`, `@owlmeans/did`,
  `@owlmeans/entrypoint`, `@owlmeans/resource`, `@owlmeans/route`, `@noble/hashes`, `@scure/base`,
  `dayjs`
- `ajv` (peer)
- `openid-client@6.8.4` (exact), `jose@6.2.5` (exact) — see [[oidc-versions]]

## Parts

| Part | Load it when |
|---|---|
| [providers](parts/providers.md) | looking up or registering a provider descriptor, or typing a token set or provider metadata |
| [sign-in](parts/sign-in.md) | changing scopes, the init or exchange handlers, token decoding, or a redirect URI built on the server |
| [sessions](parts/sessions.md) | reading the provider token set behind a request, or working with a tenanted session's organizations |
