---
name: client-socket
description: How to use @owlmeans/client-socket — client-side WebSocket connection helpers for browsers and native clients. Auto-invoked when importing client socket primitives.
user-invocable: false
---
<!-- AUTO-GENERATED — do not edit. Regenerate via sync-agent-meta. -->

# @owlmeans/client-socket

**Layer:** Client
**Install:** `"@owlmeans/client-socket": "^0.1.7"` in `dependencies`

## Key Exports

| Export | Description |
|--------|-------------|
| `Socket` types | Client socket connection shape |
| Helpers | Connect, send, subscribe to channels |

## Usage

```typescript
import { connectSocket } from '@owlmeans/client-socket'
const socket = await connectSocket(context, { url: 'wss://api/ws' })
socket.subscribe('projects', msg => console.log(msg))
```

## Depends On

- `@owlmeans/socket`, `@owlmeans/client-context`
