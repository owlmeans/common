---
name: server-context
description: How to use @owlmeans/server-context — server-side context factory (makeServerContext) used as the base in your server makeContext(). Auto-invoked when building a server context.
user-invocable: false
---

# @owlmeans/server-context

**Layer:** Server
**Install:** `"@owlmeans/server-context": "^0.1.18-rc.11"` in `dependencies`

## Key Exports

| Export | Description |
|--------|-------------|
| `makeServerContext` | Server context factory — the base your `makeContext` builds on |
| `ServerContext<C>` | Server-side Context interface |
| `ServerConfig`, `config()` | Server-specific config shape and its factory |

## Subpath Exports

- `./utils` — server context utilities (`fileConfigReader`, the config-reading middleware)

## Usage

A downstream `backend` package wraps `makeServerContext` and exports its own `makeContext`. It calls
the factory below it, applies its own idempotent `append*(context)` mixins and service
registrations, and returns that same context — the process gets one context, built once:

```typescript
// viable-backend/src/context.ts
import { makeServerContext } from '@owlmeans/server-context'
import type { ServerConfig, ServerContext } from '@owlmeans/server-context'

export const makeBackendContext = <C extends ServerConfig, T extends ServerContext<C>>(cfg: C): T => {
  const context = makeServerContext<C, T>(cfg)
  // ... register shared services
  return context
}
```

## Depends On

- `@owlmeans/context`, `@owlmeans/server-config`, `@owlmeans/server-entrypoint`, `@owlmeans/server-route`
