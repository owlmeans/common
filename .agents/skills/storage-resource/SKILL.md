---
name: storage-resource
description: How to use @owlmeans/storage-resource — the upload-only S3-compatible object storage resource, with mime sniffing on the way in, and the bucket model (makeStorageBucketModel) every S3 consumer addresses objects by. Auto-invoked when uploading files to a bucket or wiring cfg.storageBuckets.
user-invocable: false
---

# @owlmeans/storage-resource

**Layer:** Infra
**Install:** `"@owlmeans/storage-resource": "^0.1.22-rc.0"` in `dependencies`

## Key Exports

| Export | Description |
|--------|-------------|
| `appendStorageResource(context, alias?, configKey?)` | Register the upload resource on a server context |
| `createStorageResource(alias?, configKey?)` | The bare resource, when you register it yourself |
| `StorageResource` | `Pick<Resource<StoredRecord>, 'create'>` plus `BasicResource` — **an upload and nothing else** |
| `makeStorageBucketModel(config)` / `StorageBucketModel` | How one entry addresses its bucket: `bucket`, `endpoint`, `region`, `forcePathStyle`, `basePrefix`, `acl`, `keyOf(prefix)`, `urlOf(prefix)`, `createClient()` |
| `DEFAULT_STORAGE_REGION` (`eu-central-1`), `DEFAULT_STORAGE_ACL` (`public-read`) | What an entry gets when it names neither |
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

`configKey` selects the entry in `cfg.storageBuckets`, defaulting to the alias. An entry is read by
`makeStorageBucketModel` — the one reading `create` and `@owlmeans/file-streams` share, so an object
either writes is found by the other at the same key and URL:

| Key | Value |
|---|---|
| `url` | **`<bucket>.<endpoint-host>`, no scheme and no path** — the first dot-label is the S3 `Bucket`, everything after it is the endpoint (`https://<rest>`), e.g. `media.s3.eu-central-1.amazonaws.com` uploads to bucket `media`; `https://<url>` is the public base. Optional when `endpoint` and `bucket` are set |
| `apiKey` | `"<keyId>:<keySecret>"`, split at the **first** colon (a secret may contain colons) |
| `basePrefix` | prepended to every key; the object lands at `<basePrefix>/<record.prefix>` and answers on `<public base>/<basePrefix>/<record.prefix>` |
| `endpoint`, `bucket` | An S3-compatible store addressed directly (`http://127.0.0.1:9000`, `media`); win over what `url` says |
| `region` | signing region; default `eu-central-1` |
| `forcePathStyle` | `<endpoint>/<bucket>/<key>` addressing — what MinIO and most S3-compatible stores need |
| `acl` | canned ACL of uploads; default `public-read`, `false` sends none (buckets with ACLs disabled) |
| `publicUrl` | the base objects answer on, when it is neither `https://<url>` nor derived from the endpoint |

A `url` written as a plain endpoint (`https://s3.amazonaws.com`) uploads to a bucket literally named
`https://s3` — name `endpoint` and `bucket` instead. The model's client computes checksums only when
an operation requires them (S3-compatible stores refuse the SDK's default trailers); `create`
destroys it after every upload, failed or not. An entry the model cannot address throws
`FilePropertyError` (`storage-config`, `storage-api-key`, `storage-address`).

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

## Tests

Category C: `tests/bucket.spec.ts` pins the model's reading of legacy and explicit entries offline;
`tests/create.spec.ts` uploads through a real server context against the S3 gate
(`gateHelper.s3Gate()`, path-style for any non-AWS endpoint, `acl: false`) and deletes what it wrote.

## Depends On

- `@owlmeans/storage-common`, `@owlmeans/resource`, `@owlmeans/context`, `@owlmeans/server-context`,
  `@owlmeans/error`
- `@aws-sdk/client-s3`, `file-type` (runtime)
- The manifest also carries a `react` peer that nothing here imports — this is a server-side
  package, and a consumer without React can ignore the peer warning.

## Related

- [[storage-common]] — the shared file types, schemas and errors
- [[image-resource]] — the image-shaped specialization of those types
- [[file-streams]] — streaming reads, multipart writes, probes and transfers over the same entries
