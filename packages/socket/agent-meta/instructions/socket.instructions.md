---
description: "How to use @owlmeans/socket — abstract WebSocket protocol model, message types, and socket errors shared between client-socket and server-socket."
applyTo: "**/*.ts, **/*.tsx"
---
<!-- AUTO-GENERATED — do not edit. Regenerate via sync-agent-meta. -->

# @owlmeans/socket

**Layer:** Core
**Install:** `"@owlmeans/socket": "^0.1.8"` in `dependencies`

## Key Exports

| Export | Description |
|--------|-------------|
| `Message` types | Wire message shape (envelope, payload, headers) |
| `SocketEvent` types | Socket lifecycle events |
| Errors | Typed socket errors |
| Constants | Message types, channel names |
| Helpers | Encode/decode messages |

## Usage

```typescript
import type { Message } from '@owlmeans/socket'
const msg: Message = { type: 'subscribe', channel: 'projects', payload: { entityId } }
```

## Depends On

- `@owlmeans/error`, `@owlmeans/i18n`, `@owlmeans/basic-envelope`
