---
name: supervisor-auth
description: PK-based supervisor authentication — a development-only login where a holder of one of the project's trusted private keys mints a token for any user id/email (registering them on first use), bypassing external IdPs. Primary use is end-to-end tests. Covers appendSupervisorAuth (server + web), the supervisor plugin, and the @owlmeans/test-ui helpers. Use when wiring or testing supervisor auth.
user-invocable: false
---

# PK-Based Supervisor Authentication

**Layer:** Server (`@owlmeans/server-auth`) + Web (`@owlmeans/web-auth`) + Tests (`@owlmeans/test-ui`)

A privileged, **development-only** auth path: a holder of one of the project's trusted private keys
(the allowlisted "supervisors") signs a server challenge to mint a valid owlmeans token for an
arbitrary user id / email — **without** Google/OIDC. Unknown users are **registered** on first use.
The primary purpose is deterministic **end-to-end tests** that authenticate against real environments.

It reuses the existing flow end-to-end: the plugin only **verifies the supervisor signature and
resolves/registers the user**, then hands the credential back to `makeAuthModel` (which signs the
credential envelope) and the project's auth service (which exchanges it for the final
`Ed25519BasicToken` bearer). No new token-minting code.

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
    // wire to your identity store; return { userId, profileId?, entityId?, role?, scopes? }
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
  trust the id as-is. Wire to `@owlmeans/server-auth-identity`'s `IdentityLinkingService`
  (`getLinkedProfile` / `linkProfile`) to find-or-create a real profile + entity.
- `enabled` — force on/off. Default is development only. **Never enable in real production.**
- `acceptInternalTokens` (requirement: understand internal tokens even when OIDC is the primary
  guard) — when `true`, ensures the internal `Ed25519BasicToken` guard (`DEFAULT_GUARD`) is accepted
  as a coguard on already-guarded modules. Also exposed standalone as
  `setupInternalTokenCoguard(modules, guard?)`. Set `false` when modules already use `DEFAULT_GUARD`
  as the primary guard (internal tokens already work).

## Web: `appendSupervisorAuth` (from `@owlmeans/web-auth`)

Call once on the web client context. Registers the self-contained login form plugin; the form renders
at the standard typed route `SUPERVISOR_LOGIN_PATH` = `/authentication/login/pk-supervisor`.

```ts
import { appendSupervisorAuth } from '@owlmeans/web-auth'

appendSupervisorAuth(context) // dev-only by default; or appendSupervisorAuth(context, { enabled })
```

The form (`data-testid="supervisor-auth-form"`, inputs `supervisor-user-id`, `supervisor-pk`, button
`supervisor-submit`) fetches a challenge, signs it, exchanges it for a bearer, stores it, and
redirects HOME — mirroring the Google plugin. (Alternatively, the side-effect import
`@owlmeans/web-auth/auth/plugins` always-registers it.)

## Tests: `@owlmeans/test-ui` helpers

- `authenticateViaSupervisorApi({ apiBaseUrl, userId, pk })` — drives the live API
  (`/authentication/init` → sign → `/authentication/authenticate` → `/authenticate`) and returns the
  final bearer. **No browser**; registers the user on first use. The "set a token directly via API" path.
- `loginViaSupervisorForm(page, { baseUrl, userId, pk })` — Playwright: drives the real login form
  end-to-end (faithful path that exercises the plugin + registration).
- `loginViaDispatcher(page, baseUrl, token)` — inject a pregenerated bearer via the standard
  `/dispatcher?token=` route (apps that override DISPATCHER, e.g. for a forced IdP, can't use this —
  use the form).
- `pregenerateAuthToken({ userId, pk, ... })` — offline mint via `@owlmeans/test-auth`'s `makeBearer`
  using the project's **own** trusted signing key (lowest-level primitive).

## Security

- Development/stage only. Gate on `cfg.debug`; never ship enabled to real production.
- Anyone with a supervisor **private** key can impersonate/register any user — treat those keys as
  highly sensitive.

## Depends On
- `@owlmeans/auth` (type + `buildSupervisorPayload`), `@owlmeans/basic-keys` (sign/verify),
  `@owlmeans/auth-common` (`DEFAULT_GUARD`, `TrustedRecord`), `@owlmeans/config` (`TRUSTED`).
