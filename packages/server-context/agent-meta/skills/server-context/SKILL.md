---
name: server-context
description: How to use @owlmeans/server-context — server-side context factory (makeServerContext / makeBackendContext) used as the base in your server makeContext(). Auto-invoked when building a server context.
user-invocable: false
---
<!-- AUTO-GENERATED — do not edit. Regenerate via sync-agent-meta. -->

# @owlmeans/server-context

**Layer:** Server
**Install:** `"@owlmeans/server-context": "^0.1.7"` in `dependencies`

## Key Exports

| Export | Description |
|--------|-------------|
| `makeServerContext` / `makeBackendContext` | Server context factory — base for your `makeContext` |
| `Context` (server) types | Server-side Context interface |
| Server config types | Server-specific config shape |

## Subpath Exports

- `./utils` — server context utilities

## Usage

A downstream `backend` package typically wraps `makeBackendContext` and re-exports its own `makeContext`:

```typescript
// viable-backend/src/context.ts
import { makeBackendContext as makeBaseBackendContext } from '@owlmeans/server-context'

export const makeBackendContext = <C extends Config, T extends Context<C>>(cfg: C): T => {
  const context = makeBaseBackendContext<C, T>(cfg)
  // ... register shared services
  return context
}
```

## Depends On

- `@owlmeans/context`, `@owlmeans/server-config`, `@owlmeans/server-entrypoint`, `@owlmeans/server-route`
