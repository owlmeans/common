---
name: storage-resource
description: How to use @owlmeans/storage-resource — S3-compatible object storage Resource with file-type detection. Auto-invoked when defining a resource backed by S3/MinIO.
user-invocable: false
---
<!-- AUTO-GENERATED — do not edit. Regenerate via sync-agent-meta. -->

# @owlmeans/storage-resource

**Layer:** Infra
**Install:** `"@owlmeans/storage-resource": "^0.1.8"` in `dependencies`

## Key Exports

| Export | Description |
|--------|-------------|
| `makeStorageResource(options)` | Factory for an S3-compatible storage Resource |
| `StorageResource` types | Resource interface (put/get/delete/list) |
| Helpers | File type detection, content-type sniffing |
| Constants | Default chunk size, max body size |

## Usage

```typescript
import { makeStorageResource } from '@owlmeans/storage-resource'

context.registerResource(makeStorageResource({
  alias: 'uploads',
  bucket: WL_BUCKET,
}))

// Bucket config from cfg.storageBuckets[WL_BUCKET]
```

## Depends On

- `@owlmeans/storage-common`, `@owlmeans/resource`, `@owlmeans/server-context`
- `@aws-sdk/client-s3` or compatible (runtime)
