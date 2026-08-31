# @owlmeans/socket

Shared WebSocket connection types and message protocol for OwlMeans real-time communication.

## Overview

- Defines the `Connection` interface used by both server and client socket implementations
- `MessageType` enum covers all message categories: Call, Result, Event, Request, Response, Auth, System
- `EventMessage<T>` is the typed event payload received by `connection.observe()`
- Used in viable for real-time thinking journal updates and file watching

## Installation

```bash
bun add @owlmeans/socket
```

## Usage

Send a typed event and observe responses:

```typescript
import type { EventMessage, Connection } from '@owlmeans/socket'
import { MessageType } from '@owlmeans/socket'

// Observe events on a connection
const unsubscribe = connection.observe<FileUpdate>('file-update', async (event: EventMessage<FileUpdate>) => {
  console.log('file updated:', event.payload)
})

// Notify connected clients
await connection.notify('file-update', { path: '/src/app.ts', content: '...' })
```

RPC call over WebSocket:

```typescript
const result = await connection.call<ProjectSlot>('project.slot', projectId)
```

Checking the message type in a raw message handler:

```typescript
import { MessageType } from '@owlmeans/socket'

if (message.type === MessageType.Event) {
  // handle event
}
```

## API

### `Connection`

The main interface for WebSocket connections. Key methods:

- `notify<T>(event, payload)` — emit an event to the other side
- `observe<T>(event, handler)` — subscribe to events; returns unsubscribe function
- `call<R, T[]>(method, ...payload)` — make an RPC call and await the result
- `perform<R, T[]>(method, handler)` — register an RPC handler
- `request<T, R>(payload, observer?)` — send a streaming request
- `auth<T, R>(stage, payload)` — perform a WebSocket auth handshake step
- `stage: AuthenticationStage` — current auth state of the connection

### `MessageType`

```typescript
enum MessageType {
  Call, Result, Error, Request, Response, Event, Message, Auth, System
}
```

### `EventMessage<T>`

The payload structure for `observe()` handlers: `{ type, payload: T, ... }`.

### `CALL_TIMEOUT`

Default RPC call timeout in milliseconds (60 000).

## Related Packages

- [`@owlmeans/server-socket`](../server-socket) — server-side connection implementation
- [`@owlmeans/client-socket`](../client-socket) — client-side connection implementation

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
