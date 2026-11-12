# @owlmeans/storage-resource

S3-compatible object storage resource for OwlMeans server applications.

## Overview

- `createStorageResource(alias?, configKey?)` — creates an S3-backed upload resource
- `appendStorageResource(ctx, alias?, configKey?)` — registers the resource in the context; an entry
  with `ensure: true` gets its bucket created while the context initializes (never failing start-up)
- `StorageResource` — an upload and nothing else: `Pick<Resource<StoredRecord>, 'create'>` plus
  `BasicResource`. The bucket takes a stream and hands back a URL; there is no record store behind
  it to read, list or delete against
- `create` verifies the upload's head through `@owlmeans/file-inspector` (executables refused, a
  claim the bytes contradict refused, text types accepted) and streams the body to S3 without
  buffering it, refusing a body shorter or longer than its declared `size`
- `makeStorageBucketModel(config)` — how one bucket entry addresses its objects (bucket, endpoint,
  region, keys, public URLs, a client, `exists()`, `ensure()`); `@owlmeans/file-streams` reads and
  writes through it, so an object either package writes is found by the other
- `StoredConfigAppend` — config mixin type for `cfg.storageBuckets`

## Installation

```bash
bun add @owlmeans/storage-resource@^0.1.22-rc.0
```

## Usage

Add storage config type:

```typescript
import type { StoredConfigAppend } from '@owlmeans/storage-resource'

interface AppConfig extends BasicConfig, StoredConfigAppend {}
```

Register the resource:

```typescript
import { appendStorageResource } from '@owlmeans/storage-resource'

appendStorageResource(context, 'images')
```

Config (`config.json`) — a legacy AWS entry:

```json
{
  "storageBuckets": {
    "images": {
      "url": "media.s3.eu-central-1.amazonaws.com",
      "apiKey": "<keyId>:<secret>",
      "basePrefix": "images"
    }
  }
}
```

`url` is `<bucket>.<endpoint-host>` — no scheme. Any S3-compatible store (RustFS, MinIO) is addressed
with the optional fields instead; the bucket is created when missing, keys start at the bucket root
without `basePrefix`, and credentials may be two leaves (each a literal or a mounted file path):

```json
{ "endpoint": "http://rfs-s3.default.svc.cluster.local:9000", "bucket": "projects", "forcePathStyle": true,
  "region": "us-east-1", "acl": false, "ensure": true, "adminPath": "rustfs/admin/v3",
  "accessKeyId": "/etc/master-secret/s3-key-id", "secretAccessKey": "/etc/master-secret/s3-secret",
  "timeouts": { "connectMs": 5000, "requestMs": 120000 }, "maxAttempts": 3 }
```

A config leaf starting with `/` is read as a file path, so write `adminPath` without its leading slash.

Upload a file:

```typescript
const storage = context.resource<StorageResource>('images')
const stored = await storage.create({
  prefix: `uploads/${fileId}.jpg`,
  stream: readableStream,
  size: byteLength,
  type: 'image/jpeg',
  name: 'photo.jpg'
})
// stored.url — where the object now lives
```

## API

### `createStorageResource(alias?, configKey?): StorageResource`

Creates an S3 storage resource. `alias` defaults to `DEFAULT_ALIAS` (`'s3-storage'`); `configKey`
selects the `cfg.storageBuckets` entry (default the alias). The only data method is
`create(record)`, which verifies and uploads the stream and answers the record with its `url`.
Refusals: `FileTypeError` subclasses from `@owlmeans/file-inspector` (`FileKindError` for an
executable, `FileMimicryError` `mime-mismatch` or `dangerous:…`); `StorageApiError` (`body-short`,
`body-long`, store failures).

### `appendStorageResource<C, T>(ctx, alias?, configKey?): T`

Registers the storage resource in the context.

### `StoredRecord`

Extends `ResourceRecord` with: `url?`, `size?`, `prefix`, `stream?`, `format?`, `type?`, `name?`,
`bytes?`, `base64?`

### `StorageConfig`

`{ url?, apiKey?, accessKeyId?, secretAccessKey?, basePrefix?, endpoint?, bucket?, region?,
forcePathStyle?, acl?, publicUrl?, ensure?, locationConstraint?, adminPath?, timeouts?, maxAttempts? }`
— `url` is required unless `endpoint` and `bucket` are set; credentials are `apiKey` or the key pair;
`region` defaults to `eu-central-1`, `acl` to `public-read` (`false` sends none), `locationConstraint`
to the region (never sent for `us-east-1`).

### `makeStorageBucketModel(config): StorageBucketModel`

`bucket`, `endpoint`, `region`, `forcePathStyle`, `basePrefix`, `acl`, `locationConstraint`,
`adminUrl`, `keyOf(prefix)` (`<basePrefix>/<prefix>`, or `<prefix>` without a base),
`urlOf(prefix)`, `createClient({ maxAttempts? })` (a new `S3Client` with the entry's timeouts and
attempts, which the caller destroys), `exists()` and `ensure()` (`'exists' | 'created'`). Throws
`FilePropertyError` for an entry it cannot address; `exists`/`ensure` throw `StorageApiError` with
the S3 code.

### `stripData<Input, Output>(file): Output`

Strips raw data fields from a `StoredFileWithData` to produce a `StoredFile` (URL-only).

### `supportedMimeTypes`, `STORAGE_HEAD_BYTES`

MIME types `file-type` recognizes by signature; the 64 KiB head an upload is verified by.

## Related Packages

- [`@owlmeans/file-inspector`](../file-inspector) — the verdicts `create` applies
- [`@owlmeans/storage-common`](../storage-common) — shared types (`StoredFileMeta`, `StoredFile`, etc.)
- [`@owlmeans/image-resource`](../image-resource) — image-specific resource built on top of this
- [`@owlmeans/file-streams`](../file-streams) — streaming reads, multipart writes and transfers over the same bucket entries

<!-- owlmeans:agent-guidance:start -->
## Agent guidance

This package ships embedded agent skills under `agent-meta/`. After installing your
`@owlmeans/*` packages, run the OwlMeans agent-skills installer to place them into
your project's skill store (`.agents/skills/`):

```sh
npx @owlmeans/agent-skills@^0.1.22-rc.0
```

The embedded files are version-matched to this package release. Do not edit them
directly — they are regenerated on each publish. To contribute guidance edits,
open a PR against the source monorepo.
<!-- owlmeans:agent-guidance:end -->
