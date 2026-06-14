---
description: "How to use @owlmeans/server-context — server-side context factory (makeServerContext / makeBackendContext) used as the base in your server makeContext()."
applyTo: "**/context.ts, **/*.ts, **/*.tsx"
---
<!-- AUTO-GENERATED — do not edit. Regenerate via sync-agent-meta. -->

# @owlmeans/server-context

**Layer:** Server
**Install:** `"@owlmeans/server-context": "^0.1.9"` in `dependencies`

## Key Exports

| Export | Description |
|--------|-------------|
| `makeServerContext` / `makeBackendContext` | Server context factory |
| `Context` (server) types | Server-side Context |
| Server config types | Server-specific config |

## Subpath Exports

- `./utils`

## Usage

```typescript
import { makeBackendContext as makeBaseBackendContext } from '@owlmeans/server-context'

export const makeBackendContext = <C extends Config, T extends Context<C>>(cfg: C): T => {
  const context = makeBaseBackendContext<C, T>(cfg)
  return context
}
```

## Depends On

- `@owlmeans/context`, `@owlmeans/server-config`, `@owlmeans/server-entrypoint`, `@owlmeans/server-route`
