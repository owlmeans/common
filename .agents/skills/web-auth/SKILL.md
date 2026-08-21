---
name: web-auth
description: How to use @owlmeans/web-auth — web client auth plugins that register into @owlmeans/client-auth/manager. Currently ships the development-only PK-based supervisor login form (appendSupervisorAuth). Auto-invoked when importing @owlmeans/web-auth.
user-invocable: false
---

# @owlmeans/web-auth

**Layer:** Web
**Install:** `"@owlmeans/web-auth": "^0.1.18-rc.8"` in `dependencies`

Web-side auth UI plugins that register into the shared `@owlmeans/client-auth/manager` plugin registry
(mirrors `@owlmeans/web-oidc-rp`). Currently ships the **PK-based supervisor** login form.

## Key Exports

| Export | Description |
|--------|-------------|
| `appendSupervisorAuth(context, opts?)` | Dev-only: register the supervisor login form plugin |
| `SUPERVISOR_LOGIN_PATH` | `/authentication/login/pk-supervisor` (the typed-route path) |
| `supervisorClientPlugin` | The client `AuthenticationPlugin` (self-contained form) |

## Subpath Exports
- `./auth/plugins` — side-effect import that always-registers the supervisor plugin
  (`import '@owlmeans/web-auth/auth/plugins'`). Prefer the dev-gated `appendSupervisorAuth`.

## Usage
```ts
import { appendSupervisorAuth } from '@owlmeans/web-auth'
// in your web client makeContext():
appendSupervisorAuth(context) // enabled in development only (cfg.debug)
```
The form renders at `SUPERVISOR_LOGIN_PATH` via the standard `CAUTHEN_AUTHEN_TYPED` route — no extra
route registration needed. Test ids: `supervisor-auth-form`, `supervisor-user-id`, `supervisor-pk`,
`supervisor-submit`, `supervisor-error`.

See the **supervisor-auth** skill for the full feature (server append, options, security, test helpers).

## Depends On
- `@owlmeans/client-auth`, `@owlmeans/web-client`, `@owlmeans/client`
- `@owlmeans/auth` (type + `buildSupervisorPayload`), `@owlmeans/basic-keys`, `@owlmeans/basic-ids`
