---
name: image-resource
description: How to use @owlmeans/image-resource — the image-shaped names and AJV schemas over the shared stored-file types from @owlmeans/storage-common. Auto-invoked when typing image records or validating an image upload.
user-invocable: false
---
<!-- AUTO-GENERATED — do not edit. Regenerate via sync-agent-meta. -->

# @owlmeans/image-resource

**Layer:** Infra
**Install:** `"@owlmeans/image-resource": "^0.1.18-rc.12"` in `dependencies` (peer `ajv`)

Types and schemas only — no resource is registered here. An image *is* a stored file
([[storage-common]]); this package gives that file image-shaped names so a signature says what it
carries, and re-emits the schemas so an image endpoint validates against its own.

## Key Exports

| Export | Description |
|--------|-------------|
| `ImageMeta`, `StoredImage`, `ImageData` | The image spellings of `StoredFileMeta`, `StoredFile` and `StoredFileWithData` |
| `ImageMetaSchema`, `StoredImageSchema`, `ImageDataSchema` | The matching AJV schemas |

## Usage

Type the record that *describes* the image, and keep it in a database resource — that is what
answers criteria, sorting and paging. The bytes go to a bucket through
[[storage-resource]]'s upload-only `create`.

```typescript
import type { StoredImage } from '@owlmeans/image-resource'

const images = ctx.resource<Resource<StoredImage>>('images')
await images.list({ entityId, mimeType: { $startsWith: 'image/' } }, { sort: ['name'], size: 20 })
```

`instances` carries the renditions — original, thumbnail, converted format — each with its own
`url` and `size`. Pick the one a screen needs from that map; never rebuild a url by string surgery.

## Depends On

- `@owlmeans/storage-resource`, `@owlmeans/storage-common`
- peer `ajv`

## Related

- [[storage-common]] — the stored-file types and schemas these specialize
- [[storage-resource]] — the bucket upload · [[resource]] — the record store behind it
