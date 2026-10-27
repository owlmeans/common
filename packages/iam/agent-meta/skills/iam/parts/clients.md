---
name: clients
description: Provisioning OIDC clients — globally unique client ids, the realm field, issuer and redirect-URI rules — and selecting the IAM backend.
metadata:
  purposes: auth, config
  mentions: claimClient, deleteClient, getIssuerUrl, redirectUris, IamClientError, IAM_MODE_INTEGRATED, IAM_MODE_KEYCLOAK, iamMode, IamClient
---
<!-- AUTO-GENERATED — do not edit. Regenerate via sync-agent-meta. -->

# @owlmeans/iam — Clients, issuers and backend selection

## A client id is a global name

A provider resolves a client from the bare `client_id` a relying party sends — the adapter gets no
tenant context — so the id is unique across the whole deployment, not per entity, and the store
cannot namespace it on a consumer's behalf. Uniqueness has to be *in the id*.

- Compose it with the owning entity in it. A name derived from a project's own name alone lets two
  organizations share one registration: one secret, one redirect-URI list, one permission-definition
  set, and one grant namespace, because `PermissionSet.scope` is that same string.
- `ensureClient` refuses a record belonging to another entity rather than returning it. The failure
  is deliberate — a loud provisioning error is the only alternative to a silent cross-tenant handover.
- Assign an id **once** and reserve it with `claimClient`. Whatever a consumer derives ids from
  (a project alias, a slug) may later be released and re-used by a sibling, so only the registry can
  say whether an id is free. `deleteClient` gives it back, or a deleted project's name is burned.
- Backends whose clients are already per-tenant (keycloak realms) satisfy this by construction:
  `claimClient` returns true and `deleteClient` may be `IamUnsupported`.

## `IamClient.realm` field

Every implementation sets `realm` to the entity id, so read `client.realm ?? fallbackEntityId` and
never reach into an adapter's own internals (`(client as any)._realm`) for the same value.

## Issuer & redirect URIs

**`getIssuerUrl(entityId)` is the only place an issuer URL may be composed.** Consumers pass the
result straight through as `OidcProviderDescriptor.discoveryUrl`; they must never rebuild it from a
host plus a base path. Each backend owns its own shape (keycloak `{iam-host}/realms/{entityId}`,
integrated `{provider-host}/{basePath}`), and an implementation must:

- resolve it from configuration only — no admin round-trip, so a consumer that just needs the issuer
  never pays for or fails on a token grant;
- return exactly what the provider advertises as `issuer` (`openid-client` compares the two and fails
  discovery on any difference — build it with the same `makeUrl(..., { base: true })` call
  `@owlmeans/server-oidc-provider` uses);
- throw `IamClientError` when the provider's service route is missing, never fall back silently.

`getEntityAdminConfig` additionally carries the same value as `discoveryUrl`, so the admin provider
config is self-sufficient too.

**Always pass `redirectUris`.** Omitting them is a keycloak-only legacy default (`['*']`, which
Keycloak expands per-origin). The integrated provider does exact `redirect_uri` matching and
`oidc-provider` refuses to load a client whose `redirect_uris` are not absolute URIs — so an
integrated backend's `ensureClient` throws `IamClientError('redirect-uris')` on creation rather than
registering a client that can never complete a callback. An omitted list never widens an existing
hardened client.

## Selecting the IAM backend

The choice is made **once, in a service factory**, and nowhere else. Feature code depends on
`IamService` and never learns which implementation answers it. `IAM_MODE_INTEGRATED` /
`IAM_MODE_KEYCLOAK` and `OidcIamConfig.iamMode` (`@owlmeans/oidc`) exist so a deployment can carry
that choice as ordinary configuration rather than as a branch scattered through handlers. No OwlMeans
package reads `iamMode`; it is declared for the consumer's own factory to switch on, which is the
only thing that may branch.

```ts
import { DEFAULT_ALIAS, IAM_MODE_INTEGRATED, IAM_MODE_KEYCLOAK } from '@owlmeans/iam'
import type { IamMode, IamService } from '@owlmeans/iam'

// makeKeycloakAdapter / makeIntegratedAdapter are PLACEHOLDER names standing in for whichever
// adapter packages the deployment installs — this factory is the one place either is named, and
// every consumer resolves IamService by alias instead. An adapter exposes a
// `(alias?: string, options?: object) => IamService` factory whose alias defaults to DEFAULT_ALIAS.
export const makeIamService = (mode: IamMode = IAM_MODE_INTEGRATED): IamService =>
  mode === IAM_MODE_KEYCLOAK
    ? makeKeycloakAdapter(DEFAULT_ALIAS, /* adapter options */)
    : makeIntegratedAdapter(DEFAULT_ALIAS, /* adapter options */)

// cfg.oidc typed as OidcSharedConfig & OidcIamConfig is what carries the mode
context.registerService(makeIamService(cfg.oidc?.iamMode))
```

An adapter that reassembles the issuer from a registered service alias plus a base path must be given
the **consumer's own** alias and path. Whatever an adapter defaults to is a placeholder, and a
mismatch makes every service lookup behind `getIssuerUrl` miss.

An integrated backend — one built on `@owlmeans/server-oidc-provider`, so the deployment hosts its
own provider — is the default choice; a Keycloak-backed adapter exists for deployments that already
run one.

When a context hosts **more than one** `IamService` instance, every instance must be constructed with
the same options — otherwise they disagree about the issuer, and only one of them can be right.
