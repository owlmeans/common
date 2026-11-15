---
name: archives
description: Reading and writing zip, tar, tar.gz and gz with archiveHelper — format detection from bytes, listing, safe extraction into a tree (traversal, link, duplicate, bomb and overlap guards, per-entry verification, skip or fail), nested archives, packing and gzip/gunzip sources, and the archive limits.
metadata:
  purposes: data
  mentions: archiveHelper, createArchiveHelper, ArchiveFormat, ArchiveExtractOptions, ArchiveLimits, DEFAULT_ARCHIVE_LIMITS, ExtractResult, PackEntry, onEntryError, maxDepth, ArchiveError
---

# @owlmeans/file-streams — Archives

```typescript
import { ArchiveFormat, archiveHelper, createDirectorySink, createFileSource, FileKind, httpClient } from '@owlmeans/file-streams'

const result = await archiveHelper.extract(httpClient.source(zipUrl), createDirectorySink(dir), {
  verify: { refuse: [FileKind.Executable] }, onEntryError: 'skip', strip: 1, limits: { maxEntries: 500 },
})
result.extracted   // [{ entry, path, result }, …]
result.skipped     // [{ entry, reason }, …] — 'link', 'unsupported-type', 'stripped', 'filtered', or the error message

await archiveHelper.list(createFileSource(path))            // ArchiveEntryInfo[] — nothing written
await archiveHelper.detect(source)                          // ArchiveFormat | null
const zip = archiveHelper.pack(ArchiveFormat.Zip, [{ path: 'a.txt', source: bytes }, { path: 'b.pdf', source: fileSource }], { name: 'out.zip' })
const gz = archiveHelper.gzip(source)                       // a one-shot source of the compressed bytes
const plain = archiveHelper.gunzip(source)                  // the decompressed bytes, under the ratio and size limits
```

## Reading

zip is read from its central directory (yauzl) — through range reads when the source has them, else
from a private temporary spool (at most `maxTotalBytes`) — and written as a stream (yazl); tar and
tar.gz stream through tar-stream (an entry is drained, never destroyed: destroying one destroys the
archive); gz is zlib, its single entry named from the gzip header or the source's name without
`.gz`. The format comes from the bytes (`format` skips detection), never from names.

## Extraction rules

- **Refused** (the extraction stops): absolute paths, `..`, drive letters, control and bidi
  characters, overlong or deep paths (`maxPathBytes`, `maxPathSegments`), duplicate and
  case-fold-twin entries, encrypted entries, compression methods other than store and deflate,
  overlapping zip entries, sizes that lie (yauzl `validateEntrySizes`), a declared or measured
  expansion ratio above `maxRatio` once past 1 MiB (`RATIO_FLOOR_BYTES`), more entries or bytes than
  the limits.
- **Skipped** (reported in `skipped`): links (`links: 'refuse'` throws `ArchiveError('link')`
  instead), devices and other special entries, entries `strip` empties, entries `filter` rejects.
  Neither links nor devices are ever created.
- **Verification** runs only when `verify` is given: each entry's head is checked against the
  entry's own name before it is written.
- **`onEntryError: 'skip'`** skips an entry whose write or verification fails (a too-large workload
  file, a mimicry refusal); `LimitError`, `ArchiveError`, `PathError` and an abort always stop.
- **Nested archives** (`zip`, `tar`, `tar.gz`, `tgz`, `gz` names) stay files unless
  `limits.maxDepth` > 1; a followed one is spooled and extracted under its name without the extension.
- Each entry commits atomically; a refusal leaves the entries already written. `onEntry(entry,
  result)` reports each written file.

## Packing

`pack(format, entries, { name?, level?, maxSpoolBytes? })` returns a one-shot `FileSource`. Entry
paths pass the same path rules; a `source` is a `FileSource` or a `Uint8Array`. A tar needs sizes up
front, so a source without one is spooled (up to 512 MiB by default). gz takes exactly one entry
(`ArchiveError('gzip-entries')`).

## Limits

| Limit | Default |
|---|---|
| `maxEntries` | 10 000 |
| `maxEntryBytes` | 512 MiB |
| `maxTotalBytes` | 2 GiB |
| `maxRatio` | 200 |
| `maxDepth` | 1 |
| `maxPathBytes` / `maxPathSegments` | 1024 / 64 |

`createArchiveHelper({ limits, inspector })` sets the defaults of one helper; each call's `limits`
override them. The service takes them as `archiveLimits` in its options.

## External docs

- https://github.com/thejoshwolfe/yauzl — central-directory zip reading, `fromRandomAccessReader` (override `read` and `_readStreamForRange`), `validateEntrySizes`, automatic `validateFileName` (v3)
- https://github.com/mafintosh/tar-stream — v3 ships streamx typings; destroying an entry destroys the extract, so entries are drained
