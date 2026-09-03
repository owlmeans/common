---
name: server-app
description: How to use @owlmeans/server-app — main() entry point, the bind-first boot (holdApiPort + boot state), handleRequest()/handleBody() handler wrappers, elevate()/celevate() to attach handlers to entrypoint declarations, sservice() to register backend services. Auto-invoked when working with the server entry point or request handlers.
user-invocable: false
---
<!-- AUTO-GENERATED — do not edit. Regenerate via sync-agent-meta. -->

# @owlmeans/server-app

**Layer:** Server
**Install:** `"@owlmeans/server-app": "^0.1.18-rc.18"` in `dependencies`

## Key Exports

| Export | Description |
|--------|-------------|
| `main<R, C, T>(ctx, entrypoints)` | Entry point — registers all entrypoints, configures/inits the context, then boots the Fastify API server (`@owlmeans/server-api`) |
| `makeContext(cfg, customize?)` | Build the server context with API server, API client, sockets, static resource and auth appended |
| `handleRequest(fn)` | Wrap an async function as a server handler `(req, context) => result` |
| `handleBody<T>(fn)` | Wrap an async function with validated body — `(payload, context, req) => result` |
| `handleParams<T>(fn)` | The same, over validated URL params |
| `elevate(entrypoints, alias, handler?, opts?)` | Attach a handler to an entrypoint declaration |
| `celevate(entrypoints, alias, handler?, opts?)` | Make a declaration client-callable from the server side |
| `entrypoint(...)`, `guard(...)`, `route(...)`, `broute(...)` | Re-exported declaration builders |
| `filter`, `body`, `params`, `EntrypointOutcome` | Re-exported validators and the outcome enum |
| `sservice(options, cfg)` | Register a server-side service entry in the config |
| `holdApiPort(cfg, opts?)` | Own the app's port during boot |
| `setBootPhase(phase, detail?)` | Record the process boot phase — `'initializing' \| 'ready' \| 'failed'` |
| `getBootPhase()` / `getBootDetail()` | Read it back |
| `bootHealthPayload()` | The health body: `{ status, phase, ok, reason?, bootId, pid }` |
| `bootHold(okPath?)` | `holdApiPort` options wired to the boot state |
| `BootPhase`, `BootHealth`, `BOOT_ID_ENV` | Boot-state types and the supervisor's boot-id env var |
| `entrypoints` | Built-in system entrypoints — spread into `appEntrypoints` |
| `Request`, `Response`, `Module`, `ClientEntrypoint`, `Criteria`, `ListResult`, `Sort` | Re-exported common types |

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
import { AuthUnknown } from '@owlmeans/auth'
import type { ClientEntrypoint } from '@owlmeans/server-app'

export const list = handleRequest(async (req, context) => {
  if (req.auth?.entityId == null) throw new AuthUnknown('entity')
  const ctx = context as Context
  const { items } = await ctx.project().list({ entityId: req.auth.entityId })
  return items
})

export const create = handleBody<CreateProject>(async (payload, context, req) => {
  const ctx = context as Context
  return await ctx.entrypoint<ClientEntrypoint<Project>>(agent.project.create).call({
    body: { prompt: payload.prompt, entity: req.auth?.entityId }
  })
})
```

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

A backend alias that carries only a `guard()`/`gate()` for its children still needs a **bare**
`elevate(entrypoints, alias)` — that is what makes the declaration a live server route group.
Elevating is idempotent, so a later `elevate` of the same alias is legal and simply replaces the
element again; the guards it brings are added to the declared ones rather than replacing them.

## Depends On

- `@owlmeans/server-context`, `@owlmeans/server-entrypoint`, `@owlmeans/server-route`, `@owlmeans/server-api`
- `@owlmeans/entrypoint`, `@owlmeans/route`, `@owlmeans/auth`, `@owlmeans/error`
- `fastify` (server runtime — the HTTP server is created by `@owlmeans/server-api`; there is no Express here)
