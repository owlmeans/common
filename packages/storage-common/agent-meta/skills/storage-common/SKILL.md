---
name: storage-common
description: How to use @owlmeans/storage-common — shared object/file storage types, error types, and model used by storage-resource and image-resource. Auto-invoked when importing storage primitives.
user-invocable: false
---
<!-- AUTO-GENERATED — do not edit. Regenerate via sync-agent-meta. -->

# @owlmeans/storage-common

**Layer:** Infra
**Install:** `"@owlmeans/storage-common": "^0.1.18-rc.9"` in `dependencies`

## Key Exports

| Export | Description |
|--------|-------------|
| `StoredFileMeta` | What a stored file is *about*: `alias`, `mimeType`, `scopes`, `status`, plus optional `entityId`, `sourceName`, `name`, `title` |
| `StoredFileInstance` | One rendition — `{ size, alias, url }`. A file carries a map of them under `instances` |
| `StoredFile`, `StoredFileWithData` | The metadata plus its instances; the `WithData` form adds the inline payload (`format`, `bytes`, `base64`) |
| `StoredFileMetaSchema`, `StoredFileInstanceSchema`, `StoredFilePayloadSchema`, `StoredFileSchema`, `StoredFileWithDataSchema` | The matching AJV schemas |
| `StoredFileStatus`, `StoredFileFormat` | `uploaded` / `processing-ready` / `processed` / `cached` / `unknown`; `bytes` / `base64` |
| Errors | `StoredFileError`, `OrphanFileError`, `FilePropertyError`, `FileStreamError`, `StorageApiError`, `FileTypeError` |

## Usage

The shared vocabulary, not a resource: nothing here talks to a bucket or a database. A file record
is stored in whatever resource an app registers for it, so criteria, sorting and paging are that
resource's ([[resource]]) — this package only says what the record *is*.

```typescript
import { StoredFileStatus, StoredFileSchema } from '@owlmeans/storage-common'
import type { StoredFile } from '@owlmeans/storage-common'

const files = ctx.resource<Resource<StoredFile>>('files')
await files.list({ entityId, status: StoredFileStatus.Processed }, { sort: ['name'] })
```

A record is one logical file with **several instances** keyed by alias — the original, a thumbnail,
a converted format — each with its own url and size. A screen picks the instance it wants; nothing
re-derives a url by string surgery.

`StoredFileWithData` is the shape that carries bytes, and it is the wire shape only while a payload
is genuinely in flight. Strip it with `stripData` from [[storage-resource]] before a file record
goes into a response that only needs urls.

## Depends On

- `@owlmeans/error`, `@owlmeans/auth` (the shared `entityId` / id / scope value schemas)
- peer `ajv`
