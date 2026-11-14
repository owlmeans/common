---
name: file-streams
description: "How to use @owlmeans/file-streams — online files as Node streams: URL downloads under a connect-time SSRF policy (follow or return redirects, any status on request), a pinned WHATWG fetch on the aws-free ./fetch subpath, HTTP and SOCKS proxy plugins (a list or a callback by key and URL), the Google Drive resolver, S3 buckets addressed exactly like storage-resource (with prefix listing and removal), folders, buffers and Viable ephemeral workloads (writes and reads); scoped temporary workspaces nested by organization/project/purpose and mirrored to a bucket for restore after a restart; zip/tar/tar.gz/gz with traversal and bomb guards; file-type verification from a head or a few range reads. Auto-invoked when downloading a file, giving fetch-based code (llm-reader, a renderer) pinned egress, moving bytes between HTTP, S3, disk and a workload, keeping uploaded files in a service tmp folder backed by S3, extracting or packing an archive, checking that a file is what it claims, or configuring outbound proxies."
user-invocable: false
---

# @owlmeans/file-streams

**Layer:** Infra
**Install:** `"@owlmeans/file-streams": "^0.2.0-alpha.0"` in `dependencies`

Server-side (Node and Bun). Every byte moves as a Node `Readable` — the shape storage-resource's
`StoredRecord.stream`, the AWS SDK, zlib and the archive codecs share. A web stream, an async
iterable or a `Uint8Array` is accepted where a source is built.

## Key Exports

| Export | What it is |
|---|---|
| `FileSource` / `FileSink` / `TreeSink` | Where bytes come from (`info`, `open`, `ranges`), where one file goes, where many go |
| `httpClient` / `createHttpClient(opts)` | Requests under the network policy, through proxies, redirects and resolvers; `.source(url)` is a re-openable, Range-capable source; `redirect: 'manual'` returns a 3xx, `anyStatus` every status |
| `createPinnedFetch(opts)` (`@owlmeans/file-streams/fetch`) | A WHATWG `fetch` over the client — pinned connects, Drive resolver, streamed bodies, GET/HEAD; the subpath loads no AWS SDK |
| `createFileSource`, `createBufferSource`, `createStreamSource` | A file on disk, bytes in memory (a screenshot), a stream opened elsewhere (one-shot) |
| `createFileSink`, `createDirectorySink`, `createBufferSink` | Atomic file write, a confined directory tree, an in-memory collector |
| `createS3Bucket(entry or model, opts)` | A `cfg.storageBuckets` entry as `source`, `sink`, `tree`, `head`, `remove`, `list`, `removePrefix`, `instanceOf` |
| `makeWorkloadSink(writer, { root })` / `makeWorkloadSource(reader, { root })` | A Viable ephemeral workload as a tree, through its `writeBinaryFile` port; its files as sources, through `readBinaryFile` |
| `createWorkspace({ root?, dirMode?, fileMode? })` | A service's temporary files, one confined folder per `FileScope` (`scope`, `scopes`, `prune`) |
| `createBackedWorkspace({ workspace, bucket, prefix? })` | Scopes mirrored to a bucket under the same nesting: `put`, `restore`, `list`, `remove`, `evict`, `drop` |
| `fileScopeHelper`, `FileScope`, `FileScopeSchema`, `FileScopeError` | Re-exported from `@owlmeans/storage-common`: the `<organization>/<project?>/<purpose>` nesting |
| `transferHelper.copy(source, sink, opts)` / `.copyInto(source, tree, opts)` | One file moved under limits, its head verified before the sink sees a byte |
| `fileInspector.probe(source)` / `.inspect(bytes, claims)` / `.enforce(verdict, policy)` | What a file really is, against what it claims — re-exported from `@owlmeans/file-inspector` |
| `archiveHelper.extract / list / pack / gzip / gunzip / detect` | zip, tar, tar.gz and gz, detected from bytes |
| `createProxyRouter`, `createHttpProxyPlugin`, `createSocksProxyPlugin` | Proxy selection and the built-in protocol plugins |
| `createGoogleDriveResolver(opts)` / `googleDriveResolver` | Drive and Docs links to the bytes behind them (on by default in `createHttpClient`) |
| `createNetworkPolicy(opts)` | What may be reached; every connection goes through it |
| `appendFileStreamsService(ctx, alias?, opts?)` | The objects configured from `cfg.fileStreams` and `cfg.storageBuckets` |
| `FileKind`, `ArchiveFormat`, `WORKLOAD_MAX_FILE_BYTES`, `S3_DELETE_BATCH_SIZE`, `WORKSPACE_SCOPE_MARKER` | Enums, ceilings, the reserved marker name |
| `NetworkPolicyError` (`.refused === true`), `HttpError` (`.status`), `ProxyError`, `LimitError`, `SourceError`, `PathError`, `ArchiveError`, `ResolverError`, `WorkloadError` | Failures, by message code (`file-streams:<area>:<reason>`) |
| `FileMimicryError`, `FileKindError` (storage `FileTypeError`, from file-inspector), `S3TransferError` (storage `StorageApiError`) | Type refusals and S3 failures a storage-resource catch site already handles |

## Usage

```typescript
import {
  archiveHelper, createBufferSource, createDirectorySink, createHttpClient, createS3Bucket, FileKind,
  fileInspector, httpClient, makeWorkloadSink, transferHelper,
} from '@owlmeans/file-streams'

// An image from the internet into a folder, refused unless it is an image
await transferHelper.copyInto(httpClient.source(url), createDirectorySink(workDir), { verify: { allow: [FileKind.Image] } })

// A screenshot (a Buffer) into the bucket a storage entry names — same key and URL storage-resource uses
const bucket = createS3Bucket(cfg.storageBuckets.media)
const { sink } = await transferHelper.copy(createBufferSource(png, { name: 'shot.png' }), bucket.sink(`${entityId}/shots/${id}.png`))
sink.url                                   // === storage-resource's URL for that prefix
bucket.instanceOf(sink, 'original')        // a storage-common StoredFileInstance

// A media archive into a folder or a workload; entries that cannot be written are skipped
await archiveHelper.extract(httpClient.source(archiveUrl), createDirectorySink(dir), { onEntryError: 'skip' })

// What a remote file is, without downloading it (a few range reads, at most 1 MiB)
const verdict = await fileInspector.probe(httpClient.source(url))

// Proxies: a list (round-robin, random, failover, by-key) or a callback by key and URL
const pooled = createHttpClient({ proxies: { proxies: ['socks5h://u:p@egress-1:1080', 'http://egress-2:3128'], strategy: 'by-key' } })
const vaulted = createHttpClient({ proxies: { proxies: async ({ key, url }) => vault.proxyFor(key, url.hostname) } })
await pooled.request(url, { proxyKey: entityId })
```

`copy` reads the head of the very stream it moves (no second download), verifies it, and replays
it into the sink. Verification is on by default: a kind mismatch is refused, dangerous content (an
executable under another claim, a script under a passive one, a PDF with active content in the head
sample) is always refused, `verify.refuse` refuses kinds outright, an inconclusive verdict passes
unless `refuseInconclusive`; `verify: false` turns it off.

## The pinned fetch

`createPinnedFetch(opts)` from `@owlmeans/file-streams/fetch` (no AWS SDK, storage-resource or S3
module in its graph) is `fetch` over the client — any status a `Response`, `redirect: 'manual'` the
3xx itself, GET/HEAD only, bodies streamed, policy refusals `NetworkPolicyError` (`refused === true`).
Rules: the [network](parts/network.md) part.

## The Viable workload

A workload accepts bytes only as the publisher's signed `writeBinaryFile { filePath, base64 }`
command; the agent reaches it through viable-agent's `FileHelper`, which satisfies
`WorkloadWriter` as is (pass the helper, never a destructured method):

```typescript
const media = makeWorkloadSink(fileHelper, { root: 'sources/web/public/media' })
await transferHelper.copy(httpClient.source(imageUrl), media.entry('hero.png'), { verify: { allow: [FileKind.Image] } })
await archiveHelper.extract(httpClient.source(zipUrl), media, { onEntryError: 'skip' })
```

Each file is one atomic write of at most 12 MiB (`WORKLOAD_MAX_FILE_BYTES`, the publisher's 16 MiB
base64 limit); `maxFileBytes` lowers it, and an oversized file is refused before any request
(`WorkloadError('too-large')`). Larger files need a product route (chunked writes, or the workload
pulling a URL itself — it has public egress and can run this package).

Reads go the other way through `makeWorkloadSource(reader, { root })` (`readBinaryFile`, same
ceiling): the [workspaces](parts/workspaces.md) part.

## Workspaces

`createWorkspace().scope({ organization, project?, purpose })` is the folder
`<root>/<organization>/<project?>/<purpose>` (segments by `fileScopeHelper`); a backed workspace
mirrors every scope to `<basePrefix>/<prefix?>/<scope path>/<path>` in a bucket, and the bucket is the
authority — a pod restart loses the tmp folder, `restore()` brings the scope back. Paths are confined
(no `..`, no absolute paths, no existing symlink from the workspace root, the marker name reserved);
a relative `root` lives under `os.tmpdir()`. Full rules, overlap and prune semantics, prefix
operations: the [workspaces](parts/workspaces.md) part.

## Detection

Verification is `@owlmeans/file-inspector` (its `file-inspector` skill: verdicts, policies, kinds,
active PDF, probes). This package re-exports its inspector, kinds, tables, verdict types and the two
refusals unchanged, and every source here (`FileSource`) is a file-inspector `ProbeSource` as is: a
probe seeks through `ranges()` when the origin has them and reads the head of `open()` otherwise. The
S3 sink takes the Content-Type from the verdict and writes `attachment` for active svg/html.

## Archives

zip is read from its central directory (yauzl) — through range reads when the source has them, else
from a private temporary spool — and written as a stream (yazl); tar and tar.gz stream through
tar-stream (an entry is drained, never destroyed: destroying one destroys the archive); gz is zlib.
The format comes from the bytes. Refused: absolute paths, `..`, drive letters, control and bidi
characters, overlong or deep paths, duplicate and case-fold-twin entries, encrypted entries,
overlapping zip entries, an expansion ratio above 200 (past 1 MiB), more entries or bytes than the
limits. Links and devices are skipped (or refused with `links: 'refuse'`), never created. Nested
archives stay files unless `limits.maxDepth` > 1. Each entry commits atomically; a refusal leaves the
entries already written.

## Defaults

| Area | Default |
|---|---|
| Transfer | 512 MiB · 10 min total · 30 s idle |
| HTTP | connect 10 s · headers 30 s · idle 30 s · 5 redirects · `Accept-Encoding: identity` |
| Probe | 1 MiB budget · 64 KiB head sample |
| Archives | 10 000 entries · 512 MiB per entry · 2 GiB total · ratio 200 · depth 1 |
| S3 | 8 MiB parts (≥ 5 MiB), 2 in flight; one PutObject when the body fits a part; aborted on failure |
| Workload | 12 MiB per file (`WORKLOAD_MAX_FILE_BYTES`), one retry, writes and reads |
| Workspace | `<os.tmpdir()>/owlmeans-workspace`, folders `0o700`, files `0o600` |
| S3 prefixes | ListObjectsV2 all pages; DeleteObjects ≤ 1000 keys, checksummed by Content-MD5 |

## Service

`appendFileStreamsService(ctx)` registers `file-streams`: `http()`, `transfer()`, `inspector()`,
`archives()`, `bucket(configKey)`, `workspace()` and `backed(configKey, { prefix? })` (one object per
key and prefix, over the configured workspace and transfer helper), built lazily from
`cfg.fileStreams` (`limits`, `network`, `proxies: [{ url, username?, password? }]`, `proxyStrategy`,
`userAgent`, `workspace: { root?, dirMode?, fileMode? }`) and `cfg.storageBuckets`. Proxy entries are
objects so a server context resolves their secret-file leaves; callbacks and plugins come through the
options argument. A server context reads EVERY string leaf starting with `/` as a file, so
`workspace.root` is given relative to `os.tmpdir()` (or as a file holding an absolute path).

## External docs

- https://github.com/thejoshwolfe/yauzl — central-directory zip reading, `fromRandomAccessReader` (override `read` and `_readStreamForRange`), `validateEntrySizes`, automatic `validateFileName` (v3)
- https://github.com/mafintosh/tar-stream — v3 ships streamx typings; destroying an entry destroys the extract, so entries are drained

## Tests

Category C. Offline specs (`fetch.spec.ts` for the pinned fetch and its import graph) run against local stand-ins (`tests/harness/`: an origin with Range,
redirects and stalls, a CONNECT/forward proxy, a SOCKS5 server, a fake Drive, a workload
`/command/` receiver answering `writeBinaryFile` and `readBinaryFile` with the real limits) and
code-built fixtures; `workspace.spec.ts` runs offline over a temporary root; `s3.spec.ts` and
`backed.spec.ts` need the S3 gate (path-style for a non-AWS endpoint, objects under a random base
prefix, deleted after); `live.spec.ts` needs `FILE_STREAMS_LIVE=1` (and `FILE_STREAMS_LIVE_DRIVE_URL`).

## Depends On

- `@owlmeans/file-inspector` (detection, re-exported), `@owlmeans/storage-resource` (the bucket
  model), `@owlmeans/storage-common` (errors, instances), `@owlmeans/context`, `@owlmeans/error`,
  `@owlmeans/log`
- `@aws-sdk/client-s3`, `socks`, `tar-stream`, `yauzl`, `yazl`

## Related

- [[file-inspector]] — what a file is: verdicts, policies, kinds, active PDF, safe names
- [[storage-resource]] — the upload resource and the bucket model
- [[storage-common]] — stored-file types and errors, `FileScope` and `fileScopeHelper`
- [[logging]] — scopes `file-streams:<area>`; URLs are logged redacted, contents never

## Parts

| Part | Load it when |
|---|---|
| [network](parts/network.md) | changing what may be reached, routing through proxies, returning redirects, handing a pinned `fetch` to fetch-based code, or downloading Google Drive and Docs links |
| [workspaces](parts/workspaces.md) | keeping files in a service tmp folder by scope, mirroring them to a bucket, restoring after a restart, listing or deleting a bucket prefix, or reading files back from a workload |
