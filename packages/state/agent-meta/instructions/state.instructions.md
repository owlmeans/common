---
description: "How to use @owlmeans/state — appendStateResource() to register a state resource on a context, then ctx.getStateResource(alias) to read/write typed application state."
applyTo: "**/*.ts, **/*.tsx"
---
<!-- AUTO-GENERATED — do not edit. Regenerate via sync-agent-meta. -->

# @owlmeans/state

**Layer:** Core
**Install:** `"@owlmeans/state": "^0.1.15"` in `dependencies`

## Key Exports

| Export | Description |
|--------|-------------|
| `appendStateResource<C, T>(context, alias)` | Register a state resource on the context |
| `StateResource<T>` types | Typed state container interface |
| Errors | Typed state errors |
| Constants | Default state aliases |

## Usage

```typescript
import { appendStateResource } from '@owlmeans/state'

export const VIB_PROJECT_STATE = 'vib-project-state'
appendStateResource<C, T>(context, VIB_PROJECT_STATE)
context.projectStore = () => context.getStateResource(VIB_PROJECT_STATE)
```

## Depends On

- `@owlmeans/resource`, `@owlmeans/context`, `@owlmeans/error`, `@owlmeans/i18n`
