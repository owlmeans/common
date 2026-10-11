# @owlmeans/web-auth

Web-side authentication plugins that register into the shared `@owlmeans/client-auth/manager`
plugin registry. Today it ships one plugin: the development-only **PK supervisor** login form, where
a holder of one of the project's trusted private keys signs a server challenge to sign in as any
user id or email. A web client uses it to give end-to-end tests and operators a deterministic way in
on development and staging deployments. It is not a general sign-in package: regular login methods
come from `@owlmeans/client-auth` and its plugin packages (`@owlmeans/web-oidc-rp` for OIDC), and
the server half of the supervisor login — signature verification and user resolution — lives in
`@owlmeans/server-auth/manager`. The whole feature is described by the `supervisor-auth` skill; this
package by the `web-auth` skill.

## Installation

```bash
bun add @owlmeans/web-auth@^0.1.18-rc.65
```

`react` is a peer dependency.

## Concepts

- **Supervisor login** — `AuthenticationType.Supervisor` (`'pk-supervisor'`) from `@owlmeans/auth`.
  The browser signs `buildSupervisorPayload(challenge, userId, salt)` with an entered private key;
  the server checks the signature against its trusted public keys and issues a regular token.
- **Client auth plugin** — an `AuthenticationPlugin` placed into the `plugins` registry of
  `@owlmeans/client-auth/manager`, keyed by authentication type. The standard typed authentication
  route renders whichever plugin is registered for the type in its URL.
- **Restricted method** — `supervisorClientPlugin.method.restricted` is `true`, so registering the
  plugin does not put it on the sign-in screen. It is offered only where
  `cfg.security.auth.login.overrides` names it.
- **Deployment gate** — `appendSupervisorAuth` turns itself on only when `cfg.debug.supervisor ===
  true`. It deliberately ignores `cfg.debug.all`, which many applications set for unrelated reasons.

## Usage

### 1. Wire the gated append into the web context

Call it once in the web client's context factory, after the layer context is built.

```typescript
import { appendSupervisorAuth } from '@owlmeans/web-auth'
import { makeContext as makePanelContext } from '@owlmeans/web-panel'
import type { AppConfig, AppContext } from '@owlmeans/web-panel'

export const makeContext = <C extends AppConfig, T extends AppContext<C>>(cfg: C): T => {
  const context = makePanelContext<C, T>(cfg)
  appendSupervisorAuth(context)

  return context
}
```

With `cfg.debug.supervisor` unset the call returns the context untouched. With it set, the call
registers the plugin and fills the sign-in configuration that makes it offerable — only where a
value is missing:

| Path | Value written |
|---|---|
| `cfg.security.auth.login.secretKey` | `true` |
| `cfg.security.auth.login.overrides['pk-supervisor']` | `{ enabled: true }` |

### 2. Force it on or register it unadvertised

```typescript
import { appendSupervisorAuth, SUPERVISOR_LOGIN_PATH } from '@owlmeans/web-auth'

// ignore the debug flags — e.g. a dedicated e2e build
appendSupervisorAuth(context, { enabled: true })

// reachable only by URL, never listed on the sign-in screen
appendSupervisorAuth(context, { enabled: true, offer: false })

console.log(SUPERVISOR_LOGIN_PATH) // '/authentication/login/pk-supervisor'
```

### 3. Always-on side-effect import

The `./auth/plugins` subpath registers the plugin at import time with no gate and no sign-in
override. Prefer the gated append; use this only where the bundle itself is development-only.

```typescript
import '@owlmeans/web-auth/auth/plugins'
```

### 4. Drive the form from a test

The form lives at `SUPERVISOR_LOGIN_PATH` and exposes stable test ids. `@owlmeans/test-ui` wraps
them (`makePageHelper(page).loginViaSupervisorForm(...)`), but a raw Playwright test can fill them
directly:

```typescript
import { SUPERVISOR_LOGIN_PATH } from '@owlmeans/web-auth'

await page.goto(`${baseUrl}${SUPERVISOR_LOGIN_PATH}`, { waitUntil: 'domcontentloaded' })
await page.getByTestId('supervisor-user-id').fill('person@example.com')
await page.getByTestId('supervisor-pk').fill(process.env.SUPERVISOR_PK!)
await page.getByTestId('supervisor-submit').click()
```

On submit the form requests a fresh allowance, signs the challenge, user id and a fresh 16-character
salt, sends `JSON.stringify({ salt, signature })` as the credential (never the key), stores the
issued token through the client `AuthService`, and navigates via `landAfterLogin()` /
`landingUrl()` from `@owlmeans/client-auth/login`.

## API

### Main entry `@owlmeans/web-auth`

| Symbol | Kind | Purpose |
|---|---|---|
| `appendSupervisorAuth(context, opts?)` | function | Register `supervisorClientPlugin` and, unless `offer: false`, write the sign-in overrides; returns the same context. No-op unless enabled |
| `WebSupervisorAuthOptions` | type | `{ enabled?: boolean, offer?: boolean }` — `enabled` defaults to `cfg.debug.supervisor === true`, `offer` to `true` |
| `SUPERVISOR_LOGIN_PATH` | const | `/authentication/login/${AuthenticationType.Supervisor}` — the typed authentication route for the form |
| `supervisorClientPlugin` | `AuthenticationPlugin` | The self-contained form plugin |

`appendSupervisorAuth` accepts any context whose `cfg` carries optional `debug` and `security`
fields, so it works on every web client context.

### `supervisorClientPlugin`

| Member | Value |
|---|---|
| `type` | `AuthenticationType.Supervisor` |
| `method` | `{ order: 900, icon: 'key', emphasis: 'link', restricted: true }` — last, rendered as a link |
| `Implementation` | React form with test ids `supervisor-auth-form`, `supervisor-user-id`, `supervisor-pk`, `supervisor-submit`, `supervisor-error` |
| `authenticate(credentials)` | Signs the payload with `credentials.credential` as the private key, replaces it with the packed `{ salt, signature }`, returns `{ token: '' }`; the real token comes from the backend through the auth control |

### Subpath `@owlmeans/web-auth/auth/plugins`

| Symbol | Purpose |
|---|---|
| (side effect) | `plugins[AuthenticationType.Supervisor] = supervisorClientPlugin` on import |
| `plugins` | the shared `@owlmeans/client-auth/manager` registry, re-exported |
| `supervisorClientPlugin` | same object as the main entry |

## Common pitfalls

- Setting only `cfg.debug.all` does not enable the web form; set `cfg.debug.supervisor` (the server
  half honours either flag, so `debug.supervisor` is the one both halves agree on).
- The web plugin alone signs nothing useful: the server must call `appendSupervisorAuth` from
  `@owlmeans/server-auth/manager` with `supervisors` naming trusted records whose private keys you
  hold.
- Registering the plugin by hand (or through the side-effect import) does not offer it — the method
  is `restricted` until `cfg.security.auth.login.overrides` enables it.
- Overrides already present in the config win: `appendSupervisorAuth` only fills missing values, so
  an explicit `{ enabled: false }` keeps the method off the screen.
- Never ship a supervisor-enabled build to real production — anyone holding a supervisor private key
  can sign in as, and register, any user.
- No extra route is needed; the form renders through the standard `CAUTHEN_AUTHEN_TYPED` route.

## Related packages

- [`@owlmeans/client-auth`](../client-auth) — the plugin registry, auth control and post-login landing
- [`@owlmeans/server-auth`](../server-auth) — the server `appendSupervisorAuth` that verifies the signature
- [`@owlmeans/auth`](../auth) — `AuthenticationType.Supervisor` and `buildSupervisorPayload`
- [`@owlmeans/basic-keys`](../basic-keys) — the key model used to sign
- [`@owlmeans/web-oidc-rp`](../web-oidc-rp) — another web auth plugin registering into the same registry
- [`@owlmeans/test-ui`](../test-ui) — supervisor login helpers for API and Playwright tests

<!-- owlmeans:agent-guidance:start -->
## Agent guidance

This package ships embedded agent skills under `agent-meta/`. After installing your
`@owlmeans/*` packages, run the OwlMeans agent-skills installer to place them into
your project's skill store (`.agents/skills/`):

```sh
npx @owlmeans/agent-skills@^0.1.18-rc.53
```

The embedded files are version-matched to this package release. Do not edit them
directly — they are regenerated on each publish. To contribute guidance edits,
open a PR against the source monorepo.
<!-- owlmeans:agent-guidance:end -->
