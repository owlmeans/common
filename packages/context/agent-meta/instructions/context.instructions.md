---
description: "How to use @owlmeans/context — base context (DI container) factory, registerService, service<T>() lookups, entrypoint<ClientEntrypoint<T>>() resolution. Use when building a makeContext factory."
applyTo: "**/context.ts, **/context.tsx, **/*.ts, **/*.tsx"
---
<!-- AUTO-GENERATED — do not edit. Regenerate via sync-agent-meta. -->

# @owlmeans/context

**Layer:** Core
**Install:** `"@owlmeans/context": "^0.1.15"` in `dependencies`

## Key Exports

| Export | Description |
|--------|-------------|
| `Context<C>` types | Generic context interface |
| `makeBasicContext` | Low-level factory |
| `registerService`, `service<T>`, `entrypoint<ClientEntrypoint<T>>` | Methods on every Context |
| `Service` types | Service interface and lifecycle |
| Constants | Built-in service/entrypoint aliases |

## Usage

```typescript
import { makeBackendContext } from '@owlmeans/server-context'

export const makeContext = <C extends Config, T extends Context<C>>(cfg: C): T => {
  const context = makeBackendContext<C, T>(cfg)
  context.registerService(makeMyService())
  context.makeContext = makeContext as typeof context.makeContext
  return context
}

// Cross-service call
const [response] = await ctx.entrypoint<ClientEntrypoint<ResponseType>>(alias).call({ body: { ... } })
```

## Depends On

- `@owlmeans/config` — context is parameterized by a Config
- `@owlmeans/entrypoint` — `ClientEntrypoint<T>` for cross-service calls
