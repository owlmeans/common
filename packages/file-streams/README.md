# @owlmeans/file-streams

Moves files as Node streams on OwlMeans servers and agents (Node and Bun). Bytes come from URLs, S3
objects, files, memory, foreign streams or a Viable workload, and go to files, folders, S3, memory
or a workload. Every outbound connection is pinned to an address the network policy checked a moment
before, every transfer runs under byte and time limits, and every file can be verified from its head
before the first byte lands.

- **Sources** — a URL (under a connect-time SSRF policy, through HTTP/SOCKS proxy plugins, Google
  Drive and Docs links resolved), an S3 object, a file, bytes in memory, a foreign stream (Node, web
  or async iterable), a Viable workload file.
- **Sinks** — an atomic file, a confined directory tree, an S3 object or prefix (addressed exactly
  like `@owlmeans/storage-resource`), a buffer, a Viable ephemeral workload.
- **Transfers** — one file from a source to a sink under size, time and idle limits, its head
  verified by `@owlmeans/file-inspector` before the sink sees a byte; progress and SHA-256 on request.
- **Archives** — zip, tar, tar.gz and gz: detect, list, extract, pack, with traversal, link, bomb,
  overlap and duplicate guards.
- **Workspaces** — a service's temporary files, one confined folder per organization / project /
  purpose, optionally mirrored to an S3 prefix so a restarted pod restores them; whole S3 prefixes
  listed and deleted.
- **Pinned fetch** — `@owlmeans/file-streams/fetch` (no AWS SDK in its graph): a WHATWG `fetch`
  over the same client, for code written against `fetch` (`@owlmeans/llm-reader`, a renderer).
- **Verification** — the `@owlmeans/file-inspector` inspector, kinds, tables and refusals are
  re-exported; every source here is a probe source as it is.
- **Context service** — `appendFileStreamsService` builds all of the above from `cfg.fileStreams`
  and `cfg.storageBuckets`.

## Installation

```bash
bun add @owlmeans/file-streams@^0.2.4-rc.0
```

No peer dependencies. `@aws-sdk/client-s3`, `socks`, `tar-stream`, `yauzl` and `yazl` are regular
dependencies. The `@owlmeans/file-streams/fetch` subpath never loads the AWS SDK,
`@owlmeans/storage-resource` or the S3 modules.

## Quick start

```typescript
import { createDirectorySink, createS3Bucket, FileKind, fileInspector, httpClient, transferHelper } from '@owlmeans/file-streams'

// Download an image into a folder: refused before a byte is written unless it is an image
await transferHelper.copyInto(httpClient.source('https://example.com/hero.png'), createDirectorySink('/work/assets'), {
  verify: { allow: [FileKind.Image] },
})

// Check a remote file without downloading it (a few range reads, at most 1 MiB)
const verdict = await fileInspector.probe(httpClient.source('https://example.com/report.pdf'))
verdict.status        // 'match' | 'mismatch' | 'inconclusive'
verdict.detected      // { ext: 'pdf', mime: 'application/pdf', kind: 'pdf', … }

// Store it in the bucket a cfg.storageBuckets entry names
const bucket = createS3Bucket(cfg.storageBuckets.media)
const { sink } = await transferHelper.copy(httpClient.source('https://example.com/report.pdf'), bucket.sink('reports/q3.pdf'))
sink.url              // the same public URL storage-resource answers for that prefix
```

## Usage

### Sources and sinks

```typescript
import {
  createBufferSink, createBufferSource, createFileSink, createFileSource, createStreamSource, transferHelper,
} from '@owlmeans/file-streams'

const file = createFileSource('/spool/upload-17', { name: 'scan.pdf' })   // re-openable, random access
const shot = createBufferSource(png, { name: 'shot.png', mime: 'image/png' }) // re-openable, random access
const piped = createStreamSource(response.body, { name: 'feed.csv' })       // one-shot, no random access

await transferHelper.copy(file, createFileSink('/data/scan.pdf', { onConflict: 'overwrite' }))
const memory = createBufferSink({ maxBytes: 8 * 1024 * 1024 })
await transferHelper.copy(shot, memory)
memory.bytes()
```

A `FileSource` answers `info()` (cached metadata), `open({ range? })` (a fresh Node `Readable`) and
`ranges()` (random access over one immutable version, or `null`). A `FileSink` writes one stream
and commits atomically. A `TreeSink` hands out the sink of each entry under one root.

### Transfers

```typescript
import { createFileSink, FileKind, httpClient, transferHelper } from '@owlmeans/file-streams'

const result = await transferHelper.copy(httpClient.source(url), createFileSink('/data/report.pdf'), {
  verify: { allow: [FileKind.Pdf] },               // default {}: mismatches refused; false skips it
  limits: { maxBytes: 50 * 1024 * 1024, timeoutMs: 120_000, idleTimeoutMs: 15_000 },
  hash: 'sha256',
  onProgress: ({ bytes, total, elapsedMs }) => report(bytes, total, elapsedMs),
  info: { name: 'report.pdf' },                     // overrides the source's claims
})
result.bytes          // counted bytes
result.sha256         // hex digest
result.verdict        // the head's verdict
result.sink           // { kind, location, bytes, url?, etag?, mime? }
```

`copy` reads the head of the very stream it moves, verifies it and replays it into the sink: there
is no second download. `copyInto(source, tree)` writes under the source's sanitized name, or
`download` when nothing names it.

### HTTP client

```typescript
import { createHttpClient } from '@owlmeans/file-streams'

const client = createHttpClient({
  network: { allowHosts: ['*.example.com'], ports: [443] },
  timeouts: { connectMs: 5_000 },
  maxRedirects: 3,
  headers: { authorization: `Bearer ${token}` },    // dropped on a cross-origin redirect
  sensitiveHeaders: ['x-api-key'],
})

const page = await client.request('https://api.example.com/missing', { anyStatus: true })   // a 404 is an answer
const hop = await client.request(url, { redirect: 'manual' })    // a 3xx comes back with its Location
const source = client.source(url, { name: 'export.csv' })       // Range-capable when the server answers 206
```

Without `anyStatus`, a non-2xx answer throws `HttpError('status:<code>')`, and `error.status` reads
the code back.

### Pinned fetch

```typescript
import { createPinnedFetch } from '@owlmeans/file-streams/fetch'

const pinnedFetch = createPinnedFetch({ network: { denyHosts: ['*.corp.example'] }, userAgent: 'my-reader' })
const response = await pinnedFetch('https://example.com/article', { headers: { accept: 'text/html' } })
const html = await response.text()
const hop = await pinnedFetch(url, { redirect: 'manual' })   // the 3xx itself, Location included
```

Any status is a `Response`, with `url` and `redirected` set. Only GET and HEAD are carried; another
method or a request body rejects with `HttpError`. A policy refusal rejects with
`NetworkPolicyError`, whose `refused === true` tells it apart from a network failure.

### Proxies

```typescript
import { createHttpClient } from '@owlmeans/file-streams'

// A list: round-robin (default), random, failover or by-key
const pooled = createHttpClient({
  proxies: { proxies: ['socks5://u:p@egress-1:1080', 'http://egress-2:3128'], strategy: 'by-key', bypass: ['*.example.org'] },
})
await pooled.request(url, { proxyKey: tenantKey })

// A callback by key and URL; credentials looked up for endpoints that carry none
const provided = createHttpClient({
  proxies: {
    proxies: async ({ key, url }) => await egress.proxyFor(key, url.hostname),
    credentials: async (endpoint, { key }) => await egress.credentialsFor(endpoint.host, key),
  },
})
```

Built-in plugins speak `http`/`https` (CONNECT tunnels; plain-http targets forwarded in absolute
form unless `createHttpProxyPlugin({ httpTargets: 'connect' })`) and `socks4`/`socks4a`/`socks5`/
`socks5h`. A failed proxy cools down for 30 s and the next one is tried once.

### Google Drive and Docs

```typescript
import { createGoogleDriveResolver, createHttpClient, httpClient } from '@owlmeans/file-streams'

// On by default: a share link downloads the file behind it, through the virus-scan page if needed
const response = await httpClient.request('https://drive.google.com/file/d/<file-id>/view?usp=sharing')

// Editor files export as docx, xlsx, pptx and png by default
const exporting = createHttpClient({ resolvers: [createGoogleDriveResolver({ exports: { document: 'pdf', spreadsheet: 'csv' } })] })
```

`resolvers: []` turns resolving off; a list you pass replaces the default one.

### S3 buckets

```typescript
import { createBufferSource, createS3Bucket, transferHelper } from '@owlmeans/file-streams'

const bucket = createS3Bucket(cfg.storageBuckets.media, { partSize: 16 * 1024 * 1024, concurrency: 4 })
const { sink } = await transferHelper.copy(
  createBufferSource(png, { name: 'shot.png' }), bucket.sink(`shots/${id}.png`, { cacheControl: 'public, max-age=86400' })
)
bucket.instanceOf(sink, 'original')     // a storage-common StoredFileInstance
await bucket.head(`shots/${id}.png`)    // { key, size, etag, mime, modifiedAt } or null
await bucket.list('shots')              // [{ key, path, size, etag, modifiedAt }, …]
await bucket.removePrefix('shots')      // how many objects went
bucket.close()
```

A prefix lands at `<basePrefix>/<prefix>` and answers on the same public URL as
`@owlmeans/storage-resource`. A body that fits one part is one PutObject; a larger one is a
multipart upload, aborted on failure.

### Archives

```typescript
import {
  ArchiveFormat, archiveHelper, createDirectorySink, createFileSource, FileKind, httpClient, transferHelper,
} from '@owlmeans/file-streams'

const result = await archiveHelper.extract(httpClient.source(zipUrl), createDirectorySink('/work/unpacked'), {
  verify: { refuse: [FileKind.Executable] },   // entries are verified only when verify is given
  onEntryError: 'skip',                        // a write or verification failure skips the entry
  strip: 1,
  limits: { maxEntries: 500, maxTotalBytes: 256 * 1024 * 1024 },
})
result.format         // ArchiveFormat.Zip
result.extracted      // [{ entry, path, result }, …]
result.skipped        // [{ entry, reason }, …]

const entries = await archiveHelper.list(createFileSource('/spool/bundle.tar.gz'))
const packed = archiveHelper.pack(ArchiveFormat.Zip, [
  { path: 'report.pdf', source: createFileSource('/data/report.pdf') },
  { path: 'notes.txt', source: new TextEncoder().encode('hello') },
], { name: 'bundle.zip' })
await transferHelper.copy(packed, bucket.sink('exports/bundle.zip'))
```

The format comes from the bytes. A zip is read from its central directory, through range reads when
the source has them and from a private temporary spool otherwise.

### Workspaces

```typescript
import { createBackedWorkspace, createBufferSource, createS3Bucket, createWorkspace } from '@owlmeans/file-streams'

const workspace = createWorkspace()                       // <os.tmpdir()>/owlmeans-workspace
const local = workspace.scope({ organization: entitySlug, project: 'slot-12', purpose: 'new-project' })
await local.list()                                        // [{ path, size, modifiedAt }, …]
await workspace.prune({ olderThanMs: 24 * 3600_000 })     // whole scopes untouched for a day

// Mirrored to a bucket under the same nesting
const backed = createBackedWorkspace({ workspace, bucket: createS3Bucket(cfg.storageBuckets.projects), prefix: 'materials' })
const files = backed.scope({ organization: entitySlug, project: 'slot-12', purpose: 'new-project' })
await files.put('brand/logo.png', createBufferSource(png, { name: 'logo.png' }))
await files.restore()   // after a restart: download what the tmp folder lost
await files.drop()      // the folder and every object under the scope's prefix
```

### Viable workloads

```typescript
import { archiveHelper, FileKind, httpClient, makeWorkloadSink, makeWorkloadSource, transferHelper } from '@owlmeans/file-streams'

const media = makeWorkloadSink(fileHelper, { root: 'public/media' })   // a WorkloadWriter: writeBinaryFile(filePath, base64)
await transferHelper.copy(httpClient.source(imageUrl), media.entry('hero.png'), { verify: { allow: [FileKind.Image] } })
await archiveHelper.extract(httpClient.source(zipUrl), media, { onEntryError: 'skip' })

const materials = makeWorkloadSource(fileHelper, { root: 'docs/materials' })  // a WorkloadReader: readBinaryFile(filePath)
await transferHelper.copy(materials.entry('logo.png'), local.entry('logo.png'))
```

Each file is one atomic write or read of at most 12 MiB (`WORKLOAD_MAX_FILE_BYTES`), retried once.

### Context service

```typescript
import { appendFileStreamsService, FILE_STREAMS_SERVICE } from '@owlmeans/file-streams'
import type { FileStreamsService } from '@owlmeans/file-streams'

appendFileStreamsService(context, FILE_STREAMS_SERVICE, { proxyCredentials: async endpoint => await egress.credentialsFor(endpoint.host) })
const files = context.service<FileStreamsService>(FILE_STREAMS_SERVICE)
await files.transfer().copy(files.http().source(url), files.bucket('media').sink('imports/a.png'))
const scope = files.backed('projects', { prefix: 'materials' }).scope({ organization: entitySlug, purpose: 'upload' })
```

Objects are built lazily, once, from `cfg.fileStreams` and `cfg.storageBuckets`. An unknown storage
key throws `FilePropertyError('storage-config:<key>')`.

## API

Main entry `@owlmeans/file-streams`:

| Export | What it is |
|---|---|
| `httpClient` / `createHttpClient(options?)` | `request(url, options?)` → `HttpResponse`; `source(url, options?)` → a re-openable, Range-capable `FileSource` |
| `createPinnedFetch(options?)` | A WHATWG `fetch` over the client (also on `./fetch`) |
| `networkPolicy` / `createNetworkPolicy(options?)` | `assertUrl(url, from?)`, `resolve(hostname)`, `allowsAddress(address)`, `trustProxyDns` |
| `createProxyRouter(options?)` | Picks a proxy per connection: `select(request)`, `report(endpoint, ok)`, `retries` |
| `createHttpProxyPlugin(options?)` / `httpProxyPlugin` | The `http`/`https` proxy plugin (CONNECT and forward mode) |
| `createSocksProxyPlugin(options?)` / `socksProxyPlugin` | The `socks4`/`socks4a`/`socks5`/`socks5h` proxy plugin |
| `parseProxyEndpoint(value)` | A proxy URL (`socks5h://user:pass@host:1080`) as a `ProxyEndpoint` |
| `googleDriveResolver` / `createGoogleDriveResolver(options?)` | Drive share links and Docs, Sheets, Slides, Drawings exports as a `UrlResolver` |
| `transferHelper` / `createTransferHelper(options?)` | `copy(source, sink, options?)`, `copyInto(source, tree, options?)` |
| `archiveHelper` / `createArchiveHelper(options?)` | `detect`, `list`, `extract`, `pack`, `gzip`, `gunzip` |
| `createS3Bucket(config, options?)` | A storage entry or bucket model as `source`, `sink`, `tree`, `head`, `remove`, `list`, `removePrefix`, `keyOf`, `urlOf`, `instanceOf`, `close`, `model` |
| `createFileSource(path, claims?)` | A regular file: re-openable, random access, `<mtimeMs>-<size>` validator |
| `createBufferSource(bytes, claims?)` | Bytes in memory: re-openable, random access |
| `createStreamSource(input, claims?)` | A Node, web or async-iterable stream: one-shot, no random access |
| `createFileSink(path, options?)` | One file written to a private temporary file and committed atomically |
| `createDirectorySink(root, options?)` | A `TreeSink` confined to `root`: no traversal, no symlinked parents, no duplicates |
| `createBufferSink(options?)` | Collects one file in memory (64 MiB default ceiling); `bytes()` |
| `makeWorkloadSink(writer, options?)` | A Viable workload folder as a `TreeSink` through `writeBinaryFile` |
| `makeWorkloadSource(reader, options?)` | Viable workload files as sources through `readBinaryFile`: `entry(path, claims?)` |
| `createWorkspace(options?)` | Scoped temporary folders: `scope`, `scopes`, `prune`, `root` |
| `createBackedWorkspace(options)` | Scopes mirrored to a bucket: `scope(value)` → `put`, `restore`, `list`, `remove`, `evict`, `drop`, `key`, `prefixOf`, `local` |
| `createFileStreamsService(alias?, options?)` | The context service object |
| `appendFileStreamsService(ctx, alias?, options?)` | Registers the service (alias `file-streams`) |
| `FILE_STREAMS_SERVICE` | `'file-streams'` |
| `FileStreamsError` | Base `ResilientError`, `file-streams:<area>:<reason>` |
| `NetworkPolicyError` | `policy:<reason>` — `scheme`, `credentials`, `downgrade`, `blocked-host`, `port`, `unresolvable`, `blocked-address`; `refused === true` |
| `HttpError` | `http:<reason>` — `status:<code>` (`.status`), `redirects`, `location`, `connect`, `connect-timeout`, `tls:<code>`, `tls-timeout`, `headers-timeout`, `truncated`, `encoding`, `request`, `method:<m>`, `body`, `redirect` |
| `ProxyError` | `proxy:<reason>` — `no-plugin`, `endpoint`, `connect`, `handshake`, `auth-failed`, `refused:<code>` |
| `LimitError` | `limit:<reason>` — `max-bytes`, `timeout`, `idle-timeout`, `entries`, `entry-bytes`, `total-bytes`, `ratio`, `s3-parts` |
| `SourceError` | `source:<reason>` — `consumed`, `changed`, `not-found`, `not-a-file`, `range-unsupported` |
| `PathError` | `path:<reason>` — `absolute`, `traversal`, `invalid-char`, `too-long`, `too-deep`, `empty`, `symlink`, `exists`, `duplicate`, `reserved`, `scope-overlap` |
| `ArchiveError` | `archive:<reason>` — `format`, `corrupt`, `encrypted`, `link`, `overlap`, `method:<n>`, `gzip-entries` |
| `ResolverError` | `resolver:<name>:<reason>` — `folder`, `not-public`, `quota`, `export-too-large`, `foreign-form`, `foreign-follow`, `steps`, `unrecognized` |
| `WorkloadError` | `workload:<reason>` — `too-large`, `write-failed`, `read-failed` |
| `S3TransferError` | A storage `StorageApiError`: `s3:<op>` — `head`, `get`, `put`, `multipart`, `delete`, `list`, `delete-objects:<code>` |
| `ArchiveFormat` | `zip`, `tar`, `tar.gz`, `gz` |
| `DEFAULT_ARCHIVE_LIMITS` / `RATIO_FLOOR_BYTES` / `ZIP_LOCAL_HEADER_BYTES` / `NESTED_ARCHIVE_EXTENSIONS` | Archive limits; ratios judged past 1 MiB; zip local header size; names that mark a nested archive |
| `DENIED_IPV4_CIDRS` / `DENIED_IPV6_CIDRS` / `DENIED_HOST_SUFFIXES` / `DEFAULT_SCHEMES` | What the default policy refuses; `https:`, `http:` |
| `GOOGLE_DRIVE_RESOLVER` / `DEFAULT_GOOGLE_ORIGINS` / `DEFAULT_EXPORT_FORMATS` / `DRIVE_ID_PATTERN` / `MAX_DRIVE_STEPS` / `DEFAULT_DRIVE_PAGE_BYTES` | The Drive resolver's name, origins, export formats, id shape, 3 steps, 256 KiB page read |
| `DEFAULT_PART_SIZE` / `MIN_PART_SIZE` / `MAX_PARTS` / `DEFAULT_UPLOAD_CONCURRENCY` / `S3_DELETE_BATCH_SIZE` | 8 MiB, 5 MiB, 10 000, 2, 1000 |
| `WORKLOAD_MAX_BASE64_CHARS` / `WORKLOAD_MAX_FILE_BYTES` | 16 MiB of base64; 12 MiB per file |
| `DEFAULT_TRANSFER_LIMITS` / `FALLBACK_FILE_NAME` | 512 MiB, 10 min, 30 s idle; `download` |
| `DEFAULT_WORKSPACE_DIR` / `WORKSPACE_SCOPE_MARKER` / `DEFAULT_WORKSPACE_DIR_MODE` / `DEFAULT_WORKSPACE_FILE_MODE` | `owlmeans-workspace`, `.owlmeans-scope`, `0o700`, `0o600` |
| `fileInspector` / `createFileInspector` / `FileKind` / `FileMimicryError` / `FileKindError` | Re-exported from `@owlmeans/file-inspector` |
| `EXTENSION_MIME`, `KIND_BY_MIME`, `KIND_BY_MIME_PREFIX`, `MIME_ALIASES`, `NON_INFORMATIVE_MIMES`, `CODE_LANGUAGE_BY_EXT`, `SHEBANG_LANGUAGES`, `TEXT_FAMILY`, `PASSIVE_KINDS`, `OFFICE_KINDS`, `EXTENSION_GROUPS`, `CONTAINER_EXTENSIONS`, `DEFAULT_PROBE_BYTES`, `DEFAULT_SAMPLE_BYTES`, `PDF_TRAILER_BYTES` | Re-exported `@owlmeans/file-inspector` tables and defaults |
| `fileScopeHelper` / `FileScopeSchema` / `FileScopeError` | Re-exported from `@owlmeans/storage-common`: the `<organization>/<project?>/<purpose>` nesting |
| Types: sources and sinks | `FileSource`, `FileSink`, `TreeSink`, `FileInfo`, `ByteRange`, `SignalOptions`, `OpenOptions`, `OpenedFile`, `RangeReader`, `SinkInput`, `SinkWriteOptions`, `SinkResult`, `SourceClaims`, `StreamInput`, `ConflictPolicy`, `FileSinkOptions`, `DirectorySinkOptions`, `BufferSinkOptions`, `BufferSink` |
| Types: HTTP and fetch | `HttpClient`, `HttpClientOptions`, `HttpTimeouts`, `HttpMethod`, `HttpRedirectMode`, `HttpRequestOptions`, `HttpResponse`, `HttpSourceOptions`, `PinnedFetch`, `PinnedFetchOptions` |
| Types: network and proxies | `NetworkPolicy`, `NetworkPolicyOptions`, `AddressResolver`, `ResolvedAddress`, `ProxyEndpoint`, `ProxyCredentials`, `ProxyRequest`, `ProxyProvider`, `ProxyCredentialsProvider`, `ProxyStrategy`, `ProxyRouterOptions`, `ProxySelection`, `ProxyRouter`, `TunnelTarget`, `ProxyConnectContext`, `ProxyConnection`, `ProxyPlugin`, `HttpProxyPluginOptions`, `SocksProxyPluginOptions` |
| Types: resolvers | `UrlResolver`, `ResolverStep`, `ResolverAccept`, `ResolverFollow`, `ResolverFail`, `ResolverResponseHead`, `ResolverBodyReader`, `GoogleDriveResolverOptions`, `GoogleExportFormats`, `GoogleDriveOrigins` |
| Types: transfers and archives | `TransferHelper`, `TransferHelperOptions`, `TransferOptions`, `TransferLimits`, `TransferProgress`, `TransferProgressListener`, `TransferResult`, `ArchiveHelper`, `ArchiveHelperOptions`, `ArchiveLimits`, `ArchiveEntryType`, `ArchiveEntryInfo`, `ArchiveListOptions`, `ArchiveExtractOptions`, `ArchivePackOptions`, `ExtractedEntry`, `SkippedEntry`, `ExtractResult`, `PackEntry` |
| Types: S3 and workloads | `S3Bucket`, `S3BucketOptions`, `S3SinkOptions`, `S3ObjectInfo`, `S3ListedObject`, `WorkloadWriter`, `WorkloadSinkOptions`, `WorkloadReader`, `WorkloadSourceOptions`, `WorkloadSource` |
| Types: workspaces | `Workspace`, `WorkspaceOptions`, `WorkspaceScope`, `WorkspaceFile`, `WorkspaceWriteOptions`, `WorkspacePruneOptions`, `BackedWorkspace`, `BackedWorkspaceOptions`, `BackedScope`, `BackedPutOptions`, `BackedPutResult`, `BackedRestoreResult`, `FileScope`, `FileScopeHelper` |
| Types: service | `FileStreamsService`, `FileStreamsServiceOptions`, `FileStreamsConfig`, `FileStreamsConfigAppend`, `FileStreamsProxyConfig`, `FileStreamsBackedOptions` |
| Types: verification | `FileVerdict`, `VerdictStatus`, `DeclaredType`, `DetectedType`, `FileDetails`, `FileClaims`, `VerifyPolicy`, `ProbeOptions`, `InspectOptions`, `FileInspector`, `FileInspectorOptions` (from `@owlmeans/file-inspector`) |

Subpath `@owlmeans/file-streams/fetch`:

| Export | What it is |
|---|---|
| `createPinnedFetch(options?)` | The pinned WHATWG `fetch` |
| `createHttpClient(options?)` | The HTTP client it runs on |
| `createNetworkPolicy(options?)` | The policy |
| `createGoogleDriveResolver(options?)` / `googleDriveResolver` | The Drive resolver |
| `HttpError` / `NetworkPolicyError` / `ProxyError` / `ResolverError` | The errors a fetch rejects with |
| Types | `PinnedFetch`, `PinnedFetchOptions`, `HttpClient`, `HttpClientOptions`, `HttpTimeouts`, `NetworkPolicy`, `NetworkPolicyOptions`, `AddressResolver`, `ResolvedAddress`, `ProxyRouter`, `ProxyRouterOptions`, `UrlResolver`, `GoogleDriveResolverOptions` |

## Configuration

### `cfg.fileStreams`

```typescript
import type { FileStreamsConfig } from '@owlmeans/file-streams'

const fileStreams: FileStreamsConfig = {
  limits: { maxBytes: 128 * 1024 * 1024 },                        // transfers
  network: { allowCidrs: ['10.20.0.0/16'] },                      // NetworkPolicyOptions without resolver
  proxies: [{ url: 'socks5://egress:1080', username: 'svc', password: '/run/secrets/egress-password' }],
  proxyStrategy: 'failover',
  userAgent: 'my-service',
  workspace: { root: 'my-service-workspace' },                    // relative to os.tmpdir()
}
```

A server context reads every string leaf that starts with `/` as a file, which is why proxies are
objects (their secrets can be mounted files) and why `workspace.root` is given relative to
`os.tmpdir()`. Callbacks, plugins and other non-config objects go through the service options:
`proxies` (replaces the configured list), `proxyCredentials`, `proxyPlugins`, `resolvers`,
`resolver` (DNS), `bucketOptions`, `inspector`, `archiveLimits`. Buckets come from
`cfg.storageBuckets` entries, read exactly as `@owlmeans/storage-resource` reads them.

### Network policy (`NetworkPolicyOptions`)

| Option | Default | Effect |
|---|---|---|
| `schemes` | `['https:', 'http:']` | URL schemes allowed |
| `allowPrivate` | `false` | Allow loopback, private, link-local, CGNAT, multicast, reserved ranges and internal names |
| `allowCidrs` | none | Allowed even inside the denied ranges (`'127.0.0.1/32'` for a local stand-in) |
| `denyCidrs` | none | Extra ranges to deny |
| `allowHosts` | any | Only these hosts (`x.com`, `*.x.com`); an internal name listed here is allowed |
| `denyHosts` | none | Hosts never reached |
| `ports` | any | Ports allowed |
| `allowDowngrade` | `false` | Follow an https → http redirect |
| `allowUrlCredentials` | `false` | Accept `user:pass@` in URLs |
| `trustProxyDns` | `false` | Accept a name the local resolver cannot resolve when a remote-DNS proxy will |
| `resolver` | `dns.lookup` (all addresses) | Your own resolver; it must answer every address of the name |

`allowCidrs` wins over `denyCidrs`, which wins over `allowPrivate`.

### HTTP client (`HttpClientOptions`)

| Option | Default |
|---|---|
| `network` | The default policy (a `NetworkPolicy` or its options) |
| `proxies` | None: direct connections (a `ProxyRouter` or its options) |
| `resolvers` | `[googleDriveResolver]`; `[]` turns resolving off |
| `timeouts` | `connectMs` 10 000 · `headersMs` 30 000 · `idleMs` 30 000 |
| `maxRedirects` | 5 |
| `userAgent` | `owlmeans-file-streams` |
| `headers` | Sent with every request; `Accept-Encoding` defaults to `identity` |
| `sensitiveHeaders` | Dropped on a cross-origin redirect, beside `authorization`, `cookie`, `proxy-authorization` |
| `ca` | Extra CAs; certificate verification is never turned off |

### Proxies (`ProxyRouterOptions`)

`proxies` (endpoints, proxy URLs or a provider callback), `credentials`, `strategy`
(`round-robin` default, `random`, `failover`, `by-key`), `bypass` (hosts never proxied), `plugins`
(tried before the built-in ones), `retries` (1), `cooldownMs` (30 000).

### Limits and defaults

| Area | Default |
|---|---|
| Transfer | 512 MiB · 10 min total · 30 s idle · progress every 250 ms |
| Probe | 1 MiB budget · 64 KiB head sample |
| Archives | 10 000 entries · 512 MiB per entry · 2 GiB total · ratio 200 (judged past 1 MiB) · depth 1 · paths ≤ 1024 bytes and 64 segments |
| Tar packing | Sources without a size spooled up to 512 MiB (`maxSpoolBytes`) |
| S3 | 8 MiB parts (at least 5 MiB), 2 in flight, at most 10 000 parts; DeleteObjects batches of 1000 |
| Buffer sink | 64 MiB |
| Workload | 12 MiB per file · one retry |
| Workspace | `<os.tmpdir()>/owlmeans-workspace` · folders `0o700` · files `0o600` |
| File and directory sinks | Files `0o644` · folders `0o755` · `onConflict: 'error'` |
| Google Drive | 3 follow-up steps · 256 KiB of an interstitial page read |

## Security and limits

- **SSRF pinning.** A URL is checked before any DNS: scheme, credentials in the URL, host patterns,
  port and https → http downgrade. Its name is then resolved, and every address must pass: one
  refused address refuses the name. The socket connects to an address from that check, so a second
  lookup cannot rebind the name. A proxied connection carries the checked address into the CONNECT
  or SOCKS request. TLS keeps the host name for SNI and certificate checks.
- **Denied by default.** Loopback, private, link-local, CGNAT, benchmarking, documentation,
  multicast and reserved IPv4 and IPv6 ranges. The IPv4 inside a mapped, NAT64, 6to4, Teredo or
  IPv4-compatible IPv6 address is checked too. Internal names (`localhost`, `.localhost`, `.local`,
  `.internal`, `.svc`, `.cluster.local`, `.home.arpa`, `.lan`, `.intranet`) are refused before DNS.
- **Where pinning stops.** A remote-DNS proxy (`socks5h`, `socks4a`, or a plugin with
  `remoteDns: true`) receives the name and resolves it itself; the name is still pre-checked
  locally. A plain-http target through an HTTP proxy in forward mode is resolved by the proxy;
  `httpTargets: 'connect'` keeps it pinned. S3 traffic through the AWS SDK is not policed: its
  endpoint is operator configuration.
- **Redirects.** Every hop is checked again, at most 5 by default. `Authorization`, `Cookie`,
  `Proxy-Authorization` and `sensitiveHeaders` never cross origins. A resolver may follow only URLs
  it owns, and its cookie goes only there.
- **Bodies.** `identity` encoding is requested; a transport-encoded body is decoded, but a gzip file
  never is. A body shorter than its `Content-Length` fails as `truncated`, and a silent body fails on
  the idle timeout. Limits count received bytes; declared sizes only refuse early.
- **Verification.** A transfer verifies the head before the sink sees a byte (on by default).
  Dangerous content is always refused. The S3 sink takes the Content-Type from the verdict and writes
  active svg/html as `attachment`. Archive entries are verified only when `verify` is passed.
- **Archives.** Refused: absolute paths, `..`, drive letters, control and bidi characters, overlong
  or deep paths, duplicate and case-fold-twin entries, encrypted entries, unsupported compression
  methods, overlapping zip entries, declared sizes that lie, an expansion ratio above the limit, and
  more entries or bytes than the limits. Links are skipped (or refused with `links: 'refuse'`) and
  devices skipped; neither is ever created. Nested archives stay files unless `maxDepth` is raised.
- **Writes.** A file sink writes a private temporary file (`0o600`, exclusive create) and commits it
  by link (no clobbering) or rename (`overwrite`); nothing is left on failure. A directory sink
  confines every entry to its root and refuses any existing symlink on the way.
- **Names.** A name from `Content-Disposition`, a URL or a key is reduced to a base name without
  control or bidi characters, leading dots or trailing dots and spaces, at most 255 bytes.
- **Logs.** URLs are logged without userinfo, query or fragment, with long opaque path segments
  masked. Proxy credentials and file contents are never logged.

## Related packages

- `@owlmeans/file-inspector` — detection, verdicts, policies and safe names (`fileNameHelper`,
  which this package does not re-export).
- `@owlmeans/storage-resource` — the upload resource and the bucket model `createS3Bucket` reads.
- `@owlmeans/storage-common` — stored-file types and errors, `FileScope` and `fileScopeHelper`.
- `@owlmeans/server-upload` — uses the workspace, transfer, archive and inspector objects for
  multi-file uploads.
- `@owlmeans/upload` — the upload contract; its path rules match the ones this package writes with.
- `@owlmeans/llm-reader` — takes the pinned `fetch` from `@owlmeans/file-streams/fetch` as its
  transport.

<!-- owlmeans:agent-guidance:start -->
## Agent guidance

This package ships embedded agent skills under `agent-meta/`. After installing your
`@owlmeans/*` packages, run the OwlMeans agent-skills installer to place them into
your project's skill store (`.agents/skills/`):

```sh
npx @owlmeans/agent-skills@^0.2.4-rc.1
```

The embedded files are version-matched to this package release. Do not edit them
directly — they are regenerated on each publish. To contribute guidance edits,
open a PR against the source monorepo.
<!-- owlmeans:agent-guidance:end -->
