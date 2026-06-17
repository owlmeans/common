---
description: "How to use @owlmeans/storage-common — shared object/file storage types, error types, and model used by storage-resource and image-resource."
applyTo: "**/*.ts, **/*.tsx"
---

# @owlmeans/storage-common

**Layer:** Infra
**Install:** `"@owlmeans/storage-common": "^0.1.2"` in `dependencies`

## Key Exports

| Export | Description |
|--------|-------------|
| `StorageBucket` types | Bucket descriptor |
| `StorageObject` types | Stored object metadata |
| Errors | Typed storage errors |
| Constants | Default content types |
| Model | Path/key normalization helpers |

## Usage

```typescript
import type { StorageBucket } from '@owlmeans/storage-common'
```

## Depends On

- `@owlmeans/error`, `@owlmeans/i18n`
