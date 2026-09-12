# @owlmeans/server-app

The main entry point for OwlMeans backend services — aggregates server packages and provides the `makeContext` + `main` bootstrap functions.

## Overview

- `makeContext(cfg)` creates a fully initialized server context with Fastify, auth, WebSocket, and static resource support
- `main(ctx, entrypoints)` registers entrypoints, initializes the context, and starts the HTTP server
- Re-exports the most commonly used symbols from lower-level packages so backend code has a single import target
- Used by every service in the viable monorepo

## Installation

```bash
bun add @owlmeans/server-app@^0.1.18-rc.27
```

## Usage

Bootstrap a backend service:

```typescript
import { makeContext, main, entrypoints, config, service, AppType } from '@owlmeans/server-app'

const appConfig = config(
  AppType.Backend,
  'manager-api',
  service({ service: 'manager-api', host: process.env.API_HOST!, port: 3000 }),
  { port: 3000, dbs: [{ service: 'mongo', alias: 'mongo', host: process.env.MONGO_HOST!, port: 27017 }] }
)

const context = makeContext(appConfig)
await main(context, [...entrypoints, ...serverBindings])
```

Bind a shared protocol with a handler:

```typescript
import { bind } from '@owlmeans/server-entrypoint'
import { handlers } from '@owlmeans/server-api'
import { appProtocols } from 'my-app-common'
import type { Context } from 'my-app-backend'

const api = handlers<Context>()
const serverBindings = [
  bind(appProtocols.api.project.create, api.request(appProtocols.api.project.create, async (req, ctx) =>
    (ctx as Context).project().create(req.body))),
]
```

## API

### `makeContext<C, T>(cfg, customize?): T`

Creates a server context with Fastify HTTP, WebSocket, static resources, and auth guard set up. Pass `customize: true` to skip the default auth setup.

### `main<R, C, T>(ctx, entrypoints): Promise<void>`

Registers entrypoints, calls `configure().init()`, then starts the Fastify server.

### Re-exported symbols (for convenience)

| Symbol | Source |
|---|---|
| `handlers` | `@owlmeans/server-api` |
| `bind`, `bindAll`, `guard` | `@owlmeans/server-entrypoint` |
| `route` | `@owlmeans/route` |
| `broute` | `@owlmeans/server-route` |
| `filter`, `body`, `params`, `EntrypointOutcome` | `@owlmeans/entrypoint` |
| `config`, `service`, `sservice`, `toConfigRecord` | various config packages |
| `AppType`, `BASE`, `assertContext` | `@owlmeans/context` |
| `DAUTH_GUARD` | `@owlmeans/server-auth` |
| `GUARD_ED25519`, `BED255_CASHE_RESOURCE` | `@owlmeans/auth-common` |
| `klusterize` | `@owlmeans/kluster` |
| `createListSchema`, `filterObject` | `@owlmeans/resource` |
| `Request`, `Response`, `RefedEntrypointHandler` | type re-exports |
| `Criteria`, `ListOptions`, `ListQuery`, `ListResult`, `Sort` | type re-exports from `@owlmeans/resource` |

### `entrypoints`

Default entrypoint array providing auth and API config routes. Spread into `main()`:
```typescript
await main(context, [...entrypoints, ...serverBindings])
```

## Related Packages

- [`@owlmeans/server-context`](../server-context) — `makeServerContext` called internally by `makeContext`
- [`@owlmeans/server-api`](../server-api) — typed handler factories re-exported here
- [`@owlmeans/server-entrypoint`](../server-entrypoint) — protocol binding helpers

<!-- owlmeans:agent-guidance:start -->
## Agent guidance

This package ships embedded agent skills under `agent-meta/`. After installing your
`@owlmeans/*` packages, run the OwlMeans agent-skills installer to place them into
your project's skill store (`.agents/skills/`):

```sh
npx @owlmeans/agent-skills@^0.1.18-rc.20
```

The embedded files are version-matched to this package release. Do not edit them
directly — they are regenerated on each publish. To contribute guidance edits,
open a PR against the source monorepo.
<!-- owlmeans:agent-guidance:end -->
