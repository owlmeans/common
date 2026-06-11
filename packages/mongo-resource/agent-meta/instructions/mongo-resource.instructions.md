---
description: "How to use @owlmeans/mongo-resource — MongoDB-backed Resource implementation. Builds a typed CRUD resource on top of @owlmeans/mongo."
applyTo: "**/*.ts, **/*.tsx"
---
<!-- AUTO-GENERATED — do not edit. Regenerate via sync-agent-meta. -->

# @owlmeans/mongo-resource

**Layer:** Infra
**Install:** `"@owlmeans/mongo-resource": "^0.1.7"` in `dependencies`

## Key Exports

| Export | Description |
|--------|-------------|
| `makeMongoResource<T>(options)` | MongoDB-backed Resource factory |
| `MongoResource<T>` types | Resource interface |
| Constants | Default collection prefix |
| Helpers | Index creation, query helpers |

## Usage

```typescript
import { makeMongoResource } from '@owlmeans/mongo-resource'
context.registerResource(makeMongoResource<Project>({ alias: 'projects', collection: 'projects' }))
```

## Depends On

- `@owlmeans/mongo`, `@owlmeans/resource`, `@owlmeans/server-context`
