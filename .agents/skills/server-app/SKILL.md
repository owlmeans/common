---
name: server-app
description: How to use @owlmeans/server-app — main() entry point, makeContext(), the bind-first boot (holdApiPort + boot state), handleRequest()/handleBody() handler wrappers, elevate()/celevate() to attach handlers to entrypoint declarations, and the config and entrypoint builders it re-exports. Auto-invoked when working with the server entry point, the server context factory, or request handlers.
user-invocable: false
---

# @owlmeans/server-app

**Layer:** Server
**Install:** `"@owlmeans/server-app": "^0.1.18-rc.17"` in `dependencies`

The one package a backend application depends on directly. It assembles the server context, owns the
process entry point, and re-exports everything an app needs to declare its config, its entrypoints
and its handlers — so an app on it rarely imports the server layer packages by name.

## Key Exports

| Export | Description |
|--------|-------------|
| `main<R, C, T>(ctx, entrypoints)` | Entry point — registers all entrypoints, configures/inits the context, then boots the Fastify API server (`@owlmeans/server-api`) |
| `makeContext(cfg, customize?)` | Build the server context with API server, API client, sockets, static resource and auth appended |
| `AppConfig`, `AppContext<C>` | The config and context types an app extends |
| `entrypoints` | Built-in system entrypoints — the auth endpoints plus the api-config advertise endpoint; spread into `appEntrypoints` |

### Building the config

| Export | Description |
|--------|-------------|
| `config(service, cfg?)` | Start a server config for this service |
| `sservice(service, cfg?)` | Declare a backend service route into `cfg.services` |
| `addWebService(service, alias?, cfg?)` | Declare a frontend service the app addresses |
| `service(route, cfg?)`, `toConfigRecord(obj)`, `PLUGINS` | Generic service declaration and config records |
| `AppType`, `BASE` | The app-type enum, and `base` — the alias of the intermediate area whose children require authentication |
| `PluginConfig` | Plugin config record shape |

### Declaring and elevating entrypoints

| Export | Description |
|--------|-------------|
| `entrypoint(...)`, `route(...)`, `broute(...)` | Declaration builders — `entrypoint` from server-entrypoint (it builds a `ServerEntrypoint`), `route` from route, `broute` from server-route |
| `elevate(entrypoints, alias, handler?, opts?)` | Attach a handler to an entrypoint declaration |
| `celevate(entrypoints, alias, handler?, opts?)` | Make a declaration client-callable from the server side |
| `guard(alias, opts?)` | Options requiring a guard |
| `DAUTH_GUARD` | Alias of the default auth guard (`auth`) |
| `GUARD_ED25519`, `BED255_CASHE_RESOURCE` | The service-to-service signature guard and its nonce cache |
| `filter`, `body`, `params`, `EntrypointOutcome` | Validators and the outcome enum |

### Writing handlers

| Export | Description |
|--------|-------------|
| `handleRequest(fn)` | Wrap an async function as a server handler `(req, context) => result` |
| `handleBody<T>(fn)` | Wrap an async function with validated body — `(payload, context, req) => result` |
| `handleParams<T>(fn)` | The same, over validated URL params |
| `Request`, `Response`, `Module`, `RefedEntrypointHandler`, `ClientEntrypoint` | Handler and entrypoint types |
| `createListSchema(schema)`, `filterObject(obj, keep?)` | List-result schema and object whitelisting |
| `Criteria`, `ListOptions`, `ListQuery`, `ListResult`, `Sort` | Resource query types |
| `assertContext(ctx, location?)` | Narrow a possibly-undefined context, throwing where it is missing |

### Booting

| Export | Description |
|--------|-------------|
| `holdApiPort(cfg, opts?)` | Own the app's port during boot |
| `ApiPortHold`, `ApiPortHoldOptions` | The hold handle and its options |
| `setBootPhase(phase, detail?)` | Record the process boot phase — `'initializing' \| 'ready' \| 'failed'` |
| `getBootPhase()` / `getBootDetail()` | Read it back |
| `bootHealthPayload()` | The health body: `{ status, phase, ok, reason?, bootId, pid }` |
| `bootHold(okPath?)` | `holdApiPort` options wired to the boot state |
| `BootPhase`, `BootHealth`, `BOOT_ID_ENV` | Boot-state types and the supervisor's boot-id env var |
| `klusterize(ctx, alias?)` | Register the cluster client and its config-directive middleware |

## Usage

### Entry point
```typescript
// index.ts
import { main } from '@owlmeans/server-app'
import config from './config.js'
import { makeContext } from './context.js'
import { appEntrypoints } from './entrypoints.js'

const context = makeContext(config)
main<{}, Config, Context>(context, appEntrypoints)
```

`makeContext(cfg, customize)` appends the API server, the API client, the socket service and its
middleware, and the static resource. Passing `customize: true` — or having already registered the
auth cache resource — leaves the auth service and its cache out, which is what an app that supplies
its own authentication does.

### Bind-first boot

An app that must be able to explain a *failed* boot does not call `main()`; it binds the port
first, so the failure has somewhere to be reported from. Never hand-roll the phase module —
`boot-state` is it.

```typescript
import { holdApiPort, bootHold, setBootPhase, bootHealthPayload } from '@owlmeans/server-app'

const hold = await holdApiPort(ctx.cfg, bootHold(HEALTH_PATH)).catch((error: Error) => {
  console.error(`[boot] STARTUP FAILED — ${error.message}`)
  process.exit(1)   // a bind failure is fatal — see below
})

try {
  await ctx.configure().init()
} catch (error) {
  setBootPhase('failed', (error as Error).message)
  return            // stay alive: the hold is the only thing that can explain the failure
}

await hold.release()
setBootPhase('ready')
await ctx.getApiServer().listen()
```

Rules this encodes:

- **Bind before you initialize.** Everything after the bind can fail, and a failure before it is
  invisible — the edge answers a bare connect error naming neither the app nor the reason.
- **A bind failure exits non-zero.** Carried past, the boot ends with nothing listening and nothing
  holding the event loop: a clean exit 0 while a predecessor keeps serving stale code.
- **A failed init returns rather than exits.** The hold keeps answering `HEALTH_PATH` with
  `phase: 'failed'` and the reason; everything else gets 503.
- **`hold.release()` is awaited** — `listen()` throws while a predecessor still owns the socket.
- **The app's own health handler spreads `bootHealthPayload()`**, so the body does not change shape
  under a consumer polling across the handover:

  ```typescript
  export const handleHealtz = handleRequest(async (_req, ctx) => ({
    ...bootHealthPayload(), db: await pingDb(ctx)
  }))
  ```

`bootId` is identity, not health: a supervisor stamps the child it spawns via `BOOT_ID_ENV`
(`OWLMEANS_BOOT_ID`) and compares it here — another id means a leftover process holds the port.

### Handlers
```typescript
import { handleRequest, handleBody } from '@owlmeans/server-app'
import { requireEntityKey } from '@owlmeans/auth-common'
import type { ClientEntrypoint } from '@owlmeans/server-app'

export const list = handleRequest(async (req, context) => {
  const ctx = context as Context
  const { items } = await ctx.project().list({ entityId: requireEntityKey(req) })
  return items
})

export const create = handleBody<CreateProject>(async (payload, context) => {
  const ctx = context as Context
  return await ctx.entrypoint<ClientEntrypoint<Project>>(agent.project.create).call({
    body: { prompt: payload.prompt }
  })
})
```

**Key organization-scoped records by `requireEntityKey(req)` / `entityKeyOf(req)` from
`@owlmeans/auth-common`.** The token carries only `entitySlug`, which is renameable — there is no id
on it. The guard resolves that slug once, at the boundary, and hands the result to the handler as
`req.entity` (`{ id, slug, iamKey }`); those two helpers return `req.entity.id` and fall back to the
slug for a deployment that registers no entity resolver, and `requireEntityKey` throws
`AuthorizationError` when the request names no organization at all. `requireEntity(req)` gives the
whole record when the slug or the frozen `iamKey` is wanted too.

The id stays inside the process: it is what records, grants and permission checks key on, and it
never goes onto the wire. A cross-service call carries the caller's token, so the peer resolves the
organization for itself; anything that must name one in a payload names it by `entitySlug`.

A cross-service call from a handler uses `call()` — it resolves to the value and throws whatever the
peer replied. Reach for `invoke()` only where the outcome decides what happens next.

### Entrypoint elevation
```typescript
// entrypoints.ts
import { elevate, entrypoints as systemEntrypoints } from '@owlmeans/server-app'
import { managerEntrypoints } from 'my-common'
import { create, list } from './app/project/index.js'

elevate(managerEntrypoints, manager.back.project.create, create)
elevate(managerEntrypoints, manager.back.project.list, list)

export const appEntrypoints = [...systemEntrypoints, ...paymentEntrypoints, ...managerEntrypoints]
```

Elevating is idempotent, so a later `elevate` of the same alias is legal and simply replaces the
element again; the guards it brings are added to the declared ones rather than replacing them.

A parent alias needs no elevation for its `guard()` to reach its children — `getGuards()` walks the
registered declarations whether or not they were elevated. A **bare** `elevate(entrypoints, alias)`
only turns the declaration into a server entrypoint; with no handler it is never bound as a route,
and it runs in the intermediate chain only when the same call passes `true` (or
`{ intermediate: true }`) along with a `handleIntermediate` handler from `@owlmeans/server-api`.
`guard()` is re-exported here; `gate()` is not — take it from `@owlmeans/entrypoint`.

## Depends On

Declared:

- `@owlmeans/server-context`, `@owlmeans/server-entrypoint`, `@owlmeans/server-route`, `@owlmeans/server-api`, `@owlmeans/server-auth`, `@owlmeans/server-socket`
- `@owlmeans/api`, `@owlmeans/static-resource`, `@owlmeans/kluster`
- `@owlmeans/entrypoint`, `@owlmeans/route`, `@owlmeans/config`, `@owlmeans/client-config`, `@owlmeans/client-entrypoint`, `@owlmeans/context`

Imported but **not** declared in this package's manifest: `@owlmeans/api-config-server` (its
advertise endpoint is in `entrypoints`), `@owlmeans/auth-common` (`GUARD_ED25519`),
`@owlmeans/resource` (the list schema and the query types) and `@owlmeans/server-config`
(`sservice`). A workspace resolves them anyway; a standalone install has to name them in its own
dependencies.

The HTTP server is Fastify, built by `@owlmeans/server-api` — this package neither depends on
`fastify` nor exposes it. There is no Express anywhere in this layer.
