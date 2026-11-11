---
name: workspaces
description: Scoped temporary workspaces nested by organization/project/purpose, workspaces mirrored to a bucket (put, restore, evict, drop), bucket prefix listing and removal, reading files back from a Viable workload, and the service's workspace config.
metadata:
  purposes: data, config, ops
  mentions: createWorkspace, createBackedWorkspace, makeWorkloadSource, WorkloadReader, readBinaryFile, removePrefix, fileScopeHelper, FileScope, WorkspaceScope, BackedScope, BackedWorkspace, WORKSPACE_SCOPE_MARKER
---
<!-- AUTO-GENERATED — do not edit. Regenerate via sync-agent-meta. -->

# @owlmeans/file-streams — Workspaces, backed workspaces, prefixes and workload reads

## Scopes

A `FileScope` (`@owlmeans/storage-common`, re-exported here) is `{ organization, project?, purpose }`:
the organization's `entitySlug`, an optional project id or slug, the task (`new-project`, `upload`).
Each is one segment — 1–128 characters of `[A-Za-z0-9][A-Za-z0-9._-]*`, so never `.` or `..` —
and `fileScopeHelper.pathOf(scope)` nests them as `org/project/purpose` or `org/purpose`
(`parse` reads a path back, `assert` throws `FileScopeError('<field>')`). Claim a scope once, store
it with the records it serves and read it back; never recompute it from names that can change.

## Workspace

```typescript
import { createWorkspace, transferHelper, archiveHelper, httpClient, FileKind } from '@owlmeans/file-streams'

const workspace = createWorkspace()              // <os.tmpdir()>/owlmeans-workspace
const files = workspace.scope({ organization: entitySlug, project: slotId, purpose: 'new-project' })
await transferHelper.copy(httpClient.source(url), files.entry('brand/logo.png'), { verify: { allow: [FileKind.Image] } })
await archiveHelper.extract(source, files.tree(), { onEntryError: 'skip' })
await files.list()                               // [{ path: 'brand/logo.png', size, modifiedAt }, …]
await files.drop()                               // the folder and the parents it leaves empty
await workspace.prune({ olderThanMs: 24 * 3600_000 })
```

- **Root**: absolute, or relative to `os.tmpdir()` (which `TMPDIR` moves) — never to the cwd.
  Folders are created `0o700`, files written `0o600` (`dirMode`, `fileMode`). Nothing survives a pod
  restart; that is what a backed workspace is for.
- **Scope folders**: `workspace.scope(scope)` does no I/O. The first write creates
  `<root>/<scope path>` and its marker `.owlmeans-scope` (`WORKSPACE_SCOPE_MARKER`, the scope as
  JSON); `scopes(organization?)` answers the marked folders, sorted by path.
- **Confinement**: every path goes through the package's path rules (`\` → `/`, NFC; refused:
  `traversal`, `absolute`, `invalid-char`, `too-long`, `too-deep`, `empty`), a segment named like the
  marker is `reserved`, and any existing symlink from the workspace root down to the target is
  refused (`PathError('symlink')`) — checked before and after folders are created, and on every
  `source` call. `list()` neither follows nor shows links and hides in-flight temporary files.
- **Writes**: `entry(path, { onConflict })` (default `error` → `PathError('exists')`) and
  `tree({ onConflict })` — a confined directory sink for archives, refusing case-fold twins within
  one tree. Each file commits atomically. `source(path, claims?)` is re-openable with random access.
- **Reads and removal**: `has(path)` is true for a regular file only; `remove(path)` takes a file or a
  folder and the parents it empties (the scope folder stays), `false` when absent; `drop()` removes
  the scope folder and every parent it empties, up to — never including — the root.
- **Overlap**: `org/<purpose>` contains `org/<project>/<purpose>` when a project segment equals a
  purpose. The scope on disk first keeps the folder; the other's first write throws
  `PathError('scope-overlap')`. A bucket cannot see this (it has no markers), so purposes never equal
  a project segment.
- **Prune** drops whole scopes whose newest file, scope folder and marker are all older than
  `olderThanMs` (never single files, so a scope is never half there), answers how many and logs it at
  info. Writes to different scopes are independent; a drop that empties a shared parent while a
  sibling scope is being created is retried once.

## Backed workspace

```typescript
import { createBackedWorkspace, createS3Bucket, createWorkspace } from '@owlmeans/file-streams'

const backed = createBackedWorkspace({ workspace: createWorkspace(), bucket: createS3Bucket(cfg.storageBuckets.projects), prefix: 'materials' })
const files = backed.scope(scope)
const { local, remote, transfer } = await files.put('brand/logo.png', source, { verify: { refuse: [FileKind.Executable] } })
files.key('brand/logo.png')        // '<basePrefix>/materials/<org>/<project>/<purpose>/brand/logo.png'
files.prefixOf('brand/logo.png')   // the same without the base prefix — what bucket.source/sink/head/urlOf take
const { restored, kept } = await files.restore()   // after a restart: the bucket is the authority
await files.drop()                                  // local folder + every object under the scope
```

- **Layout**: an object lands at `<basePrefix>/<prefix?>/<scope path>/<path>` — the same nesting as
  the folder. Give the bucket entry `acl: false` (or a private bucket): the files are people's uploads,
  and storage-resource's default ACL is `public-read`.
- **`put(path, source, options)`** copies the source into the local entry through the transfer helper
  (`verify`, `limits`, `hash`, `onProgress` pass through; `onConflict` defaults to `overwrite`, like the
  bucket), then uploads the LOCAL file, with the Content-Type and disposition of the copy's verdict
  (`options.sink` sets cache control or metadata for every object). A failed upload removes the local
  copy and rethrows, so everything local is backed. A refused verification writes nothing anywhere.
- **`restore()`** lists the scope's prefix and downloads every object that is missing locally or has
  another size — byte-identical, unverified (it was verified on the way in); the rest are `kept`.
  Local files the bucket does not name are left alone; folder placeholder keys (ending `/`) are skipped.
- **`list()`** is the remote listing with paths relative to the scope; **`remove(path)`** deletes the
  local file or folder, the object and anything under `<path>/`; **`evict()`** drops the local copy
  only; **`drop()`** drops the local copy and every object under the scope.

## Bucket prefixes

- `bucket.list(prefix)` answers every object under `<prefix>/` (ListObjectsV2, all pages — a sibling
  `prefix-x` is not included) as `{ key, path, size, etag, modifiedAt }`, `path` relative to the
  prefix; a listing carries no media type. An empty prefix is refused (`PathError('empty')`), so no call
  ever addresses the whole base prefix.
- `bucket.removePrefix(prefix)` lists, then deletes in DeleteObjects batches of at most 1000 keys
  (`S3_DELETE_BATCH_SIZE`) and answers the count. DeleteObjects requires a checksum: the request carries
  Content-MD5 in place of the SDK's flexible checksum headers (the SDK's own MD5 fallback), which S3 and
  stores that predate flexible checksums both accept; every other operation keeps the client's
  `WHEN_REQUIRED` checksums. A key the store refuses throws `S3TransferError('delete-objects:<code>')`;
  removal is not atomic, and running it again is safe.

## Workload reads

```typescript
const materials = makeWorkloadSource(fileHelper, { root: 'docs/materials' })   // WorkloadReader: readBinaryFile(filePath) → base64
await transferHelper.copy(materials.entry('logo.png'), files.entry('logo.png'), { verify: { allow: [FileKind.Image] } })
```

The publisher's `readBinaryFile { filePath } → { base64 }` command, reached through viable-agent's
`FileHelper` (pass the helper itself). Each `open` is one read of the whole file; `info()` reads
nothing and knows the size once a read has happened; `ranges()` serves the bytes of one read, so
probes and zip extraction work. Files above 12 MiB (`WORKLOAD_MAX_FILE_BYTES`) or a lower
`maxFileBytes` are refused before decoding (`WorkloadError('too-large')`); a failed read is retried
once (`retries`), then `WorkloadError('read-failed')`.

## Service

`cfg.fileStreams.workspace: { root?, dirMode?, fileMode? }` → `service.workspace()`;
`service.backed(storageKey, { prefix? })` is one backed workspace per storage entry and prefix, over
that workspace and the service's transfer helper (its configured limits). A server context reads
every string leaf that starts with `/` as a secret file, so `root` is relative to `os.tmpdir()`
(`root: 'agent-workspace'`), or a file that holds an absolute path.

## External docs

- https://github.com/aws/aws-sdk-js-v3/blob/main/supplemental-docs/MD5_FALLBACK.md — since v3.729 the SDK checksums with CRC32; DeleteObjects is the one operation that requires a checksum, and the documented fallback strips the flexible checksum headers and adds Content-MD5 after `flexibleChecksumsMiddleware`
- https://docs.aws.amazon.com/AmazonS3/latest/API/API_DeleteObjects.html — at most 1000 keys per request; Content-MD5 or an `x-amz-checksum-*` header is required
- https://docs.aws.amazon.com/AmazonS3/latest/API/API_ListObjectsV2.html — at most 1000 keys per page, `IsTruncated` + `NextContinuationToken`
