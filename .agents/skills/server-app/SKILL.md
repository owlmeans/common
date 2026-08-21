---
name: server-app
description: How to use @owlmeans/server-app — main() entry point, handleRequest()/handleBody() handler wrappers, elevate()/celevate() to attach handlers to module declarations, sservice() to register backend services. Auto-invoked when working with the server entry point or request handlers.
user-invocable: false
---

# @owlmeans/server-app

**Layer:** Server
**Install:** `"@owlmeans/server-app": "^0.1.18-rc.10"` in `dependencies`

## Key Exports

| Export | Description |
|--------|-------------|
| `main<E, C, T>(context, entrypoints)` | Entry point — registers all entrypoints, configures/inits the context, then boots the Fastify API server (`@owlmeans/server-api`) |
| `handleRequest(fn)` | Wrap an async function as a server handler `(req, context) => result` |
| `handleBody<T>(fn)` | Wrap an async function with validated body — `(payload, context, req) => result` |
| `elevate(modules, alias, handler)` | Attach a handler to an entrypoint declaration |
| `celevate(modules, alias, handler)` | Conditional elevate — only if entrypoint exists |
| `sservice(options, cfg)` | Register a server-side service entry in the config |
| `modules` | Built-in system entrypoints — spread into `appEntrypoints` |
| `Context`, `Config`, `ClientEntrypoint` re-exports | Common types |

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
  const [result] = await ctx.entrypoint<ClientEntrypoint<Project>>(agent.project.create).call({
    body: { prompt: payload.prompt, entity: req.auth?.entityId }
  })
  return result
})
```

### Entrypoint elevation
```typescript
// entrypoints.ts
import { elevate, modules as systemEntrypoints } from '@owlmeans/server-app'
import { managerEntrypoints } from 'my-common'
import { create, list } from './app/project/index.js'

elevate(managerEntrypoints, manager.back.project.create, create)
elevate(managerEntrypoints, manager.back.project.list, list)

export const appEntrypoints = [...systemEntrypoints, ...paymentEntrypoints, ...managerEntrypoints]
```

A backend alias that carries only a `guard()`/`gate()` for its children still needs a **bare**
`elevate(entrypoints, alias)` — that is what makes the declaration a live server route group.

## Depends On

- `@owlmeans/server-context`, `@owlmeans/server-entrypoint`, `@owlmeans/server-route`, `@owlmeans/server-api`
- `@owlmeans/entrypoint`, `@owlmeans/route`, `@owlmeans/auth`, `@owlmeans/error`
- `fastify` (server runtime — the HTTP server is created by `@owlmeans/server-api`; there is no Express here)
