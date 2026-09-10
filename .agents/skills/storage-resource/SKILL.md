---
name: storage-resource
description: How to use @owlmeans/storage-resource — the upload-only S3-compatible object storage resource, with mime sniffing on the way in. Auto-invoked when uploading files to a bucket or wiring cfg.storageBuckets.
user-invocable: false
---

# @owlmeans/storage-resource

**Layer:** Infra
**Install:** `"@owlmeans/storage-resource": "^0.1.18-rc.11"` in `dependencies`

## Key Exports

| Export | Description |
|--------|-------------|
| `appendStorageResource(context, alias?, configKey?)` | Register the upload resource on a server context |
| `createStorageResource(alias?, configKey?)` | The bare resource, when you register it yourself |
| `StorageResource` | `Pick<Resource<StoredRecord>, 'create'>` plus `BasicResource` — **an upload and nothing else** |
| `StoredRecord`, `StorageConfig`, `StoredConfigAppend` | The uploaded object, one bucket's config, and the `cfg.storageBuckets` shape |
| `stripData` | Drop the inline payload from a `StoredFileWithData` before it goes on the wire |
| `supportedMimeTypes`, `DEFAULT_ALIAS` (`s3-storage`) | Constants |

## Usage

```typescript
import { appendStorageResource } from '@owlmeans/storage-resource'

appendStorageResource(context, 'uploads', 'media-bucket')

const uploads = context.resource<StorageResource>('uploads')
const stored = await uploads.create({ stream, size, type: 'image/png', prefix: `${entityId}/${id}` })
stored.url   // the public URL the bucket answers on
```

`configKey` selects the entry in `cfg.storageBuckets`, defaulting to the alias. The entry is
`{ url, apiKey, basePrefix }`:

| Key | Value |
|---|---|
| `url` | **`<bucket>.<endpoint-host>`, no scheme and no path** — the first dot-label is the S3 `Bucket`, everything after it is the endpoint (`https://<rest>`), e.g. `media.s3.eu-central-1.amazonaws.com` uploads to bucket `media` |
| `apiKey` | `"<keyId>:<keySecret>"` — one string, split on **every** colon with only the first two parts read, so a secret containing a colon is silently truncated at the next one |
| `basePrefix` | prepended to every key; the object lands at `<basePrefix>/<record.prefix>` and answers on `https://<url>/<basePrefix>/<record.prefix>` |

A `url` written as a plain endpoint (`https://s3.amazonaws.com`) uploads to a bucket literally named
`https://s3` and fails against the endpoint `amazonaws.com` — bucket-prefixed virtual-host style is
the only shape this reads. The region is fixed at `eu-central-1`, so a bucket elsewhere must be
addressed by an endpoint host that already carries its region.

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
- The manifest also carries a `react` peer that nothing here imports — this is a server-side
  package, and a consumer without React can ignore the peer warning.

## Related

- [[storage-common]] — the shared file types, schemas and errors
- [[image-resource]] — the image-shaped specialization of those types
