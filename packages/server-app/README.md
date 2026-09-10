# @owlmeans/server-app

The main entry point for OwlMeans backend services — aggregates server packages and provides the `makeContext` + `main` bootstrap functions.

## Overview

- `makeContext(cfg)` creates a fully initialized server context with Fastify, auth, WebSocket, and static resource support
- `main(ctx, entrypoints)` registers entrypoints, initializes the context, and starts the HTTP server
- `holdApiPort` + the boot-state module give a bind-first boot: the port answers for the app before it initializes
- Re-exports the most commonly used symbols from lower-level packages so backend code has a single import target
- Used by every service in the viable monorepo

## Installation

```bash
bun add @owlmeans/server-app@^0.1.18-rc.17
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
await main(context, [...entrypoints, ...appEntrypoints])
```

Elevate an entrypoint with a handler:

```typescript
import { elevate, handleBody, guard, GUARD_ED25519 } from '@owlmeans/server-app'
import { appEntrypoints } from './entrypoints'

elevate(appEntrypoints, 'project-create', handleBody<CreateProject>(async (payload, ctx) => {
  return await (ctx as Context).project().create(payload)
}), guard(GUARD_ED25519))
```

### Bind-first boot

`main()` is the short path. An app that must explain a **failed** boot binds the port first instead,
so a startup failure has somewhere to be reported from — without a listener the edge answers a bare
connect error that names neither the app nor the cause:

```typescript
import { holdApiPort, bootHold, setBootPhase, bootHealthPayload } from '@owlmeans/server-app'

const hold = await holdApiPort(ctx.cfg, bootHold(HEALTH_PATH)).catch((error: Error) => {
  // A failure to BIND is fatal: carried past, the boot ends with nothing listening and exits 0
  // while a predecessor keeps serving stale code. Exit non-zero so a supervisor reclaims the port.
  console.error(`[boot] STARTUP FAILED — ${error.message}`)
  process.exit(1)
})

try {
  await ctx.configure().init()
} catch (error) {
  // Stay alive: the hold is the only thing that can explain why nothing is serving.
  setBootPhase('failed', (error as Error).message)
  return
}

await hold.release()          // awaited — `listen()` throws while a predecessor holds the socket
setBootPhase('ready')
await ctx.getApiServer().listen()
```

The hold answers `HEALTH_PATH` with `bootHealthPayload()` and everything else with **503** (not 404
— the real routes do not exist yet). Once the app's own server takes the socket, its health handler
spreads the same `bootHealthPayload()` into its answer, so a consumer polling across the handover
never sees the body change under it:

```typescript
export const handleHealtz = handleRequest(async (_req, ctx) => ({
  ...bootHealthPayload(),
  db: await pingDb(ctx)
}))
```

## API

### `makeContext<C, T>(cfg, customize?): T`

Creates a server context with Fastify HTTP, WebSocket, static resources, and auth guard set up. Pass `customize: true` to skip the default auth setup.

### `main<R, C, T>(ctx, entrypoints): Promise<void>`

Registers entrypoints, calls `configure().init()`, then starts the Fastify server.

### Boot state

Process-wide boot phase, shared by the port hold and the app's own health handler.

| Symbol | Description |
|---|---|
| `setBootPhase(phase, detail?)` | Record the phase; `detail` is free text kept for every phase |
| `getBootPhase(): BootPhase` / `getBootDetail()` | Current phase and its detail |
| `bootHealthPayload(): BootHealth` | `{ status, phase, ok, reason?, bootId, pid }` — the health body |
| `bootHold(okPath?): ApiPortHoldOptions` | `holdApiPort` options wired to this module |
| `BootPhase` | `'initializing' \| 'ready' \| 'failed'` |
| `BOOT_ID_ENV` | `'OWLMEANS_BOOT_ID'` — a supervisor stamps the child, `bootId` echoes it back |

`bootId` is identity, not health: an answer carrying an id other than the one the supervisor spawned
means a leftover process still owns the port and the health it reports describes code nobody asked
for.

### Re-exported symbols (for convenience)

| Symbol | Source |
|---|---|
| `handleBody`, `handleParams`, `handleRequest` | `@owlmeans/server-api` |
| `elevate`, `entrypoint`, `guard` | `@owlmeans/server-entrypoint` |
| `celevate` | `@owlmeans/client-entrypoint` |
| `route` | `@owlmeans/route` |
| `broute` | `@owlmeans/server-route` |
| `filter`, `body`, `params`, `EntrypointOutcome` | `@owlmeans/entrypoint` |
| `config`, `service`, `sservice`, `toConfigRecord` | various config packages |
| `AppType`, `BASE`, `assertContext` | `@owlmeans/context` |
| `DAUTH_GUARD` | `@owlmeans/server-auth` |
| `GUARD_ED25519`, `BED255_CASHE_RESOURCE` | `@owlmeans/auth-common` |
| `klusterize` | `@owlmeans/kluster` |
| `createListSchema`, `filterObject` | `@owlmeans/resource` |
| `Request`, `Response`, `ClientEntrypoint`, `RefedEntrypointHandler` | type re-exports |
| `Criteria`, `ListOptions`, `ListQuery`, `ListResult`, `Sort` | type re-exports from `@owlmeans/resource` |

### `entrypoints`

Default entrypoint array providing auth and API config routes. Spread into `main()`:
```typescript
await main(context, [...entrypoints, ...myEntrypoints])
```

## Related Packages

- [`@owlmeans/server-context`](../server-context) — `makeServerContext` called internally by `makeContext`
- [`@owlmeans/server-api`](../server-api) — handler wrappers re-exported here
- [`@owlmeans/server-entrypoint`](../server-entrypoint) — `elevate` re-exported here

<!-- owlmeans:agent-guidance:start -->
## Agent guidance

This package ships embedded agent skills under `agent-meta/`. After installing your
`@owlmeans/*` packages, run the OwlMeans agent-skills installer to place them into
your project's skill store (`.agents/skills/`):

```sh
npx @owlmeans/agent-skills@^0.1.18-rc.12
```

The embedded files are version-matched to this package release. Do not edit them
directly — they are regenerated on each publish. To contribute guidance edits,
open a PR against the source monorepo.
<!-- owlmeans:agent-guidance:end -->
