---
node: auth
scope: "packages/auth/**, packages/client-auth/**, packages/server-auth/**, packages/server-auth-identity/**"
updated: 2026-08
---

# Auth (product-viable usage of common auth/OIDC)

## Facts

- product-viable consumes directly: `auth`, `auth-common`, `client-auth`, `oidc`, `server-auth`,
  `server-auth-identity`, `server-oidc-rp`, `web-oidc-rp`.
- Browser login: `client-auth` + side-effect import `@owlmeans/web-oidc-rp/auth/plugins`;
  Google uses `GOOGLE_CLIENT_AUTH` and `GOOGLE_SERVICE = 'google'`.
- Backend: `server-auth` verifies bearer tokens and populates `req.auth`; `AUTH_CACHE` is
  registered explicitly in custom contexts.
- Local identity: `server-auth-identity` stores account/profile/credentials; product gates read
  `AUTH_IDENTITY_PROFILE` non-destructively with `load()` or `list()`.
- OIDC server client: `server-oidc-rp` reads `cfg.oidc.providers`; lookup via `findProvider`,
  `hasProvider`, `entityToClientId`.

## Invariants

- viable authorization = `DEFAULT_GUARD` + product gate (`VIABLE_AUTH_GATE`) over local identity
  scopes — do not restore OIDC gates for product authorization.

## Gotchas

- `Resource.pick()` DELETES the record it finds — never use it in auth gates or read-only
  identity checks.
- `makeAuthModel().authenticate()` (`server-auth`) burns the *decoded* challenge into `AUTH_CACHE`
  as a create-once anti-replay guard, before the plugin's own credential check runs. Any
  `AuthPlugin.init()` whose challenge isn't unique per request (e.g. a bare identity string) makes
  every second legitimate attempt within the cache TTL collide and 500 with `AuthenFailed`
  wrapping `RecordExists` — not the plugin's own error. Full incident + fix: `server-auth-otp`
  skill.
