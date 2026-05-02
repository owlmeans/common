# @owlmeans/client-socket

React hook and factory for WebSocket connections via OwlMeans module routing.

## Overview

- `ws(module, request?)` — creates a `Connection` by resolving the module URL and opening a WebSocket
- `useWs(module, request?)` — React hook wrapping `ws()` with lifecycle management
- The returned `Connection` implements `@owlmeans/socket`'s `Connection` interface

## Installation

```bash
bun add @owlmeans/client-socket
```

## Usage

Connect to a WebSocket module and observe events:

```typescript
import { useWs } from '@owlmeans/client-socket'
import { MessageType } from '@owlmeans/socket'

function ThinkingPanel({ storyId }: { storyId: string }) {
  const conn = useWs('story-thinking', { params: { id: storyId } })

  useEffect(() => {
    if (!conn) return
    const unsubscribe = conn.observe<ThinkingEvent>('thinking-update', async (event) => {
      dispatch({ type: 'update', payload: event.payload })
    })
    return unsubscribe
  }, [conn])
}
```

Direct connection (non-hook):

```typescript
import { ws } from '@owlmeans/client-socket'
import type { ClientModule } from '@owlmeans/client-module'

const wsModule = context.module<ClientModule<string>>('story-thinking')
const connection = await ws(wsModule, { params: { id: storyId } })
```

## API

### `ws(module, request?): Promise<Connection>`

Resolves the module URL, opens a WebSocket, and returns a `Connection` once the socket opens.

### `useWs(module, request?): Connection | null`

React hook version of `ws()`. Returns `null` while connecting. Manages connection lifecycle (opens on mount, closes on unmount).

## Related Packages

- [`@owlmeans/socket`](../socket) — `Connection` interface with `notify`, `observe`, `call` methods
- [`@owlmeans/server-socket`](../server-socket) — server-side connection handler
- [`@owlmeans/client-module`](../client-module) — `ClientModule` passed to `ws()`
