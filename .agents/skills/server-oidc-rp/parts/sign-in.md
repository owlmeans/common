---
name: sign-in
description: The authorization round trip — requested scope, id_token-only decoding, consume-once PKCE verifiers, entityId in the browser-starts-server-finishes flow, and absolute URLs from a server context.
metadata:
  purposes: auth
  mentions: requestedScope, OIDC_RP_BASE_SCOPES, extraScopes, GOOGLE_CLIENT_AUTH, decodeJwt, id_token, DISPATCHER_OIDC, makeSecurityHelper
---

# @owlmeans/server-oidc-rp — The sign-in round trip

## Requested scope

`requestedScope(extraScopes)` is `OIDC_RP_BASE_SCOPES` (`@owlmeans/oidc`) plus the provider
descriptor's `extraScopes`, deduplicated and trimmed. The two generic request sites — the
browser-starts-server-finishes init handler and the `oidc-client` auth plugin — both build their
`scope` from it, and neither may grow a scope literal.

The `GOOGLE_CLIENT_AUTH` plugin refuses a userinfo whose `email_verified` is not the boolean
`true` (`AuthenFailed('email-verified')`): the address is what links the sign-in to an account, so
an unverified one would hand that account to whoever typed it.

It is also the scope exception, and it behaves differently on purpose: it sends
the descriptor's `extraScopes` as the **whole** scope, falling back to `'openid profile email'` when
the descriptor names none. So on a Google descriptor `extraScopes` replaces the base scopes instead
of extending them, and adding a scope to `OIDC_RP_BASE_SCOPES` does not reach it.

The provider's client registration must allow every scope this yields. A provider supports `email`
as soon as it declares `claims.email` — and then rejects the whole request with
`invalid_scope: requested scope is not allowed` if the client's own allowlist omits it, rather than
dropping the scope — so a scope added to the base list needs every provisioned allowlist widened in
the same change.

## Only the `id_token` is a JWT

`id_token` is a JWT by specification; an **access token's format is provider-private**. `oidc-provider`
issues opaque access tokens by default, so `decodeJwt(tokenSet.access_token)` (`jose`) throws
`JWTInvalid: Invalid JWT`. Inside the exchange handler that failure surfaces as a 500 on the
`DISPATCHER_OIDC` endpoint *after* the code exchange already succeeded, which reads as a broken login
rather than as the log line it came from. Decode only `tokenSet.id_token` — every claim this package
needs (`sub`, the `PERMISSIONS_CLAIM` grant) lives there. This applies to debug logging too: a
`console.log` argument is evaluated before the call, so a throwing decode in a log statement fails the
request just as hard as one in real logic. Never introspect an access token locally; use the
provider's introspection endpoint (`introspect`) when its contents are genuinely needed.

## PKCE verifiers are consume-once

The verifier cached at init is read back with the resource's `take` — a delete-and-return. The
exchange therefore succeeds exactly once per authorization code: a repeated exchange (a React effect
that runs twice for one `code`, a retried request) fails with `resource:unknown-record` even though
the first attempt worked. Callers guard against re-entry rather than expecting the read to be
idempotent.

## `entityId` in the browser-starts-server-finishes flow

The init handler resolves the OIDC client two ways: via `getDefault()` (a provider flagged `def: true`,
matched without looking at `entityId` at all) or, only when no default exists, via a remote provider
lookup keyed by the caller-supplied `entityId`. The cached verifier record carries `entityId` **only**
when that second path actually used it to resolve the client. The exchange step later calls
`getConfig({ clientId, ...(entityId != null ? { entityId } : {}) })`, which requires an exact match on
every field it is given; a stored `entityId` that was never validated against the registered provider
— a caller-side default or placeholder, say — makes the exchange fail with a bare `AuthenFailed()`
even though the same default provider is trivially available again at exchange time.

## A server context has no `url()`

`DISPATCHER` (the redirect URI) is a FRONTEND route resolved from a SERVER context, and `.url()` is
attached only by `@owlmeans/client-entrypoint` — `ClientEntrypoint.url` type-checks on the server and
throws `….url is not a function` at request time. To build an absolute URL for a route this server
does not own, type the reference as `CommonEntrypoint` (so `.url()` is a compile error) and compose
`makeSecurityHelper(ctx).makeUrl(entry.address(), entry.path())` (`@owlmeans/config`), substituting
path params first — the same pattern as the provider's interaction URL (`server-oidc-provider`).
