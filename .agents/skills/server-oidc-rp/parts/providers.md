---
name: providers
description: Resolving a provider through OidcClientService, the client adapter surface, and the owned public types that keep openid-client out of the API.
metadata:
  purposes: auth, config
  mentions: OidcClientService, findProvider, hasProvider, getConfig, getDefault, entityToClientId, registerTemporaryProvider, OidcClientAdapter, OidcTokenSet, OidcClientDescriptor, openid-client
---

# @owlmeans/server-oidc-rp — Providers and the owned type contract

## Resolving a provider

`OidcClientService` is the only way to reach a provider descriptor. Use `findProvider(predicate)`,
`hasProvider(params)`, `getConfig(clientId | partial)`, `getDefault()` and
`entityToClientId(params)` rather than scanning `cfg.oidc.providers` in downstream code.
`registerTemporaryProvider` / `unregisterTemporaryProvider` add a descriptor learned at runtime and
are reference-counted, so every registration needs its matching removal.

`getConfiguration` prefers `discoveryUrl` verbatim; it falls back to `service` + `basePath` and fails
with `AuthManagerError('oidc.client.basepath')` or `('oidc.client.service')` when neither is usable.
`getClient` returns an `OidcClientAdapter`: `getMetadata`, `getClientId`, `getConfig`, `makeAuthUrl`,
`grantWithCredentials`, `grantWithCode`, `refresh` and `introspect`. That adapter is the whole
supported surface — no `openid-client` object is ever handed out.

## Public type contract (isolation principle)

`openid-client` types **never appear in this package's public exports**. All public types are
OwlMeans-owned:

| Owned type | Replaces upstream | Description |
|---|---|---|
| `OidcTokenSet` | `TokenEndpointResponse & TokenEndpointResponseHelpers` | `access_token`, `refresh_token`, `id_token`, `token_type`, `expires_in`, `scope`, `claims()` |
| `OidcTokenSetParameters` | `TokenEndpointResponse` | The same without the helper method |
| `OidcGrantChecks` | `AuthorizationCodeGrantChecks` | `{ pkceCodeVerifier?: string; idTokenExpected?: boolean }` |
| `OidcServerMetadata` | `ServerMetadata` | Issuer and endpoint metadata |
| `OidcIntrospectionResponse` | `IntrospectionResponse` | `active`, `scope`, `sub`, `client_id`, … |
| `OidcClientDescriptor` | `Configuration` (opaque) | Pass-through; consumers must never read its internals |

What the owned names guarantee is the **exported** surface, not the internal imports. The type module
imports `Configuration`, `ServerMetadata`, `TokenEndpointResponse` and `TokenEndpointResponseHelpers`
from `openid-client` in order to alias them under those names; the service module imports the
functional `openid-client` API; and `jose`'s `decodeJwt` is read directly by the token wrapper, the
`oidc-client` auth plugin and the exchange handler. A library swap touches every one of those
modules — what the owned names buy is that it stops there and never reaches a consumer. See
[[oidc-versions]].
