---
name: resource
description: How to use @owlmeans/resource — generic resource abstraction (CRUD over a collection of records) used by mongo-resource, redis-resource, state, storage-resource, etc. Auto-invoked when importing from this package or implementing a custom resource type.
user-invocable: false
---
<!-- AUTO-GENERATED — do not edit. Regenerate via sync-agent-meta. -->

# @owlmeans/resource

**Layer:** Core
**Install:** `"@owlmeans/resource": "^0.1.14"` in `dependencies`

## Key Exports

| Export | Description |
|--------|-------------|
| `Resource<T>` types | Generic resource interface (get/list/create/update/delete) |
| Errors | Typed resource errors (NotFound, AlreadyExists, etc.) |
| Constants | Default resource aliases, operation names |
| Service helpers | Wrap a resource as a context service |

## Usage

A resource is a typed CRUD-over-records abstraction. Concrete implementations come from `@owlmeans/mongo-resource`, `@owlmeans/redis-resource`, `@owlmeans/state`, etc. Consumers register a resource with the context and access it via `ctx.getResource<T>(alias)`.

```typescript
import type { Resource } from '@owlmeans/resource'

interface Project { id: string; name: string; entityId: string }
const projects = ctx.getResource<Resource<Project>>('projects')
const { items } = await projects.list({ entityId: 'abc' })
```

## Depends On

- `@owlmeans/error` — for typed errors
- `@owlmeans/i18n` — error messages
