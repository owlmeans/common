# @owlmeans/api-config-client

Client-side middleware that fetches server config from `GET /assets/config.json` and merges it into
the client context. It is the browser half of the runtime config flow: `@owlmeans/api-config`
declares the `advertise` protocol and the public-field allowlist, `@owlmeans/api-config-server`
answers it, and this package binds and calls it during `init()`. An app built on
`@owlmeans/web-panel` or `@owlmeans/mui-panel` already has both halves wired and does not touch
this package; a client context built from a lower layer registers it itself. Config that is fixed at
build time needs no runtime fetch — use `@owlmeans/client-config` for that. The package's skill is
`api-config-client`.

## Installation

```bash
bun add @owlmeans/api-config-client@^0.1.18-rc.46
```

The middleware imports `mergeConfig` from `@owlmeans/config`, which this package's manifest does not
declare; a standalone install adds `@owlmeans/config` to its own dependencies.

## Concepts

- **Advertise protocol** — `advertise` from `@owlmeans/api-config`, alias `API_CONFIG`
  (`'api-config:advertise'`), an open sticky route at `/assets/config.json`.
- **Binding** — `entrypoints`, this package's `[bind(advertise)]`: the client entrypoint the
  middleware resolves by alias.
- **Middleware** — `apiConfigMiddleware`, a `Context` / `Loading` middleware: it runs once during
  `init()`, after every service and resource has initialized and before the context becomes ready.
- **Primary host** — `cfg.primaryHost` / `cfg.primaryPort`: where the config is fetched from. The
  fetch happens only when `primaryHost` is set; `@owlmeans/web-client` fills both from
  `window.location`.
- **Merge** — the answer is merged into `context.cfg` in place with `configHelper.mergeConfig`.

## Usage

### Wire both halves in a lower-layer client context

The middleware does the work; the binding is what it calls. Registering one without the other fails
the boot.

```typescript
import { makeClientContext } from '@owlmeans/client-context'
import { apiConfigMiddleware, entrypoints as apiConfigBindings } from '@owlmeans/api-config-client'

export const makeContext = <C extends AppConfig, T extends AppContext<C>>(cfg: C): T => {
  const context = makeClientContext<C, T>(cfg)
  context.registerMiddleware(apiConfigMiddleware)

  return context
}

export const clientBindings = [...apiConfigBindings, ...myClientBindings]
```

### Point the fetch at a backend

```typescript
const context = makeContext({
  ...config,
  primaryHost: 'app.example.com',
  primaryPort: 8443,
})

await context.configure().init() // fetches /assets/config.json from app.example.com:8443 and merges it
```

### Read merged values at render or request time

```typescript
const brand = context.cfg.brand // the server's value once init() has resolved
```

A service that copied a config value during its own `init()` keeps the bundled value — the merge
happens after service initialization.

## API

| Symbol | Kind | Purpose |
|---|---|---|
| `apiConfigMiddleware` | `Middleware` | `Context` / `Loading`; resolves `API_CONFIG`, sets the route's `host`/`port` from `cfg.primaryHost`/`cfg.primaryPort`, calls it and merges the `ApiConfig` answer into `context.cfg` |
| `entrypoints` | `ClientEntrypoint[]` | `[bind(advertise)]` — the browser-local binding of the shared runtime-config protocol |

### Merge behaviour

`configHelper.mergeConfig` merges objects key by key and appends arrays. A server value replaces the
bundled one only where the bundled value is a scalar, `null` or absent; a scalar sent for a bundled
object or array is dropped silently, and a bundled array grows on every merge.

## Common pitfalls

- Registering `apiConfigMiddleware` without the `entrypoints` bindings — `init()` throws
  `SyntaxError: Entrypoint api-config:advertise not found` rather than silently falling back.
- No `cfg.primaryHost` — the middleware does nothing and the app runs on the bundled config.
- A failed fetch is logged (`API config not loaded`) and swallowed; an unreachable backend shows up
  as missing values later, never as a boot error.
- Registering the pair again on a `web-panel` / `mui-panel` context — those factories already do it.
- Expecting the server to empty or replace a bundled array — the merge only appends.
- Only fields an `apiConfigPlugin` allows are advertised; a value missing on the client may simply
  not be exposed by the server.

## Related packages

- [`@owlmeans/api-config`](../api-config) — `API_CONFIG`, the `advertise` protocol, `ApiConfig` and the field allowlist
- [`@owlmeans/api-config-server`](../api-config-server) — server that serves the config endpoint
- [`@owlmeans/config`](../config) — `configHelper.mergeConfig`
- [`@owlmeans/client-entrypoint`](../client-entrypoint) — `bind`, the client entrypoint binding
- [`@owlmeans/client-context`](../client-context) — the client context and `primaryHost` / `primaryPort`
- [`@owlmeans/web-panel`](../web-panel) — a panel factory that already wires this package

<!-- owlmeans:agent-guidance:start -->
## Agent guidance

This package ships embedded agent skills under `agent-meta/`. After installing your
`@owlmeans/*` packages, run the OwlMeans agent-skills installer to place them into
your project's skill store (`.agents/skills/`):

```sh
npx @owlmeans/agent-skills@^0.1.18-rc.51
```

The embedded files are version-matched to this package release. Do not edit them
directly — they are regenerated on each publish. To contribute guidance edits,
open a PR against the source monorepo.
<!-- owlmeans:agent-guidance:end -->
