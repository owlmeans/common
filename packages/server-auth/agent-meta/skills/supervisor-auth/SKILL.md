---
name: supervisor-auth
description: PK-based supervisor authentication — a development-only login where a holder of one of the project's trusted private keys mints a token for any user id/email (registering them on first use), bypassing external IdPs. Primary use is end-to-end tests. Covers appendSupervisorAuth (server + web), the supervisor plugin, and the @owlmeans/test-ui helpers. Use when wiring or testing supervisor auth.
user-invocable: false
---
<!-- AUTO-GENERATED — do not edit. Regenerate via sync-agent-meta. -->

# PK-Based Supervisor Authentication

**Layer:** Server (`@owlmeans/server-auth`) + Web (`@owlmeans/web-auth`) + Tests (`@owlmeans/test-ui`)

A privileged, **development-only** auth path: a holder of one of the project's trusted private keys
(the allowlisted "supervisors") signs a server challenge to mint a valid owlmeans token for an
arbitrary user id / email — **without** Google/OIDC. Unknown users are **registered** on first use.
The primary purpose is deterministic **end-to-end tests** that authenticate against real environments.

It reuses the existing flow end-to-end: the plugin only **verifies the supervisor signature and
resolves/registers the user**, then hands the mutated credential back to the auth manager's own
model (which signs the credential envelope) and to the project's auth service (which exchanges it
for the final `Ed25519BasicToken` bearer). No new token-minting code.

## Type & payload

- `AuthenticationType.Supervisor = 'pk-supervisor'` (in `@owlmeans/auth`).
- Shared signed payload: `buildSupervisorPayload(challenge, userId, salt)` (in `@owlmeans/auth`) —
  binds the signature to the **single-use server challenge** (replay protection), the target
  `userId`, and a fresh client `salt`. The front-end packs `{ salt, signature }` (JSON) into
  `AuthCredentials.credential`.

## Server: `appendSupervisorAuth` (from `@owlmeans/server-auth/manager`)

Call once on the **auth-manager** context (the one that serves `AUTHEN_INIT`/`AUTHEN_AUTHEN` and holds
`AUTH_SRV_KEY`), beside other plugin appends (e.g. `appendOtpPlugin`).

```ts
import { appendSupervisorAuth } from '@owlmeans/server-auth/manager'

appendSupervisorAuth(context, {
  supervisors: ['master-key', 'super-user', 'shared-key'], // TRUSTED record `name`s allowed to sign
  resolveUser: async (userId, ctx, { register }) => {        // find-or-create the target identity
    // wire to your identity store; return { userId, profileId?, entitySlug?, role?, scopes? }
  },
  allowRegistration: true,        // default true
  enabled: undefined,             // default: development only (cfg.debug.all || cfg.debug.supervisor)
  acceptInternalTokens: true,     // default true — see below
})
```

Options:
- `supervisors` — TRUSTED-record `name`s authorized to sign. Default `['master','superuser']`. The
  matching **public** key must be in the project's TRUSTED config; the **private** key is what the
  front-end signs with. Pick aliases whose private keys you actually have (e.g. in `.env.dev.secrets`).
- `resolveUser` — `(userId, context, { register }) => Promise<SupervisorUserResolution>`. Default:
  trust the id as-is (`{ userId }`). Wire it to `@owlmeans/server-auth-identity`'s
  `IdentityLinkingService` (`getLinkedProfile` / `linkProfile`) to find-or-create a real profile and
  organization entity. `SupervisorUserResolution` is `{ userId }` plus optional `profileId`,
  `entitySlug`, `role` and `scopes` — the organization value is a SLUG, the renameable public name
  that a token carries, never the stable `entityId`. `profileId` defaults to `userId`, `scopes` to
  the credential's own or `[ALL_SCOPES]`, and `role` to `AuthRole.User`.
- `enabled` — force on/off. Default is development only. **Never enable in real production.**
- `acceptInternalTokens` — when `true`, appends the internal `Ed25519BasicToken` guard
  (`DEFAULT_GUARD`) as a coguard on every already-guarded backend entrypoint, so internal OwlMeans
  tokens keep working where another guard (OIDC, say) is the primary one. The primary guard stays
  first; the internal guard only matches an `Ed25519BasicToken` authorization header. Also exposed
  standalone as `setupInternalTokenCoguard(entrypoints, guard?)`. Set `false` when the entrypoints
  already use `DEFAULT_GUARD` as their primary guard.
- `guard` — which guard alias `acceptInternalTokens` appends. Default `DEFAULT_GUARD` (`'auth'`).

## Web: `appendSupervisorAuth` (from `@owlmeans/web-auth`)

Call once on the web client context. Registers the self-contained login form plugin; the form renders
at the standard typed route `SUPERVISOR_LOGIN_PATH` = `/authentication/login/pk-supervisor`.

```ts
import { appendSupervisorAuth } from '@owlmeans/web-auth'

appendSupervisorAuth(context) // dev-only by default; or appendSupervisorAuth(context, { enabled })
```

The form (`data-testid="supervisor-auth-form"`, inputs `supervisor-user-id`, `supervisor-pk`, button
`supervisor-submit`, error `supervisor-error`) fetches a challenge, signs it, exchanges it for a
bearer, stores it, and redirects HOME — mirroring the Google plugin. (Alternatively, the side-effect
import `@owlmeans/web-auth/auth/plugins` always-registers it.)

The web append reads `cfg.debug.supervisor` alone; the server append accepts either
`cfg.debug.all` or `cfg.debug.supervisor`. A deployment that wants the operator login therefore sets
`debug.supervisor` — it is the flag both halves honour, and the only one that does not arrive by
accident. The plugin is `restricted`, so `appendSupervisorAuth` also writes
`cfg.security.auth.login.overrides` to make it offerable; `{ offer: false }` registers it without
advertising it.

## Tests: `@owlmeans/test-ui` helpers

- `authenticateViaSupervisorApi({ apiBaseUrl, userId, pk })` — drives the live API
  (`/authentication/init` → sign → `/authentication/authenticate` → `/authenticate`) and returns the
  final bearer. **No browser**; registers the user on first use. The "set a token directly via API" path.
- `loginViaSupervisorForm(page, { baseUrl, userId, pk })` — Playwright: drives the real login form
  end-to-end (faithful path that exercises the plugin + registration).
- `loginViaDispatcher(page, baseUrl, token)` — inject a pregenerated bearer via the standard
  `/dispatcher?token=` route (apps that override DISPATCHER, e.g. for a forced IdP, can't use this —
  use the form).
- `pregenerateAuthToken({ userId, pk, scopes?, role?, profileId?, source?, ... })` — offline mint via
  `@owlmeans/test-auth`'s `makeBearer`, using the project's **own** trusted signing key (lowest-level
  primitive). No plugin, no registration.

`loginViaSupervisorForm` answers a cookie-consent dialog by default (`consent: 'accept'`): an
OwlMeans app refuses to start an authentication flow until consent is answered, and the modal
intercepts every click at the form underneath. Both browser helpers navigate with
`waitUntil: 'domcontentloaded'` rather than Playwright's `load`, because `load` waits for every
subresource and a tag manager or analytics beacon that never settles holds it open until timeout.

## Security

- Development/stage only. Gate on `cfg.debug`; never ship enabled to real production.
- Anyone with a supervisor **private** key can impersonate/register any user — treat those keys as
  highly sensitive.

## Depends On
- `@owlmeans/auth` (type + `buildSupervisorPayload` + `SupervisorCredentialPayload`),
  `@owlmeans/basic-keys` (sign/verify), `@owlmeans/basic-ids` (the salt),
  `@owlmeans/auth-common` (`DEFAULT_GUARD`, `TrustedRecord`), `@owlmeans/config` (`TRUSTED`).
- Tests: `@owlmeans/test-ui` (the helpers above) over `@owlmeans/test-auth` (`makeBearer`).

## Related

`server-auth` (the plugin registry and the manager) · `web-auth` (the form package) ·
`server-auth-identity` (what `resolveUser` should be wired to) · `login-methods` (why a
`restricted` method has to be named in the configuration)
