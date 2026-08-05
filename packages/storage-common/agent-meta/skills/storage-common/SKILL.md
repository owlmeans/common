---
name: storage-common
description: How to use @owlmeans/storage-common — shared object/file storage types, error types, and model used by storage-resource and image-resource. Auto-invoked when importing storage primitives.
user-invocable: false
---
<!-- AUTO-GENERATED — do not edit. Regenerate via sync-agent-meta. -->

# @owlmeans/storage-common

**Layer:** Infra
**Install:** `"@owlmeans/storage-common": "^0.1.14"` in `dependencies`

## Key Exports

| Export | Description |
|--------|-------------|
| `StorageBucket` types | Bucket descriptor (URL, credentials, prefix) |
| `StorageObject` types | Stored object metadata |
| Errors | Typed storage errors (NotFound, Forbidden, etc.) |
| Constants | Default content types, MIME categories |
| Model | Path/key normalization helpers |

## Usage

```typescript
import type { StorageBucket } from '@owlmeans/storage-common'

const bucket: StorageBucket = {
  url: '/etc/app-config/s3-bucket-url',
  apiKey: '/etc/master-secret/s3-storage',
  basePrefix: 'uploads/',
}
```

## Depends On

- `@owlmeans/error`, `@owlmeans/i18n`
