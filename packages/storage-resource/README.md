# @owlmeans/storage-resource

S3-compatible object storage resource for OwlMeans server applications.

## Overview

- `createStorageResource(alias?, configKey?)` — creates an S3-backed storage resource
- `appendStorageResource(ctx, alias?, configKey?)` — registers the resource in the context
- `StorageResource` — an upload and nothing else: `Pick<Resource<StoredRecord>, 'create'>` plus
  `BasicResource`. The bucket takes a stream and hands back a URL; there is no record store behind
  it to read, list or delete against
- `StoredConfigAppend` — config mixin type for storage bucket credentials
- `makeStorageBucketModel(config)` — how one bucket entry addresses its objects (bucket, endpoint,
  region, keys, public URLs, a client); `@owlmeans/file-streams` reads and writes through it, so an
  object either package writes is found by the other

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

Config (`config.json`):

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

`url` is `<bucket>.<endpoint-host>` — no scheme. Any S3-compatible store is addressed with the
optional fields instead:

```json
{ "endpoint": "http://127.0.0.1:9000", "bucket": "media", "forcePathStyle": true, "region": "us-east-1",
  "acl": false, "apiKey": "<keyId>:<secret>", "basePrefix": "images" }
```

Upload a file:

```typescript
const storage = context.resource<StorageResource>('images')
const stored = await storage.create({
  id: fileId,
  prefix: 'uploads',
  stream: readableStream,
  type: 'image/jpeg'
})
// stored.url — where the object now lives
```

## API

### `createStorageResource(alias?, configKey?): StorageResource`

Creates an S3 storage resource. `alias` defaults to `DEFAULT_ALIAS` (`'s3-storage'`). The only data
method is `create(record)`, which uploads the stream and answers the record with its `url` filled in.

### `appendStorageResource<C, T>(ctx, alias?, configKey?): T`

Registers the storage resource in the context.

### `StoredRecord`

Extends `ResourceRecord` with: `url?`, `size?`, `prefix`, `stream?`, `format?`, `type?`, `bytes?`, `base64?`

### `StorageConfig`

`{ url?, apiKey, basePrefix, endpoint?, bucket?, region?, forcePathStyle?, acl?, publicUrl? }` —
`url` is required unless `endpoint` and `bucket` are set; `region` defaults to `eu-central-1`,
`acl` to `public-read` (`false` sends none).

### `makeStorageBucketModel(config): StorageBucketModel`

`bucket`, `endpoint`, `region`, `forcePathStyle`, `basePrefix`, `acl`, `keyOf(prefix)`
(`<basePrefix>/<prefix>`), `urlOf(prefix)` and `createClient()` (a new `S3Client` the caller
destroys). Throws `FilePropertyError` for an entry it cannot address.

### `stripData<Input, Output>(file): Output`

Strips raw data fields from a `StoredFileWithData` to produce a `StoredFile` (URL-only).

### `supportedMimeTypes`

Array of MIME types accepted for upload.

## Related Packages

- [`@owlmeans/storage-common`](../storage-common) — shared types (`StoredFileMeta`, `StoredFile`, etc.)
- [`@owlmeans/image-resource`](../image-resource) — image-specific resource built on top of this
- [`@owlmeans/file-streams`](../file-streams) — streaming reads, multipart writes and transfers over the same bucket entries

<!-- owlmeans:agent-guidance:start -->
## Agent guidance

This package ships embedded agent skills under `agent-meta/`. After installing your
`@owlmeans/*` packages, run the OwlMeans agent-skills installer to place them into
your project's skill store (`.agents/skills/`):

```sh
npx @owlmeans/agent-skills@^0.1.21
```

The embedded files are version-matched to this package release. Do not edit them
directly — they are regenerated on each publish. To contribute guidance edits,
open a PR against the source monorepo.
<!-- owlmeans:agent-guidance:end -->
