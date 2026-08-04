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
