---
name: server-api
description: How to use @owlmeans/server-api — Fastify-based API server factory, request/response shapes, server middleware integration. Auto-invoked when importing server-api types or extending the server middleware stack.
user-invocable: false
---
<!-- AUTO-GENERATED — do not edit. Regenerate via sync-agent-meta. -->

# @owlmeans/server-api

**Layer:** Server
**Install:** `"@owlmeans/server-api": "^0.1.16-rc.0"` in `dependencies`

## Key Exports

| Export | Description |
|--------|-------------|
| `makeServer()` | Factory for the Fastify-based API server |
| `Server`, `ServerRequest`, `ServerResponse` types | Runtime shapes |
| Errors | Typed transport errors |
| Constants | Default ports, paths |
| Helpers | Middleware composition |

## Subpath Exports

- `./utils` — server utility functions

## Usage

The server is normally constructed transparently by `@owlmeans/server-app#main()`. Use `server-api` directly only when you need to register raw Fastify plugins or customize transport:

```typescript
import { makeServer } from '@owlmeans/server-api'
const server = makeServer({ port: 8080 })
context.registerService(server)
```

## Depends On

- `@owlmeans/context`, `@owlmeans/entrypoint`, `@owlmeans/route`
- `fastify` (runtime)
