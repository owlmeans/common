---
name: server-socket
description: How to use @owlmeans/server-socket — Fastify WebSocket integration that serves the entrypoints whose route protocol is SOCKET. Auto-invoked when importing server socket primitives or wiring WebSocket support.
user-invocable: false
---

# @owlmeans/server-socket

**Layer:** Server
**Install:** `"@owlmeans/server-socket": "^0.1.18-rc.17"` in `dependencies`

## Key Exports

| Export | Description |
|--------|-------------|
| `createSocketService(alias?)` | Factory for the WebSocket server service |
| `appendSocketService(ctx, alias?)` | Register it on the context |
| `createSocketMiddleware(web?, socket?)` | Context middleware that attaches the socket service to the API server |
| `handleConnection(fn)` | Wrap `(conn, ctx, req, res) => Promise<void>` as an entrypoint handler |
| `SocketService` | Service interface — `update(apiServer)` |
| Constants | `DEFAULT_ALIAS` (`socket-server`) |

## How a socket call is carried

An entrypoint declared with `socket(...)` carries `RouteProtocols.SOCKET`, and the protocol is what
decides the carrier. The HTTP server skips those entrypoints; this service claims them, registering
each at `entrypoint.mount()` on the same Fastify instance with `websocket: true`. So a declaration
moves between HTTP and a socket by changing its protocol, and neither the handler nor the caller is
rewritten.

The same enforcement runs first: a `preHandler` hook matches each candidate with
`entrypoint.route.match(req, entrypoint.mount())`, authorizes it against `getGuards()`, and asserts
every pair from `getGates()` — inherited guards and gates included — before the connection is handed
to the handler.

## Usage

```typescript
import { appendSocketService, createSocketMiddleware } from '@owlmeans/server-socket'

appendSocketService(context)
context.registerMiddleware(createSocketMiddleware())
```

```typescript
import { handleConnection } from '@owlmeans/server-socket'

export const stream = handleConnection(async (conn, ctx, req) => {
  conn.listen(async message => { /* ... */ })
})
```

## Depends On

- `@owlmeans/socket`, `@owlmeans/entrypoint`, `@owlmeans/server-entrypoint`, `@owlmeans/server-context`
- `@owlmeans/server-api` — the Fastify instance and its request pipeline (`/utils`)
- `@fastify/websocket` (runtime)
