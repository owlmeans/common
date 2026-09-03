---
name: storage-resource
description: How to use @owlmeans/storage-resource — the upload-only S3-compatible object storage resource, with mime sniffing on the way in. Auto-invoked when uploading files to a bucket or wiring cfg.storageBuckets.
user-invocable: false
---
<!-- AUTO-GENERATED — do not edit. Regenerate via sync-agent-meta. -->

# @owlmeans/storage-resource

**Layer:** Infra
**Install:** `"@owlmeans/storage-resource": "^0.1.18-rc.12"` in `dependencies`

## Key Exports

| Export | Description |
|--------|-------------|
| `appendStorageResource(context, alias?, configKey?)` | Register the upload resource on a server context |
| `createStorageResource(alias?, configKey?)` | The bare resource, when you register it yourself |
| `StorageResource` | `Pick<Resource<StoredRecord>, 'create'>` — **an upload and nothing else** |
| `StoredRecord`, `StorageConfig`, `StoredConfigAppend` | The uploaded object, one bucket's config, and the `cfg.storageBuckets` shape |
| `stripData` | Drop the inline payload from a `StoredFileWithData` before it goes on the wire |
| `supportedMimeTypes`, `DEFAULT_ALIAS` (`s3-storage`) | Constants |

## Usage

```typescript
import { appendStorageResource } from '@owlmeans/storage-resource'

appendStorageResource(context, 'uploads', WL_BUCKET)

const uploads = context.resource<StorageResource>('uploads')
const stored = await uploads.create({ stream, size, type: 'image/png', prefix: `${entityId}/${id}` })
stored.url   // the public URL the bucket answers on
```

`configKey` selects the entry in `cfg.storageBuckets` (defaulting to the alias):
`{ url, apiKey, basePrefix }`, where `apiKey` is `"<keyId>:<keySecret>"` and the object lands at
`<basePrefix>/<record.prefix>`.

## A bucket is not a record store

The type names the one method that works. There is no index behind a bucket to read, list or
delete against, so `StorageResource` exposes `create` alone rather than promising a full
`Resource<T>` whose rest would only throw. Keep the *record* — its url, size, mime type and
owner — in a mongo or postgres resource, and let this one carry the bytes; that record is what
answers criteria, sorting and paging.

`create` refuses anything it cannot vouch for: no `stream` raises `FileStreamError`, a missing
`size` `FilePropertyError`, and a body whose sniffed mime type disagrees with the declared `type`
raises `FileTypeError('mime-mismatch')` — a caller's claim about a file is checked against its
bytes, never taken. Bucket failures surface as `StorageApiError`. `opts.ttl` has nothing to act on
here: a bucket object never expires on its own.

## Depends On

- `@owlmeans/storage-common`, `@owlmeans/resource`, `@owlmeans/context`, `@owlmeans/server-context`,
  `@owlmeans/error`
- `@aws-sdk/client-s3`, `file-type` (runtime)

## Related

- [[storage-common]] — the shared file types, schemas and errors
- [[image-resource]] — the image-shaped specialization of those types
