---
name: context
description: How to use @owlmeans/context — base context (DI container) factory, registerService(), service<T>() lookups, entrypoint<ClientEntrypoint<T>>() resolution. Auto-invoked when importing context primitives or building a makeContext factory.
user-invocable: false
---
<!-- AUTO-GENERATED — do not edit. Regenerate via sync-agent-meta. -->

# @owlmeans/context

**Layer:** Core
**Install:** `"@owlmeans/context": "^0.1.15"` in `dependencies`

## Key Exports

| Export | Description |
|--------|-------------|
| `Context<C>` types | Generic context interface (typed by Config) |
| `makeBasicContext` | Low-level factory — usually you extend a layer-specific factory instead |
| `registerService` (method) | Add a service to the DI container |
| `service<T>(alias)` (method) | Resolve a service by alias |
| `entrypoint<ClientEntrypoint<T>>(alias)` (method) | Resolve an entrypoint to call cross-service |
| `Service` types | Service interface and lifecycle |
| Constants | Built-in service/entrypoint aliases |

## Usage

Always extend a layer-specific factory (`@owlmeans/server-context`, `@owlmeans/web-panel`, etc.) rather than calling the basic factory directly. Always reassign `context.makeContext` so child contexts inherit the typed factory:

```typescript
import { makeBackendContext } from '@owlmeans/server-context'

export const makeContext = <C extends Config, T extends Context<C>>(cfg: C): T => {
  const context = makeBackendContext<C, T>(cfg)
  context.registerService(makeMyService())
  context.makeContext = makeContext as typeof context.makeContext
  return context
}
```

Resolve services and call cross-service entrypoints from a handler:

```typescript
const someService = ctx.service<MyService>(MY_SERVICE_ALIAS)

const [response] = await ctx.entrypoint<ClientEntrypoint<ResponseType>>(
  externalService.action.alias
).call({ body: { ... } })
```

## Depends On

- `@owlmeans/config` — context is parameterized by a Config
- `@owlmeans/entrypoint` — `ClientEntrypoint<T>` type for cross-service calls
