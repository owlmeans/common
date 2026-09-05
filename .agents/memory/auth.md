---
node: auth
scope: "packages/auth/**, packages/client-auth/**, packages/server-auth/**, packages/server-auth-identity/**, packages/web-client/src/login/**"
updated: 2026-09
---

# Auth (product-viable usage of common auth/OIDC)

## Identity linking — one email, one profile, many credentials

- **`linkProfile` LINKS a person the platform already knows; it registers only a new one.**
  `getLinkedProfile` keys on the provider triple `{type}:{service}:{providerSub}`, which is
  disjoint per method by construction — Google sends its `sub`, the supervisor form sends the
  email — so a second login method always misses and used to fall into a create path that minted
  a **new organization entity, account and profile every time**. One address signing in two ways
  ended up in two entities that could not see each other's projects. `findPlatformIdentity`
  (`server-auth-identity/src/service.ts`) now looks the account up by `name` first; on a hit the
  method contributes a CREDENTIAL row to the existing profile and nothing else is created.
  `meta.force` still registers fresh.
- **A platform login is a profile carrying `credential = "service:{type}:{service}"`.** That is
  the discriminator the lookup uses, and it matters because the SAME address legitimately appears
  on a second row: `inviteUser` (`@owlmeans/iam-integrated`) writes the END USER identity the
  generated application authenticates, prefixed `email-otp:` with an `email` field and no login
  service. Those two rows are different people-shaped records for different audiences and must
  never be merged — the platform credential must not carry an entity a target's login page can
  reach.
- `linkCredentials` was the pre-existing "attach another method" call and had no callers; the
  credentials index `{type, userId, credential}` already permitted N rows per `profileId`, so the
  fix needed no schema change beyond a non-unique `name` index on accounts.
- A consumer that funds or provisions inside its `linkProfile` branch must re-check: reaching
  that branch no longer means a new identity was created (viable's supervisor resolver now guards
  its dev grant on a zero balance).

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
