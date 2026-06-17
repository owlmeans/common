---
description: "How to use @owlmeans/client-resource — client-side resource caching layer over @owlmeans/resource."
applyTo: "**/*.ts, **/*.tsx"
---
<!-- AUTO-GENERATED — do not edit. Regenerate via sync-agent-meta. -->

# @owlmeans/client-resource

**Layer:** Client
**Install:** `"@owlmeans/client-resource": "^0.1.10"` in `dependencies`

## Key Exports

| Export | Description |
|--------|-------------|
| `makeClientResource<T>()` | Factory for an in-memory client resource |
| `ClientResource<T>` types | Resource interface |
| Constants | Default cache aliases |

## Usage

```typescript
import { makeClientResource } from '@owlmeans/client-resource'
context.registerResource(makeClientResource<Project>('projects'))
```

## Depends On

- `@owlmeans/resource`, `@owlmeans/client-context`
