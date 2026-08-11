---
name: image-resource
description: How to use @owlmeans/image-resource — image-handling Resource extending @owlmeans/storage-resource with image-specific metadata (dimensions, MIME). Auto-invoked when handling image uploads.
user-invocable: false
---
<!-- AUTO-GENERATED — do not edit. Regenerate via sync-agent-meta. -->

# @owlmeans/image-resource

**Layer:** Infra
**Install:** `"@owlmeans/image-resource": "^0.1.16-rc.0"` in `dependencies`

## Key Exports

| Export | Description |
|--------|-------------|
| `Image` types | Image metadata shape (dimensions, MIME, dominant color) |
| `ImageModel` | Image-specific helpers (resize hints, derived sizes) |

## Usage

Use in conjunction with `makeStorageResource` to type uploads as images:

```typescript
import type { Image } from '@owlmeans/image-resource'
const images = ctx.getResource<StorageResource<Image>>('uploads')
```

## Depends On

- `@owlmeans/storage-resource`, `@owlmeans/storage-common`
