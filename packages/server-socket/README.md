# @owlmeans/server-socket

Server-side WebSocket connection handler and service for OwlMeans backends.

## Overview

- `connection(protocol, callback)` creates a typed WebSocket binding for one protocol
- `appendSocketService()` + `createSocketMiddleware()` wire the WebSocket service into a server context
- Used in viable for real-time thinking journal updates and file watching
- The `Connection` interface (from `@owlmeans/socket`) is the runtime object passed to your handler

## Installation

```bash
bun add @owlmeans/server-socket@^0.1.18-rc.17
```

## Usage

Handle a WebSocket connection on an entrypoint route:

```typescript
import { connection } from '@owlmeans/server-socket'
import { bind } from '@owlmeans/server-entrypoint'
import type { Connection } from '@owlmeans/socket'
import { appEntrypoints as protocols } from 'my-app-common'

const watch = connection(protocols.api.fileWatch, async (conn, context, req) => {
  const ctx = context as Context
  const projectId = req.params.id as string

  // Observe events sent by the client
  const unsubscribe = conn.observe<FileEvent>('file-change', async (event) => {
    await ctx.fileStore().save({ projectId, ...event.payload })
  })

  // Push updates to the client
  const unsubscribeStore = await ctx.fileStore().subscribe(record => {
    conn.notify('file-update', record)
  })
})

export const entrypoints = [bind(protocols.api.fileWatch, watch)]
```

## API

### `connection(protocol, handler): BoundEntrypointHandler`

Creates a protocol-bound WebSocket handler. The callback receives `(conn, ctx, req, res)` with
request and response types inferred from the protocol.

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
npx @owlmeans/agent-skills@^0.1.18-rc.19
```

The embedded files are version-matched to this package release. Do not edit them
directly — they are regenerated on each publish. To contribute guidance edits,
open a PR against the source monorepo.
<!-- owlmeans:agent-guidance:end -->
