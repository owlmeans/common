---
name: state
description: How to use @owlmeans/state — appendStateResource() to register a state resource on a context, then ctx.getStateResource(alias) to read/write typed application state. Auto-invoked when importing state primitives.
user-invocable: false
---

# @owlmeans/state

**Layer:** Core
**Install:** `"@owlmeans/state": "^0.1.18-rc.6"` in `dependencies`

## Key Exports

| Export | Description |
|--------|-------------|
| `appendStateResource<C, T>(context, alias)` | Register a state resource on the context |
| `StateResource<T>` types | Typed state container interface |
| Errors | Typed state errors |
| Constants | Default state aliases |

## Usage

Append a state resource at context construction time, expose a typed accessor:

```typescript
import { appendStateResource } from '@owlmeans/state'

export const VIB_PROJECT_STATE = 'vib-project-state'

export const makeContext = <C extends Config, T extends Context<C>>(cfg: C): T => {
  const context = makeBasicContext<C, T>(cfg)
  appendStateResource<C, T>(context, VIB_PROJECT_STATE)
  context.projectStore = () => context.getStateResource(VIB_PROJECT_STATE)
  return context
}

// Later, in a component or handler:
const store = ctx.projectStore()
const current = await store.get('current')
```

## Depends On

- `@owlmeans/resource` — `StateResource` extends `Resource`
- `@owlmeans/context` — for `getStateResource`
- `@owlmeans/error`, `@owlmeans/i18n`
