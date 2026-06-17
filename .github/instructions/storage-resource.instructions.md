---
description: "How to use @owlmeans/storage-resource — S3-compatible object storage Resource with file-type detection."
applyTo: "**/*.ts, **/*.tsx"
---

# @owlmeans/storage-resource

**Layer:** Infra
**Install:** `"@owlmeans/storage-resource": "^0.1.2"` in `dependencies`

## Key Exports

| Export | Description |
|--------|-------------|
| `makeStorageResource(options)` | S3-compatible storage Resource factory |
| `StorageResource` types | Resource interface |
| Helpers | File type detection |
| Constants | Default chunk size |

## Usage

```typescript
import { makeStorageResource } from '@owlmeans/storage-resource'
context.registerResource(makeStorageResource({ alias: 'uploads', bucket: WL_BUCKET }))
```

## Depends On

- `@owlmeans/storage-common`, `@owlmeans/resource`, `@owlmeans/server-context`, `@aws-sdk/client-s3`
