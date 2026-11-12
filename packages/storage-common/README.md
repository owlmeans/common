# @owlmeans/storage-common

Shared types and schemas for OwlMeans object storage — file metadata, instances, and status enums.

## Overview

- `StoredFileMeta` / `StoredFile` / `StoredFileWithData` — file record types
- `StoredFileInstance` / `StoredFilePayload` — per-variant instance types (URL + size)
- `StoredFileStatus` / `StoredFileFormat` — enums for file lifecycle state and encoding
- `FileScope` / `FileScopeSchema` / `fileScopeHelper` — where a task's files live:
  `<organization>/<project?>/<purpose>`, on disk and in a bucket alike
- Used by `@owlmeans/storage-resource`, `@owlmeans/image-resource` and `@owlmeans/file-streams`

## Installation

```bash
bun add @owlmeans/storage-common@^0.2.0-alpha.1
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

### `FileScope` and `fileScopeHelper`

```typescript
import { fileScopeHelper } from '@owlmeans/storage-common'
import type { FileScope } from '@owlmeans/storage-common'

const scope: FileScope = { organization: 'acme', project: 'slot-12', purpose: 'new-project' }
fileScopeHelper.pathOf(scope)                 // 'acme/slot-12/new-project'
fileScopeHelper.pathOf({ organization: 'acme', purpose: 'upload' })   // 'acme/upload'
fileScopeHelper.parse('acme/upload')          // { organization: 'acme', purpose: 'upload' }
fileScopeHelper.isSegment('..')               // false
fileScopeHelper.assert(value)                 // FileScopeError('<field>') unless a valid scope
```

Every field is one segment: 1–128 characters of `[A-Za-z0-9][A-Za-z0-9._-]*` (`FileScopeSchema`
validates the same with AJV).

## Related Packages

- [`@owlmeans/storage-resource`](../storage-resource) — S3-compatible resource using these types
- [`@owlmeans/image-resource`](../image-resource) — image-specific extensions of these types

<!-- owlmeans:agent-guidance:start -->
## Agent guidance

This package ships embedded agent skills under `agent-meta/`. After installing your
`@owlmeans/*` packages, run the OwlMeans agent-skills installer to place them into
your project's skill store (`.agents/skills/`):

```sh
npx @owlmeans/agent-skills@^0.2.0-alpha.2
```

The embedded files are version-matched to this package release. Do not edit them
directly — they are regenerated on each publish. To contribute guidance edits,
open a PR against the source monorepo.
<!-- owlmeans:agent-guidance:end -->
