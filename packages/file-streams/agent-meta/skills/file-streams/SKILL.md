---
name: file-streams
description: "How to use @owlmeans/file-streams — online files as Node streams: URL downloads under a connect-time SSRF policy (follow or return redirects, any status on request), a pinned WHATWG fetch on the aws-free ./fetch subpath, HTTP and SOCKS proxy plugins (a list or a callback by key and URL), the Google Drive resolver, S3 buckets addressed exactly like storage-resource (with prefix listing and removal), folders, buffers and Viable ephemeral workloads (writes and reads); scoped temporary workspaces nested by organization/project/purpose and mirrored to a bucket for restore after a restart; zip/tar/tar.gz/gz with traversal and bomb guards; file-type verification from a head or a few range reads. Auto-invoked when downloading a file, giving fetch-based code (llm-reader, a renderer) pinned egress, moving bytes between HTTP, S3, disk and a workload, keeping uploaded files in a service tmp folder backed by S3, extracting or packing an archive, checking that a file is what it claims, or configuring outbound proxies."
user-invocable: false
---
<!-- AUTO-GENERATED — do not edit. Regenerate via sync-agent-meta. -->

# @owlmeans/file-streams

**Layer:** Infra
**Install:** `"@owlmeans/file-streams": "^0.2.2-alpha.0"` in `dependencies`

Server-side (Node and Bun). Every byte moves as a Node `Readable` — the shape storage-resource's
`StoredRecord.stream`, the AWS SDK, zlib and the archive codecs share. `createStreamSource` takes a
web stream or an async iterable, `createBufferSource` a `Uint8Array`.

## Key Exports

| Export | What it is |
|---|---|
| `FileSource` / `FileSink` / `TreeSink` | Where bytes come from (`info`, `open`, `ranges`), where one file goes (`write`), where many go (`entry`, `directory`) |
| `httpClient` / `createHttpClient(opts)` | `request(url, opts)` under the network policy, through proxies, redirects and resolvers; `.source(url)` is re-openable and Range-capable |
| `createPinnedFetch(opts)` (also `@owlmeans/file-streams/fetch`) | A WHATWG `fetch` over the client; the subpath loads no AWS SDK |
| `createFileSource`, `createBufferSource`, `createStreamSource` | A file on disk, bytes in memory, a stream opened elsewhere (one-shot) |
| `createFileSink`, `createDirectorySink`, `createBufferSink` | Atomic file write, a confined directory tree, an in-memory collector (`bytes()`) |
| `createS3Bucket(entry or model, { partSize?, concurrency? })` | A `cfg.storageBuckets` entry as `source`, `sink`, `tree`, `head`, `remove`, `list`, `removePrefix`, `keyOf`, `urlOf`, `instanceOf`, `close` |
| `transferHelper` / `createTransferHelper({ inspector?, limits? })` | `.copy(source, sink, opts)` / `.copyInto(source, tree, opts)` — one file under limits, its head verified first |
| `archiveHelper` / `createArchiveHelper({ limits?, inspector? })` | `extract`, `list`, `pack`, `gzip`, `gunzip`, `detect` — the [archives](parts/archives.md) part |
| `createWorkspace`, `createBackedWorkspace`, `fileScopeHelper`, `FileScope` | Scoped tmp folders, mirrored to a bucket — the [workspaces](parts/workspaces.md) part |
| `makeWorkloadSink`, `makeWorkloadSource` | A Viable ephemeral workload — the [workload](parts/workload.md) part |
| `createNetworkPolicy`, `createProxyRouter`, `createHttpProxyPlugin`, `createSocksProxyPlugin`, `parseProxyEndpoint`, `createGoogleDriveResolver` / `googleDriveResolver` | What may be reached, proxies, Drive links — the [network](parts/network.md) part |
| `fileInspector`, `createFileInspector`, `FileKind`, the inspector tables and verdict types | Re-exported from `@owlmeans/file-inspector` |
| `appendFileStreamsService(ctx, alias?, opts?)` / `createFileStreamsService`, `FILE_STREAMS_SERVICE` | The objects configured from `cfg.fileStreams` and `cfg.storageBuckets` |
| `FileStreamsError` → `NetworkPolicyError` (`.refused === true`), `HttpError` (`.status`), `ProxyError`, `LimitError`, `SourceError`, `PathError`, `ArchiveError`, `ResolverError`, `WorkloadError` | Failures, by message code (`file-streams:<area>:<reason>`) |
| `FileMimicryError`, `FileKindError` (storage `FileTypeError`), `S3TransferError` (storage `StorageApiError`, `s3:<op>`) | Refusals and S3 failures a storage-resource catch site already handles |

## Usage

```typescript
import {
  archiveHelper, createBufferSource, createDirectorySink, createHttpClient, createS3Bucket, FileKind,
  fileInspector, httpClient, transferHelper,
} from '@owlmeans/file-streams'

// An image from the internet into a folder, refused unless it is an image
await transferHelper.copyInto(httpClient.source(url), createDirectorySink(workDir), { verify: { allow: [FileKind.Image] } })

// A screenshot (a Buffer) into the bucket a storage entry names — same key and URL storage-resource uses
const bucket = createS3Bucket(cfg.storageBuckets.media)
const { sink } = await transferHelper.copy(createBufferSource(png, { name: 'shot.png' }), bucket.sink(`shots/${id}.png`))
sink.url                                   // === storage-resource's URL for that prefix
bucket.instanceOf(sink, 'original')        // a storage-common StoredFileInstance

// An archive into a folder; entries are verified only when `verify` is given
await archiveHelper.extract(httpClient.source(archiveUrl), createDirectorySink(dir), { verify: {}, onEntryError: 'skip' })

// What a remote file is, without downloading it (a few range reads, at most 1 MiB)
const verdict = await fileInspector.probe(httpClient.source(url))

// Proxies: a list (round-robin, random, failover, by-key) or a callback by key and URL
const pooled = createHttpClient({ proxies: { proxies: ['socks5://u:p@egress-1:1080', 'http://egress-2:3128'], strategy: 'by-key' } })
const vaulted = createHttpClient({ proxies: { proxies: async ({ key, url }) => vault.proxyFor(key, url.hostname) } })
await pooled.request(url, { proxyKey: tenantKey })
```

`copy` reads the head of the very stream it moves (no second download), verifies it, and replays
it into the sink. Verification is on by default (`verify: {}`): a kind mismatch is refused,
dangerous content (an executable under another claim, a script under a passive one, a PDF with
active content in the head sample) is always refused, `verify.refuse` refuses kinds outright, an
inconclusive verdict passes unless `refuseInconclusive`; `verify: false` turns it off. A declared
size above `limits.maxBytes` is refused before the first byte, counted bytes after it. `info`
overrides the source's claims; `copyInto` writes under the source's sanitized name, or `download`.

## The pinned fetch

`createPinnedFetch(opts)` from `@owlmeans/file-streams/fetch` (no AWS SDK, storage-resource or S3
module in its graph) is `fetch` over the client — any status a `Response`, `redirect: 'manual'` the
3xx itself, GET/HEAD only, bodies streamed, policy refusals `NetworkPolicyError` (`refused === true`).
Rules: the [network](parts/network.md) part.

## Workspaces and workloads

`createWorkspace().scope({ organization, project?, purpose })` is the confined folder
`<root>/<organization>/<project?>/<purpose>`; a backed workspace mirrors it to the same nesting in a
bucket, which `restore()` reads back after a pod restart — the [workspaces](parts/workspaces.md)
part. A Viable workload takes and gives files of at most 12 MiB — the [workload](parts/workload.md) part.

## Detection

Verification is `@owlmeans/file-inspector` (its `file-inspector` skill), re-exported unchanged
except `fileNameHelper`, `TEXT_CARRIED_KINDS` and the `ProbeSource` types — import those from it.
Every `FileSource` is a `ProbeSource` as is: a probe seeks through `ranges()` when the origin has
them and reads the head of `open()` otherwise. The S3 sink takes the Content-Type from the verdict
and writes `attachment` for active svg/html (unless `allowActiveInline`).

## Defaults

| Area | Default |
|---|---|
| Transfer | 512 MiB · 10 min total · 30 s idle |
| HTTP | connect 10 s · headers 30 s · idle 30 s · 5 redirects · `Accept-Encoding: identity` · User-Agent `owlmeans-file-streams` |
| Proxies | round-robin · 1 retry on another proxy · 30 s cooldown |
| Probe | 1 MiB budget · 64 KiB head sample |
| S3 | 8 MiB parts (≥ 5 MiB), 2 in flight; one PutObject when the body fits a part; aborted on failure |
| Workload | 12 MiB per file (`WORKLOAD_MAX_FILE_BYTES`), one retry |
| Workspace | `<os.tmpdir()>/owlmeans-workspace`, folders `0o700`, files `0o600` |

## Service

`appendFileStreamsService(ctx)` registers `file-streams`: `http()`, `transfer()`, `inspector()`,
`archives()`, `bucket(configKey)`, `workspace()` and `backed(configKey, { prefix? })` (one object per
key and prefix), built lazily from `cfg.fileStreams` (`limits` — transfers only, `network`,
`proxies: [{ url, username?, password?, id? }]`, `proxyStrategy`, `userAgent`, `workspace`) and
`cfg.storageBuckets` (an unknown key → `FilePropertyError('storage-config:<key>')`). Proxy entries
are objects so a server context resolves their secret-file leaves; callbacks, plugins, resolvers, a
DNS `resolver`, `bucketOptions`, `inspector` and `archiveLimits` come through the options argument.
A server context reads EVERY string leaf starting with `/` as a file, so `workspace.root` is given
relative to `os.tmpdir()`. Timeouts, redirects, headers and CAs need your own `createHttpClient`.

## Pitfalls

- Loopback and in-cluster origins are refused by default: give `network: { allowCidrs }` (tests:
  `'127.0.0.1/32'`) or `allowPrivate`.
- `createStreamSource` is one-shot: a probe or `archiveHelper.detect` consumes it — verify through
  `copy`'s `verify` instead.
- `archiveHelper.extract` verifies nothing unless `verify` is passed; `transferHelper` verifies by
  default.
- Passing `resolvers` replaces the default `[googleDriveResolver]`; keep it when you add your own.
- A `socks5h`/`socks4a` endpoint resolves names at the proxy, so its connect is not pinned.
- storage-resource's default ACL is `public-read`: private files need a bucket entry with `acl: false`.

## Tests

`bun test ./tests` in `@owlmeans/file-streams` (category C; build first). Offline specs use local
stand-ins; S3 and live specs are gated — the [extending](parts/extending.md) part.

## Depends On

- `@owlmeans/file-inspector` (detection, re-exported), `@owlmeans/storage-resource` (the bucket
  model), `@owlmeans/storage-common` (errors, instances, scopes), `@owlmeans/context`,
  `@owlmeans/error`, `@owlmeans/log`
- `@aws-sdk/client-s3`, `socks`, `tar-stream`, `yauzl`, `yazl`

## Related

- [[file-inspector]] (`@owlmeans/file-inspector`) — verdicts, policies, kinds, active PDF, safe names
- [[storage-resource]] (`@owlmeans/storage-resource`) — the upload resource and the bucket model
- [[storage-common]] (`@owlmeans/storage-common`) — stored-file types and errors, `FileScope`
- [[server-upload]] (`@owlmeans/server-upload`) — multi-file uploads over these objects
- [[upload]] (`@owlmeans/upload`) — the upload contract; its path rules match this package's
- [[llm-reader]] (`@owlmeans/llm-reader`) — takes the pinned fetch as its transport
- [[logging]] — scopes `file-streams:<area>`; URLs logged redacted, contents and proxy secrets never

## Parts

| Part | Load it when |
|---|---|
| [network](parts/network.md) | changing what may be reached, routing through proxies, returning redirects, handing a pinned `fetch` to fetch-based code, or downloading Google Drive and Docs links |
| [archives](parts/archives.md) | extracting, listing, packing or (de)compressing zip, tar, tar.gz or gz, or tuning archive limits |
| [workspaces](parts/workspaces.md) | keeping files in a service tmp folder by scope, mirroring them to a bucket, restoring after a restart, or listing or deleting a bucket prefix |
| [workload](parts/workload.md) | writing files into a Viable ephemeral workload or reading them back |
| [extending](parts/extending.md) | writing your own source, sink, tree sink, proxy plugin or URL resolver, changing this package, or running and adding its tests |
