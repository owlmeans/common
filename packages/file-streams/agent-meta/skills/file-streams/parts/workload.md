---
name: workload
description: Writing files into a Viable ephemeral workload (makeWorkloadSink over writeBinaryFile) and reading them back (makeWorkloadSource over readBinaryFile) — the 12 MiB per-file ceiling, atomic writes, retries, random access over one read, and archives fanned out into a workload.
metadata:
  purposes: agent, data
  mentions: makeWorkloadSink, makeWorkloadSource, WorkloadWriter, WorkloadReader, WorkloadSource, writeBinaryFile, readBinaryFile, WORKLOAD_MAX_FILE_BYTES, WorkloadError
---
<!-- AUTO-GENERATED — do not edit. Regenerate via sync-agent-meta. -->

# @owlmeans/file-streams — Viable workloads

## Writes

A workload accepts bytes only as the publisher's signed `writeBinaryFile { filePath, base64 }`
command; the agent reaches it through viable-agent's `FileHelper`, which satisfies
`WorkloadWriter` as is (pass the helper, never a destructured method):

```typescript
import { archiveHelper, FileKind, httpClient, makeWorkloadSink, transferHelper } from '@owlmeans/file-streams'

const media = makeWorkloadSink(fileHelper, { root: 'web/public/media' })   // a folder inside the workload's project
await transferHelper.copy(httpClient.source(imageUrl), media.entry('hero.png'), { verify: { allow: [FileKind.Image] } })
await archiveHelper.extract(httpClient.source(zipUrl), media, { onEntryError: 'skip' })
```

Each file is one atomic write of at most 12 MiB (`WORKLOAD_MAX_FILE_BYTES`, the publisher's 16 MiB
base64 limit, `WORKLOAD_MAX_BASE64_CHARS`); `maxFileBytes` lowers it, and an oversized file is
refused before any request (`WorkloadError('too-large')`) — by its declared size, or while it is
collected. A failed write is retried (`retries`, default 1; the write is atomic on the workload),
then `WorkloadError('write-failed')`. `root` and every entry path pass the package's path rules
(`PathError` otherwise); `directory()` is a no-op. In an extraction with `onEntryError: 'skip'`, a
file that does not fit is skipped and the rest still land. Larger files need a product route
(chunked writes, or the workload pulling a URL itself — it has public egress and can run this
package).

## Reads

```typescript
import { createWorkspace, FileKind, makeWorkloadSource, transferHelper } from '@owlmeans/file-streams'

const materials = makeWorkloadSource(fileHelper, { root: 'docs/materials' })   // WorkloadReader: readBinaryFile(filePath) → base64
const files = createWorkspace().scope({ organization: entitySlug, purpose: 'materials' })
await transferHelper.copy(materials.entry('logo.png'), files.entry('logo.png'), { verify: { allow: [FileKind.Image] } })
```

The publisher's `readBinaryFile { filePath } → { base64 }` command, reached through viable-agent's
`FileHelper` (pass the helper itself). Each `open` is one read of the whole file; `info()` reads
nothing and knows the size once a read has happened; `ranges()` serves the bytes of one read, so
probes and zip extraction work. Files above 12 MiB (`WORKLOAD_MAX_FILE_BYTES`) or a lower
`maxFileBytes` are refused before decoding (`WorkloadError('too-large')`); a failed read is retried
once (`retries`), then `WorkloadError('read-failed')`, as is an answer that is not a string.
