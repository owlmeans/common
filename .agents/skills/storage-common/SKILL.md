---
name: storage-common
description: How to use @owlmeans/storage-common — shared object/file storage types, error types and schemas used by storage-resource, image-resource and file-streams, and the FileScope nesting (organization / project / purpose) that temporary folders and bucket prefixes share. Auto-invoked when importing storage primitives or addressing a task's files by scope.
user-invocable: false
---

# @owlmeans/storage-common

**Layer:** Infra
**Install:** `"@owlmeans/storage-common": "^0.2.0-alpha.1"` in `dependencies`

## Key Exports

| Export | Description |
|--------|-------------|
| `StoredFileMeta` | What a stored file is *about*: `alias`, `mimeType`, `scopes`, `status`, plus optional `entityId`, `sourceName`, `name`, `title` |
| `StoredFileInstance`, `StoredFilePayload` | One rendition — `{ size, alias, url }` — and the same rendition carrying its bytes (`format`, `bytes`, `base64`) |
| `StoredFile`, `StoredFileWithData` | The metadata plus its `instances` map, which is required; the `WithData` form makes each instance a `StoredFilePayload` and adds a record-level `format` |
| `StoredFileMetaSchema`, `StoredFileInstanceSchema`, `StoredFilePayloadSchema`, `StoredFileSchema`, `StoredFileWithDataSchema` | The matching AJV schemas |
| `StoredFileStatus`, `StoredFileFormat` | `uploaded` / `processing-ready` / `processed` / `cached` / `unknown`; `bytes` / `base64` |
| `FileScope`, `FileScopeSchema`, `FileScopeSegmentSchema` | Where a task's files live: `{ organization, project?, purpose }`, and its AJV schemas |
| `fileScopeHelper` / `createFileScopeHelper()` | `pathOf(scope)`, `parse(path)`, `isSegment(value)`, `assert(scope)` |
| `FILE_SCOPE_SEGMENT_PATTERN`, `FILE_SCOPE_SEGMENT_MAX_LENGTH` | The segment rule: `^[A-Za-z0-9][A-Za-z0-9._-]*$`, at most 128 characters |
| Errors | `StoredFileError`, `OrphanFileError`, `FilePropertyError`, `FileStreamError`, `StorageApiError`, `FileTypeError`, `FileScopeError` |

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

## File scopes

A `FileScope` names where one task's files live, on disk and in a bucket alike, so a temporary folder
and its backup prefix never disagree. `organization` is the organization's `entitySlug` (the wire
value), `project` an optional project id or slug, `purpose` the task (`new-project`, `upload`).

```typescript
import { fileScopeHelper } from '@owlmeans/storage-common'

fileScopeHelper.pathOf({ organization: 'acme', project: 'slot-12', purpose: 'new-project' })   // 'acme/slot-12/new-project'
fileScopeHelper.pathOf({ organization: 'acme', purpose: 'upload' })                            // 'acme/upload'
fileScopeHelper.parse('acme/slot-12/new-project')   // two segments → organization/purpose, three → organization/project/purpose
```

- Every field is one segment: 1–128 characters, a letter or digit first, then letters, digits, `.`,
  `_`, `-` — so never `.`, `..`, a separator or a hidden name. `pathOf` asserts first; `assert` throws
  `FileScopeError` (`stored-file:scope:<organization|project|purpose|shape>`), `parse` throws
  `stored-file:scope:path` for any other shape.
- `FileScopeSchema` validates the same (no extra properties) for records and routes that carry one.
- Claim a scope once, store it with what it serves, and read it back — never recompute it from a name
  that can be renamed. Within one organization a purpose never equals a project segment:
  `acme/<purpose>` would otherwise contain `acme/<project>/…`.
- [[file-streams]] builds workspaces and backed workspaces on it.

## Tests

Category A: `tests/file-scope.spec.ts` (nesting, segment refusals, parse shapes, schema parity).

## Depends On

- `@owlmeans/error`, `@owlmeans/auth` (the shared `entityId` / id / scope value schemas)
- peer `ajv`
