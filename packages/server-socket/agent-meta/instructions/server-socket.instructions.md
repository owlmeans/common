---
description: "How to use @owlmeans/server-socket — Fastify WebSocket integration providing a socket service registered on the server context."
applyTo: "**/*.ts, **/*.tsx"
---
<!-- AUTO-GENERATED — do not edit. Regenerate via sync-agent-meta. -->

# @owlmeans/server-socket

**Layer:** Server
**Install:** `"@owlmeans/server-socket": "^0.1.9"` in `dependencies`

## Key Exports

| Export | Description |
|--------|-------------|
| `makeSocketService()` | Factory for the WebSocket server service |
| Middleware | Socket middleware for Fastify |
| Helpers | Channel subscription / broadcast |
| Constants | Default channel names |

## Usage

```typescript
import { makeSocketService } from '@owlmeans/server-socket'
context.registerService(makeSocketService())
```

## Depends On

- `@owlmeans/socket`, `@owlmeans/server-context`, `@owlmeans/server-api`, `@fastify/websocket`
