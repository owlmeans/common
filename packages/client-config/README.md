# @owlmeans/client-config

The bottom of the client config stack: `BasicClientConfig` — the four fields a client adds to
`CommonConfig` (`webService`, `primaryHost`, `primaryPort`, `shortAlias`) — and `addWebService()`,
which names the API client that carries outgoing entrypoint calls. An app uses it when it types a
client config or points calls at a specific API client, usually through the re-export in the layer
package it already imports (`@owlmeans/web-panel`, `@owlmeans/mui-panel`, `@owlmeans/server-app`).
It does not build a context and it is not the config a context is built from: `ClientConfig` (with
`services` and `i18n`) and `makeClientContext` live in `@owlmeans/client-context`, and the config
object itself comes from `config()` in `@owlmeans/client-context` (re-exported by the web layers). Nothing here
knows about React or the browser.

## Installation

```bash
bun add @owlmeans/client-config@^0.1.18-rc.45
```

## Concepts

- **API client** — a service registered on the context (`appendApiClient` from `@owlmeans/api`,
  default alias `'web-client'`) that performs HTTP calls. `webService` holds the alias of such a
  client, never the alias of a backend service.
- **`webService`** — either one API client alias for every call, or a record mapping a *target
  service* alias to an API client alias, with `DEFAULT_KEY` (`'default'`) as the fallback.
- **Primary host** — `primaryHost` / `primaryPort`, the address the app is served from.
  `@owlmeans/web-client` fills them from `window.location`; `@owlmeans/api-config-client` uses them
  to reach `/assets/config.json`.
- **Short alias** — `shortAlias`, an abbreviation of `service` so a flow or a redirect can name this
  app in a query parameter.

## Usage

### Type a client config

```typescript
import type { BasicClientConfig } from '@owlmeans/client-config'

export interface ReportsWebConfig extends BasicClientConfig {
  reportsPageSize?: number
}
```

### Rely on the default API client

`makeClientContext` (and the server context in `@owlmeans/server-app`) runs `appendApiClient`, which
sets `webService` to its own alias when the config left it unset. Most apps never call
`addWebService`.

### Route calls through a specific API client

```typescript
import { addWebService } from '@owlmeans/client-config'
import { config } from '@owlmeans/client-context'

addWebService(API_CLIENT, cfg)                // one API client for every call
addWebService(BILLING_CLIENT, BILLING, cfg)   // ...and this one for calls to the billing service

// Without a cfg it returns a fresh partial config to spread
const appConfig = config<AppConfig>('reports-web', {
  ...addWebService<AppConfig>(API_CLIENT),
})
```

## API

| Export | Kind | Purpose |
|---|---|---|
| `BasicClientConfig` | interface | `CommonConfig` + `webService?: string \| Record<string, string>`, `primaryHost?`, `primaryPort?`, `shortAlias?` |
| `addWebService<C>(service, alias?, cfg?)` | function | Writes `service` (an API client alias) into `cfg.webService` and returns the config; `alias` may be omitted and `cfg` passed second |
| `DEFAULT_KEY` | const | `'default'` — the fallback key of a `webService` record |

### What `addWebService` writes

Two-argument form (`service`, `cfg`) sets the general answer: an unset or string `webService`
becomes `service`; on a record only `DEFAULT_KEY` is written.

Three-argument form (`service`, `alias`, `cfg`) never drops what is already there:

| `webService` before | After `addWebService(S, ALIAS, cfg)` |
|---|---|
| unset | `{ default: S, ALIAS: S }` — the first per-service call also becomes the default |
| the string `X` | `{ default: X, ALIAS: S }` |
| a record | that record with `ALIAS: S` added |

### How a call resolves it

A client entrypoint (`@owlmeans/client-entrypoint`) reads `webService` on every call: a string is
used as is; a record is looked up by the target service alias, then `DEFAULT_KEY`.

## Common pitfalls

- `webService` names an **API client service**, not a backend. Passing a backend alias makes every
  call fail with `Service <name> not found`.
- An absent `webService` fails every client entrypoint call with `SyntaxError('No webService
  provided')`, even when a registered transport would have carried it.
- A record with neither the target service alias nor `default` fails with
  ``SyntaxError("Can't cast web service alias for <alias> entrypoint")``.
- The first three-argument call on an unset `webService` also sets `default`; name the general
  client first when the per-service one should stay specific.
- Do not set `primaryHost` / `primaryPort` by hand in a web app; `@owlmeans/web-client` fills them.
- `webService` has no `apiConfigPlugin()` registration, so the server never advertises it — every
  client names its API client locally.

## Related packages

- [`@owlmeans/config`](../config) — `CommonConfig`, the base this shape extends
- [`@owlmeans/client-context`](../client-context) — `ClientConfig`, `config()` and `makeClientContext`
- [`@owlmeans/api`](../api) — `appendApiClient`, the API client `webService` points at
- [`@owlmeans/client-entrypoint`](../client-entrypoint) — the caller that resolves `webService`
- [`@owlmeans/web-client`](../web-client) — fills `primaryHost` / `primaryPort` in the browser
- [`@owlmeans/api-config-client`](../api-config-client) — reaches the config endpoint through the primary host

The `client-config` skill covers the same contract for agents.

<!-- owlmeans:agent-guidance:start -->
## Agent guidance

This package ships embedded agent skills under `agent-meta/`. After installing your
`@owlmeans/*` packages, run the OwlMeans agent-skills installer to place them into
your project's skill store (`.agents/skills/`):

```sh
npx @owlmeans/agent-skills@^0.1.18-rc.52
```

The embedded files are version-matched to this package release. Do not edit them
directly — they are regenerated on each publish. To contribute guidance edits,
open a PR against the source monorepo.
<!-- owlmeans:agent-guidance:end -->
