---
name: socket
description: How to use @owlmeans/socket — abstract WebSocket protocol model, message types, and socket errors shared between client-socket and server-socket. Auto-invoked when importing socket types or message constants.
user-invocable: false
---
<!-- AUTO-GENERATED — do not edit. Regenerate via sync-agent-meta. -->

# @owlmeans/socket

**Layer:** Core
**Install:** `"@owlmeans/socket": "^0.1.11"` in `dependencies`

## Key Exports

| Export | Description |
|--------|-------------|
| `Message` types | Wire message shape (envelope, payload, headers) |
| `SocketEvent` types | Socket lifecycle events |
| Errors | Typed socket errors (Disconnected, AuthFailed, etc.) |
| Constants | Message types, channel names |
| Helpers | Encode/decode messages |

## Usage

```typescript
import type { Message } from '@owlmeans/socket'

const msg: Message = { type: 'subscribe', channel: 'projects', payload: { entityId } }
```

Concrete implementations live in `@owlmeans/client-socket` (browser/native) and `@owlmeans/server-socket` (Fastify integration).

## Depends On

- `@owlmeans/error`, `@owlmeans/i18n`
- `@owlmeans/basic-envelope` — message envelopes
