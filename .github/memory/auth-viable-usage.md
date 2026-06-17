# Product-Viable Auth Package Usage

- `product-viable` uses these common auth/OIDC packages directly: `auth`, `auth-common`, `client-auth`, `oidc`, `server-auth`, `server-auth-identity`, `server-oidc-rp`, `web-oidc-rp`.
- Browser login: `client-auth` + side-effect import `@owlmeans/web-oidc-rp/auth/plugins`; Google uses `GOOGLE_CLIENT_AUTH` and `GOOGLE_SERVICE = 'google'`.
- Backend auth: `server-auth` verifies bearer tokens and populates `req.auth`; `AUTH_CACHE` is registered explicitly in custom contexts.
- Local identity: `server-auth-identity` stores account/profile/credentials; product gates read `AUTH_IDENTITY_PROFILE` non-destructively with `load()` or `list()`.
- OIDC server client: `server-oidc-rp` reads `cfg.oidc.providers`; use `findProvider`, `hasProvider`, and `entityToClientId` for provider lookup.
- Authorization: viable uses `DEFAULT_GUARD` plus a product gate (`VIABLE_AUTH_GATE`) over local identity scopes; do not restore OIDC gates for product authorization.
- Gotcha: `Resource.pick()` deletes the record it finds. Never use it in auth gates or read-only identity checks.