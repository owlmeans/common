---
name: web-auth
description: How to use @owlmeans/web-auth — web-side authentication-plugin package that registers into the shared @owlmeans/client-auth/manager registry. It ships the development-only PK supervisor login form (appendSupervisorAuth, supervisorClientPlugin, SUPERVISOR_LOGIN_PATH). Auto-invoked when importing @owlmeans/web-auth or wiring the supervisor login into a web client.
user-invocable: false
---
<!-- AUTO-GENERATED — do not edit. Regenerate via sync-agent-meta. -->

# @owlmeans/web-auth

**Layer:** Web
**Install:** `"@owlmeans/web-auth": "^0.1.18-rc.24"` in `dependencies`

Web-side auth UI plugins registering into the shared `@owlmeans/client-auth/manager` plugin registry
(mirroring `@owlmeans/web-oidc-rp`). It ships the **PK supervisor** login form.

## Key Exports

| Export | Description |
|--------|-------------|
| `appendSupervisorAuth(context, opts?)` | Register the supervisor login plugin and, unless told otherwise, offer it on the sign-in screen |
| `WebSupervisorAuthOptions` | `{ enabled?, offer? }` |
| `SUPERVISOR_LOGIN_PATH` | `/authentication/login/pk-supervisor` — the typed-route path |
| `supervisorClientPlugin` | The client `AuthenticationPlugin`: a self-contained form that signs the server challenge and hands the packed credential to the standard auth control |

## Subpath Exports

- `./auth/plugins` — a side-effect import that always registers the supervisor plugin
  (`import '@owlmeans/web-auth/auth/plugins'`). Prefer the gated `appendSupervisorAuth`.

## Usage

```ts
import { appendSupervisorAuth } from '@owlmeans/web-auth'

// in the web client's makeContext():
appendSupervisorAuth(context)
```

**It reads `cfg.debug.supervisor`, and deliberately NOT `cfg.debug.all`.** Whole families of
OwlMeans applications set `debug.all` for reasons that have nothing to do with authentication — a
Viable-generated target sets it for itself — so gating on it would put an operator login on every
one of them, in production, reachable by anyone who typed the URL. Pass `{ enabled: true }` to force
it on regardless of the debug flags.

Registering the plugin is not enough to make it OFFERED: `supervisorClientPlugin` carries
`restricted: true`, so the sign-in screen shows it only where the configuration names it. That is
what `appendSupervisorAuth` writes into `cfg.security.auth.login.overrides` (and
`login.secretKey`) when it enables the plugin — pass `{ offer: false }` to register it without
advertising it.

The form renders at `SUPERVISOR_LOGIN_PATH` through the standard `CAUTHEN_AUTHEN_TYPED` route, so
no extra route registration is needed. It orders itself last (`order: 900`) and renders as a link,
because it is a tool rather than a way in. Test ids: `supervisor-auth-form`, `supervisor-user-id`,
`supervisor-pk`, `supervisor-submit`, `supervisor-error`.

On submit the form requests a fresh allowance, signs `buildSupervisorPayload(challenge, userId,
salt)` with the entered private key, packs `{ salt, signature }` as the credential, exchanges the
resulting token through the client `AuthService`, and navigates to `HOME`.

See the **supervisor-auth** skill for the whole feature — the server append, its options, the
security boundary and the `@owlmeans/test-ui` helpers.

## Depends On
- `@owlmeans/client-auth` (the manager plugin registry), `@owlmeans/web-client`, `@owlmeans/client`
- `@owlmeans/auth` — `AuthenticationType.Supervisor`, `buildSupervisorPayload`
- `@owlmeans/auth-common` — the client `AuthService` type
- `@owlmeans/basic-keys` (signing), `@owlmeans/basic-ids` (the salt), `@owlmeans/config`
