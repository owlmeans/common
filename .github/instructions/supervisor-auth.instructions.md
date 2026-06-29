---
description: "PK-based supervisor authentication (development-only): a holder of a project trusted private key mints a token for any user id/email (registering on first use), bypassing external IdPs. Use when wiring appendSupervisorAuth (server @owlmeans/server-auth/manager, web @owlmeans/web-auth) or writing supervisor-backed e2e tests with @owlmeans/test-ui."
applyTo: "**/*.ts, **/*.tsx"
---

# PK-Based Supervisor Authentication

Development-only privileged login: a holder of one of the project's trusted **private** keys signs a
single-use server challenge to mint a valid owlmeans token for an arbitrary user id / email, bypassing
Google/OIDC. Unknown users are registered on first use. Primary use: deterministic end-to-end tests.

- Type: `AuthenticationType.Supervisor = 'pk-supervisor'`. Shared signed payload:
  `buildSupervisorPayload(challenge, userId, salt)` — both from `@owlmeans/auth`.
- The plugin only verifies the signature (against allowlisted TRUSTED `name`s) and resolves/registers
  the user; the existing `makeAuthModel` + project auth service issue the final `Ed25519BasicToken`.
  Do not add new token-minting code.

## Server
Wire once on the auth-manager context (serves `AUTHEN_INIT`/`AUTHEN_AUTHEN`):

```ts
import { appendSupervisorAuth } from '@owlmeans/server-auth/manager'
appendSupervisorAuth(context, { supervisors: ['shared-key'], resolveUser })
```
Options: `supervisors` (TRUSTED `name`s allowed to sign; default `master`/`superuser`), `resolveUser`
(find-or-create via `@owlmeans/server-auth-identity` `IdentityLinkingService`), `allowRegistration`
(default true), `enabled` (default development only — `cfg.debug.all`/`cfg.debug.supervisor`),
`acceptInternalTokens` (default true; ensures `DEFAULT_GUARD`/`Ed25519BasicToken` is accepted even when
OIDC is primary — also `setupInternalTokenCoguard(modules, guard?)`).

## Web
```ts
import { appendSupervisorAuth } from '@owlmeans/web-auth'
appendSupervisorAuth(context) // dev-only; renders the form at /authentication/login/pk-supervisor
```

## Tests (`@owlmeans/test-ui`)
`authenticateViaSupervisorApi` (headless API → bearer), `loginViaSupervisorForm` (Playwright UI),
`loginViaDispatcher` (inject via `/dispatcher?token=`), `pregenerateAuthToken` (offline `makeBearer`).

## Rules
- **Never enable in real production.** Gate on `cfg.debug`. Supervisor private keys can impersonate any
  user — keep them in secrets only.
- Pick `supervisors` aliases whose private keys you actually have (e.g. `.env.dev.secrets`).
