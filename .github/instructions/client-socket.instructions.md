---
description: "How to use @owlmeans/client-socket — client-side WebSocket connection helpers for browsers and native clients."
applyTo: "**/*.ts, **/*.tsx"
---

# @owlmeans/client-socket

**Layer:** Client
**Install:** `"@owlmeans/client-socket": "^0.1.2"` in `dependencies`

## Key Exports

| Export | Description |
|--------|-------------|
| `Socket` types | Client socket connection shape |
| Helpers | Connect, send, subscribe |

## Usage

```typescript
import { connectSocket } from '@owlmeans/client-socket'
const socket = await connectSocket(context, { url: 'wss://api/ws' })
```

## Depends On

- `@owlmeans/socket`, `@owlmeans/client-context`
