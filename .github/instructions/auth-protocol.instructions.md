---
description: "OwlMeans auth protocol rules for Ed25519, OIDC, provider-backed local identity, guards, gates, errors, trust records, and auth test mocking. Use for auth*, *oidc*, server-auth-identity, did, wled, and client-payment package work."
applyTo: "packages/{auth,auth-common,basic-keys,basic-envelope,did,client-auth,client-did,server-auth,server-auth-identity,oidc,server-oidc-rp,server-oidc-provider,web-oidc-rp,web-oidc-provider,wled,client-payment}/src/**"
---

# OwlMeans Auth Protocol — Code Rules

Two paths share the same `Auth`, `Authorization`, envelope shape and aliases:

- **Ed25519** (self-signed): allowance → credential → token-exchange → bearer `ED25519-BASIC-TOKEN <encoded>` → server-side `makeBasicEd25519Guard` verifies via `trust()` against the `TRUSTED` resource.
- **OIDC** (delegated): `makeOidcGuard` exchanges OAuth2 code, wraps the result in an `oidc-wrapped-token` envelope.
- **Provider-backed local identity** (used by product-viable): browser Google/OIDC plugin → server provider exchange → `@owlmeans/server-auth-identity` account/profile/credentials link → normal bearer token → product `GateService` authorizes against local profile scopes.

Aliases: `DEFAULT_GUARD = 'auth'`, `GUARD_ED25519 = 'guard:ed25519-basic-signature'`, `OIDC_GATE = 'oidc-gate'`, `AUTH_HEADER = 'authorization'`, `TOKEN_UPDATE = 'auth-token-refresh'`.

`AuthRole` is a **string** enum (`User`, `Guest`, `Service`, `System`, `Admin`, `Superuser`, `Blocked`). Never use numeric literals like `role: 0` — always use `AuthRole.User` etc.

Guard interface lives in `@owlmeans/entrypoint` (`GuardService` extends `InitializedService`, has `match`, `handle`, `authenticated`). Auth service extends it with `authenticate`, `update`, `user`, `store` (`@owlmeans/auth-common/types.ts`).

Envelope shape `{t, msg, sig?, dt, ttl}` from `@owlmeans/basic-envelope`. KeyPairModel `sign/verify/export/exportPublic` from `@owlmeans/basic-keys`.

When refactoring:

- Don't break the `match`/`handle`/`authenticated`/`unpack` contract — multiple guards rely on it.
- Trust-record lookups go through `trust(context, resource, userName, field?)`. Don't hard-code resource lookups.
- Errors must derive from the `@owlmeans/auth/errors` hierarchy (`AuthError`, `AuthenFailed`, `AuthenPayloadError`, `AuthorizationError`, `AuthForbidden`, …) so i18n + normalisation work.
- Local identity reads must be non-destructive. `Resource.pick()` deletes records; use `load()` or `list()` when checking `AUTH_IDENTITY_PROFILE` in authorization gates.
- New auth-related test mocks belong in `@owlmeans/test-auth` — not in a per-package `tests/` directory.

For the full protocol reference see `.claude/skills/auth-protocol/SKILL.md`.
