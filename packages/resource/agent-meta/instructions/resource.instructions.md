---
description: "How to use @owlmeans/resource — generic resource abstraction (CRUD over a collection of records) used by mongo-resource, redis-resource, state, storage-resource. Use when implementing a custom resource."
applyTo: "**/*.ts, **/*.tsx"
---
<!-- AUTO-GENERATED — do not edit. Regenerate via sync-agent-meta. -->

# @owlmeans/resource

**Layer:** Core
**Install:** `"@owlmeans/resource": "^0.1.12"` in `dependencies`

## Key Exports

| Export | Description |
|--------|-------------|
| `Resource<T>` types | Generic resource interface (get/list/create/update/delete) |
| Errors | Typed resource errors (NotFound, AlreadyExists, etc.) |
| Constants | Default resource aliases |
| Service helpers | Wrap a resource as a context service |

## Usage

```typescript
import type { Resource } from '@owlmeans/resource'

interface Project { id: string; name: string; entityId: string }
const projects = ctx.getResource<Resource<Project>>('projects')
const { items } = await projects.list({ entityId: 'abc' })
```

## Depends On

- `@owlmeans/error`, `@owlmeans/i18n`
