# @owlmeans/server-socket

Server-side WebSocket connection handler and service for OwlMeans backends.

## Overview

- `handleConnection()` wraps WebSocket business logic — analogous to `handleBody` but for WS connections
- `appendSocketService()` + `createSocketMiddleware()` wire the WebSocket service into a server context
- Used in viable for real-time thinking journal updates and file watching
- The `Connection` interface (from `@owlmeans/socket`) is the runtime object passed to your handler

## Installation

```bash
bun add @owlmeans/server-socket
```

## Usage

Handle a WebSocket connection on a module route:

```typescript
import { handleConnection } from '@owlmeans/server-socket'
import type { Connection } from '@owlmeans/socket'

export const watch = handleConnection<Connection>(async (conn, context, req) => {
  const ctx = context as Context
  const projectId = req.params.id as string

  // Observe events sent by the client
  const unsubscribe = conn.observe<FileEvent>('file-change', async (event) => {
    await ctx.fileStore().save({ projectId, ...event.payload })
  })

  // Push updates to the client
  const listener = ctx.fileStore().listen(record => {
    conn.notify('file-update', record)
  })
})
```

## API

### `handleConnection<T>(handler): RefedModuleHandler`

Wraps a WebSocket handler. The handler receives `(conn: T, ctx, req, res)`.

```typescript
handler: (conn: T, ctx: Context, req: AbstractRequest, res: AbstractResponse) => Promise<void>
```

The `conn` object is a server-side `Connection` (from `@owlmeans/socket`).

### `appendSocketService<C, T>(context): void`

Registers the WebSocket service into the context. Called automatically by `makeContext()`.

### `createSocketMiddleware(): Middleware`

Creates the middleware that initializes the socket service during context init.

## Related Packages

- [`@owlmeans/socket`](../socket) — `Connection`, `MessageType`, `EventMessage` types
- [`@owlmeans/server-app`](../server-app) — calls `appendSocketService` in `makeContext`
- [`@owlmeans/client-socket`](../client-socket) — client-side counterpart

<!-- owlmeans:agent-guidance:start -->
## Agent guidance

This package ships embedded agent skills under `agent-meta/`. After installing your
`@owlmeans/*` packages, run the OwlMeans agent-skills installer to place them into
your project's skill store (`.agents/skills/`):

```sh
npx @owlmeans/agent-skills
```

The embedded files are version-matched to this package release. Do not edit them
directly — they are regenerated on each publish. To contribute guidance edits,
open a PR against the source monorepo.
<!-- owlmeans:agent-guidance:end -->
