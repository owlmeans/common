# @owlmeans/storage-common

Shared types and schemas for OwlMeans object storage — file metadata, instances, and status enums.

## Overview

- `StoredFileMeta` / `StoredFile` / `StoredFileWithData` — file record types
- `StoredFileInstance` / `StoredFilePayload` — per-variant instance types (URL + size)
- `StoredFileStatus` / `StoredFileFormat` — enums for file lifecycle state and encoding
- Used by `@owlmeans/storage-resource` and `@owlmeans/image-resource`

## Installation

```bash
bun add @owlmeans/storage-common
```

## API

### `StoredFileMeta`

```typescript
interface StoredFileMeta {
  entityId?: string
  name?: string
  scopes: string[]
  mimeType: string
  alias: string
  status: StoredFileStatus
}
```

### `StoredFile`

Extends `StoredFileMeta` with `instances: { [key: string]: StoredFileInstance }`.

### `StoredFileWithData`

Extends `StoredFileMeta` with `instances: { [key: string]: StoredFilePayload }` (includes raw data for upload).

### `StoredFileStatus`

`Uploaded` | `ProcessingReady` | `Processed` | `Cached` | `Unknown`

### `StoredFileFormat`

`Bytes` | `Base64`

## Related Packages

- [`@owlmeans/storage-resource`](../storage-resource) — S3-compatible resource using these types
- [`@owlmeans/image-resource`](../image-resource) — image-specific extensions of these types
