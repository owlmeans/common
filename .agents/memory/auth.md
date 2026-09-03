---
node: auth
scope: "packages/auth/**, packages/client-auth/**, packages/server-auth/**, packages/server-auth-identity/**, packages/web-client/src/login/**"
updated: 2026-09
---

# Auth (product-viable usage of common auth/OIDC)

## Facts

- product-viable consumes directly: `auth`, `auth-common`, `client-auth`, `oidc`, `server-auth`,
  `server-auth-identity`, `server-oidc-rp`, `web-oidc-rp`.
- Browser login: `client-auth` + side-effect import `@owlmeans/web-oidc-rp/auth/plugins`;
  Google uses `GOOGLE_CLIENT_AUTH` and `GOOGLE_SERVICE = 'google'`.
- **Two plugin registries, different questions.** `client-auth/manager/plugins`
  (`AuthenticationPlugin`) = *how* identity is proven. `client-auth/login` (`LoginPlugin`, lazy host
  reached as `context.login()`, cascade by priority over `LoginEnv`) = *where* the authorization
  round trip runs. `web-client`'s `makeContext` registers redirect (0, always) and surrogate-window
  (100, embedded/surrogate). Rules: `login-plugins` skill.
- Backend: `server-auth` verifies bearer tokens and populates `req.auth`; `AUTH_CACHE` is
  registered explicitly in custom contexts.
- Local identity: `server-auth-identity` stores account/profile/credentials; product gates read
  `AUTH_IDENTITY_PROFILE` non-destructively with `load()` or `list()`.
- OIDC server client: `server-oidc-rp` reads `cfg.oidc.providers`; lookup via `findProvider`,
  `hasProvider`, `entityToClientId`.

## Invariants

- viable authorization = `DEFAULT_GUARD` + product gate (`VIABLE_AUTH_GATE`) over local identity
  scopes — do not restore OIDC gates for product authorization.
- **A relying party never implements a login mechanic.** `web-oidc-rp` / `mui-oidc-rp` dispatchers
  call `enter`/`authorize`/`complete` and render off `LoginOutcome`; frames, surrogate windows,
  COOP and gestures belong to the plugin. And a token becomes authentication only through
  `adoptToken` / `context.login().adopt()` — one place that stores the record, decodes the envelope
  and sets both `auth` and `token`.

## Gotchas

- `Resource.take()` is the delete-and-return read — the name says the record is gone once it has
  been handed over, so it never belongs in an auth gate or a read-only identity check;
  `load(where)` answers a multi-field lookup in one call ([[resources]]).
- `makeAuthModel().authenticate()` (`server-auth`) burns the *decoded* challenge into `AUTH_CACHE`
  as a create-once anti-replay guard, before the plugin's own credential check runs. Any
  `AuthPlugin.init()` whose challenge isn't unique per request (e.g. a bare identity string) makes
  every second legitimate attempt within the cache TTL collide and 500 with `AuthenFailed`
  wrapping `RecordExists` — not the plugin's own error. Full incident + fix: `server-auth-otp`
  skill.
