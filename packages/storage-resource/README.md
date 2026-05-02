# @owlmeans/storage-resource

S3-compatible object storage resource for OwlMeans server applications.

## Overview

- `createStorageResource(alias?, configKey?)` — creates an S3-backed storage resource
- `appendStorageResource(ctx, alias?, configKey?)` — registers the resource in the context
- `StorageResource` — extends `Resource<StoredRecord>` for uploading and retrieving files
- `StoredConfigAppend` — config mixin type for storage bucket credentials

## Installation

```bash
bun add @owlmeans/storage-resource
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
      "url": "https://s3.amazonaws.com",
      "apiKey": "...",
      "basePrefix": "my-bucket/images"
    }
  }
}
```

Upload a file:

```typescript
const storage = context.resource<StorageResource>('images')
await storage.save({
  id: fileId,
  prefix: 'uploads',
  stream: readableStream,
  type: 'image/jpeg'
})
```

## API

### `createStorageResource(alias?, configKey?): StorageResource`

Creates an S3 storage resource. `alias` defaults to `DEFAULT_ALIAS` (`'s3-storage'`).

### `appendStorageResource<C, T>(ctx, alias?, configKey?): T`

Registers the storage resource in the context.

### `StoredRecord`

Extends `ResourceRecord` with: `url?`, `size?`, `prefix`, `stream?`, `format?`, `type?`, `bytes?`, `base64?`

### `StorageConfig`

`{ url: string, apiKey: string, basePrefix: string }`

### `stripData<Input, Output>(file): Output`

Strips raw data fields from a `StoredFileWithData` to produce a `StoredFile` (URL-only).

### `supportedMimeTypes`

Array of MIME types accepted for upload.

## Related Packages

- [`@owlmeans/storage-common`](../storage-common) — shared types (`StoredFileMeta`, `StoredFile`, etc.)
- [`@owlmeans/image-resource`](../image-resource) — image-specific resource built on top of this
