---
node: auth
scope: "packages/auth/**, packages/client-auth/**, packages/server-auth/**, packages/server-auth-identity/**, packages/web-client/src/login/**"
updated: 2026-10
---

# Auth (common auth packages, and product-viable's use of them)

## Identity store and tenanted sessions

- Rules live in `server-auth-identity` (one account per e-mail, credentials on the account, rows per
  (account, app, organization), field-level org writes) and `server-oidc-rp` → "Organizations"
  (acting organization = session state, `entityKey` as tenant key). Viable-side facts:
- A gate MUST require its own `service` — one organization holds hosted apps' rows too (viable:
  `VIABLE_AUTH_GATE` + `VIABLE_APP`). Every registration creates a personal organization, a hosted
  app's end user's too; viable's free plan hangs on `onProfileCreated` filtered by `service`.
- Fixtures use record ids, never slugs, in declared references (`MisshapedRecord` otherwise).

## Facts

- product-viable consumes `auth`, `auth-common`, `client-auth`, `oidc`, `server-auth`,
  `server-auth-identity`, `server-oidc-rp`, `web-oidc-rp`; its targets use `client-iam` / `server-iam`.
- Browser login: `client-auth` + side-effect import `@owlmeans/web-oidc-rp/auth/plugins`;
  Google uses `GOOGLE_CLIENT_AUTH` and `GOOGLE_SERVICE = 'google'`.
- **Two plugin registries.** `client-auth/manager/plugins` (`AuthenticationPlugin`) = *how* identity
  is proven; `client-auth/login` (`LoginPlugin`, `context.login()`, cascade over `LoginEnv`) = *where*
  the round trip runs — redirect (0) and surrogate-window (100). Rules: `login-plugins` skill.
- Backend: `server-auth` verifies bearer tokens and populates `req.auth`; `AUTH_CACHE` is
  registered explicitly in custom contexts.
- OIDC server client: `server-oidc-rp` reads `cfg.oidc.providers`; lookup via `findProvider`,
  `hasProvider`, `entityToClientId`.

## Invariants

- viable authorization = `DEFAULT_GUARD` + product gate (`VIABLE_AUTH_GATE`) over local identity
  scopes — do not restore OIDC gates for product authorization.
- **A relying party never implements a login mechanic**: dispatchers call `enter`/`authorize`/
  `complete` and render off `LoginOutcome`; frames, surrogate windows, COOP and gestures are the plugin's.
- A token becomes authentication only through `adoptToken` / `context.login().adopt()` — one place
  that stores the record, decodes the envelope and sets `auth` + `token` (`switchOrganization` too).

## Gotchas

- `Resource.take()` is delete-and-return — never in an auth gate or a read-only identity check;
  `load(where)` answers a multi-field lookup in one call ([[resources]]).
- `makeAuthModel().authenticate()` burns the DECODED challenge into `AUTH_CACHE` (create-once) before
  the plugin's check: a challenge not unique per request makes the second attempt 500 with
  `AuthenFailed` wrapping `RecordExists`, not the plugin's error (`server-auth-otp` skill).
- `hasPermission` without `entitySlug` refuses every set carrying one (fail-closed): a check over
  RAW claim sets (the session record's `sets`) that forgets the organization denies bound grants,
  never widens them. Token sets arrive already flattened.
