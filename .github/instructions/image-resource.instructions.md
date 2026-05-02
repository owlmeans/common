---
description: "How to use @owlmeans/image-resource — image-handling Resource extending @owlmeans/storage-resource with image-specific metadata."
applyTo: "**/*.ts, **/*.tsx"
---

# @owlmeans/image-resource

**Layer:** Infra
**Install:** `"@owlmeans/image-resource": "^0.1.2"` in `dependencies`

## Key Exports

| Export | Description |
|--------|-------------|
| `Image` types | Image metadata shape |
| `ImageModel` | Image-specific helpers |

## Usage

```typescript
import type { Image } from '@owlmeans/image-resource'
const images = ctx.getResource<StorageResource<Image>>('uploads')
```

## Depends On

- `@owlmeans/storage-resource`, `@owlmeans/storage-common`
