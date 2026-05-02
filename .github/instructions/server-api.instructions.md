---
description: "How to use @owlmeans/server-api — Fastify-based API server factory, request/response shapes, server middleware integration."
applyTo: "**/*.ts, **/*.tsx"
---

# @owlmeans/server-api

**Layer:** Server
**Install:** `"@owlmeans/server-api": "^0.1.2"` in `dependencies`

## Key Exports

| Export | Description |
|--------|-------------|
| `makeServer()` | Factory for the Fastify API server |
| `Server`, `ServerRequest`, `ServerResponse` types | Runtime shapes |
| Errors | Typed transport errors |
| Constants | Default ports, paths |
| Helpers | Middleware composition |

## Subpath Exports

- `./utils` — server utility functions

## Usage

```typescript
import { makeServer } from '@owlmeans/server-api'
const server = makeServer({ port: 8080 })
context.registerService(server)
```

## Depends On

- `@owlmeans/context`, `@owlmeans/module`, `@owlmeans/route`, `fastify`
