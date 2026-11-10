---
name: file-streams
description: "How to use @owlmeans/file-streams — online files as Node streams: URL downloads under a connect-time SSRF policy, HTTP and SOCKS proxy plugins (a list or a callback by key and URL), the Google Drive resolver, S3 buckets addressed exactly like storage-resource, folders, buffers and Viable ephemeral workloads; zip/tar/tar.gz/gz with traversal and bomb guards; file-type verification (office, pdf, csv, media, images, source code) from a head or a few range reads. Auto-invoked when downloading a file, moving bytes between HTTP, S3, disk and a workload, extracting or packing an archive, checking that a file is what it claims, or configuring outbound proxies."
user-invocable: false
---

# @owlmeans/file-streams

**Layer:** Infra
**Install:** `"@owlmeans/file-streams": "^0.1.22-rc.0"` in `dependencies`

Server-side (Node and Bun). Every byte moves as a Node `Readable` — the shape storage-resource's
`StoredRecord.stream`, the AWS SDK, zlib and the archive codecs share. A web stream, an async
iterable or a `Uint8Array` is accepted where a source is built.

## Key Exports

| Export | What it is |
|---|---|
| `FileSource` / `FileSink` / `TreeSink` | Where bytes come from (`info`, `open`, `ranges`), where one file goes, where many go |
| `httpClient` / `createHttpClient(opts)` | Requests under the network policy, through proxies, redirects and resolvers; `.source(url)` is a re-openable, Range-capable source |
| `createFileSource`, `createBufferSource`, `createStreamSource` | A file on disk, bytes in memory (a screenshot), a stream opened elsewhere (one-shot) |
| `createFileSink`, `createDirectorySink`, `createBufferSink` | Atomic file write, a confined directory tree, an in-memory collector |
| `createS3Bucket(entry or model, opts)` | A `cfg.storageBuckets` entry as `source`, `sink`, `tree`, `head`, `remove`, `instanceOf` |
| `makeWorkloadSink(writer, { root })` | A Viable ephemeral workload as a tree, through its `writeBinaryFile` port |
| `transferHelper.copy(source, sink, opts)` / `.copyInto(source, tree, opts)` | One file moved under limits, its head verified before the sink sees a byte |
| `fileInspector.probe(source)` / `.inspect(bytes, claims)` / `.enforce(verdict, policy)` | What a file really is, against what it claims |
| `archiveHelper.extract / list / pack / gzip / gunzip / detect` | zip, tar, tar.gz and gz, detected from bytes |
| `createProxyRouter`, `createHttpProxyPlugin`, `createSocksProxyPlugin` | Proxy selection and the built-in protocol plugins |
| `createGoogleDriveResolver(opts)` / `googleDriveResolver` | Drive and Docs links to the bytes behind them (on by default in `createHttpClient`) |
| `createNetworkPolicy(opts)` | What may be reached; every connection goes through it |
| `appendFileStreamsService(ctx, alias?, opts?)` | The objects configured from `cfg.fileStreams` and `cfg.storageBuckets` |
| `FileKind`, `ArchiveFormat`, `WORKLOAD_MAX_FILE_BYTES` | Enums and ceilings |
| `NetworkPolicyError`, `HttpError` (`.status`), `ProxyError`, `LimitError`, `SourceError`, `PathError`, `ArchiveError`, `ResolverError`, `WorkloadError` | Failures, by message code (`file-streams:<area>:<reason>`) |
| `FileMimicryError`, `FileKindError` (storage `FileTypeError`), `S3TransferError` (storage `StorageApiError`) | Type refusals and S3 failures a storage-resource catch site already handles |

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
it into the sink. Verification is on by default: a kind mismatch is refused, executable content
under a passive claim (an image, a pdf, office, media, csv) is always refused, an inconclusive
verdict passes unless `refuseInconclusive`; `verify: false` turns it off.

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

## Network policy and proxies

- Loopback, private, link-local, CGNAT, multicast, reserved and documentation ranges are refused,
  and the IPv4 inside a mapped, NAT64, 6to4 or Teredo address is checked too; internal names
  (`localhost`, `.local`, `.internal`, `.svc`, `.cluster.local`, `.home.arpa`) are refused before DNS.
- The check is pinned to the connect: a direct socket goes to the address just resolved and
  checked, a proxy tunnel carries that address (TLS keeps the host name for SNI and certificates).
  Every redirect hop is checked again; https → http is refused; `Authorization`, `Cookie`,
  `Proxy-Authorization` and `sensitiveHeaders` never cross origins.
- A local stand-in or an in-cluster origin needs `network: { allowCidrs: [...] }` (or
  `allowPrivate`). S3 traffic through the SDK is not policed — its endpoint is operator config.
- Built-in plugins: `http`/`https` endpoints (CONNECT for https targets, absolute-form forward for
  plain http — which a proxy resolves itself, so pinning holds only through CONNECT:
  `createHttpProxyPlugin({ httpTargets: 'connect' })`), and `socks4`/`socks4a`/`socks5`/`socks5h`.
  Remote-DNS endpoints (`socks5h`, `socks4a`) still pre-check the name locally and are refused when
  it does not resolve unless `trustProxyDns`.
- Bun's own `fetch({ proxy })` speaks only http/https proxies and undici dispatchers are unreliable
  under Bun, so the client is `node:http(s)` over a socket it connects itself — Bun 1.4.2 honours
  the `createConnection` option, an Agent's `createConnection`, the `lookup` option and TLS over an
  existing socket.

## Detection

`file-type` (signatures) with `@file-type/cfbf` (legacy doc/xls/ppt by the root CLSID) and
`@file-type/xml` (svg, xhtml, kml…), then a text sniffer for what signatures cannot see: encoding,
csv/tsv (delimiter consistency), json, html, svg without a prolog, shebang scripts and source code by
extension. file-type misses csv, svg, text and code and reports legacy office as `cfb`; it calls a
`<!DOCTYPE html>` page `xml`, so the sniffer's html/svg reading wins over a generic `xml`.

A verdict compares the detected type with the declared one (extension of the name, URL or
Content-Disposition, and the declared media type): `match` (containers count — docx in a zip
claim, tar.gz in a gz claim, svg in an xml claim, code as text), `mismatch` (with reasons such as
`html-error-page`, `binary-as-text`, `executable-content`) or `inconclusive` (`head-only`,
`no-claim`, `unrecognized`). `details` carry the csv shape, the language, `active` (scripted
svg/html — the S3 sink then writes `attachment`), `formatDiffers` (a png named `.jpg`) and the PDF
trailer. Random access lets a probe seek (CFB directory sectors, zip entries behind a large stored
one) within its budget; without it a head-only verdict on an office claim stays inconclusive.

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
| Workload | 12 MiB per file (`WORKLOAD_MAX_FILE_BYTES`), one retry |

## Google Drive

Share links (`/file/d/<id>/…`, `open?id=`, `uc?id=`) become `drive.usercontent.google.com/download`;
the "can't scan this file for viruses" page is followed through its own `download-form` (action must
be a Google origin; hidden `confirm`/`uuid` carried), then the legacy `confirm=` link, then a
`download_warning` cookie. Docs, Sheets, Slides and Drawings links become export URLs (docx, xlsx,
pptx, png by default; csv/tsv keep the `gid`). Folders, quota pages, sign-in redirects and forms
posting elsewhere fail as `ResolverError('google-drive:<reason>')`. The page flow is the one gdown
documents; it is reverse-engineered, so `FILE_STREAMS_LIVE_DRIVE_URL` exercises it against Google.

## Service

`appendFileStreamsService(ctx)` registers `file-streams`: `http()`, `transfer()`, `inspector()`,
`archives()` and `bucket(configKey)`, built lazily from `cfg.fileStreams`
(`limits`, `network`, `proxies: [{ url, username?, password? }]`, `proxyStrategy`, `userAgent`) and
`cfg.storageBuckets`. Proxy entries are objects so a server context resolves their secret-file
leaves; callbacks and plugins come through the options argument.

## External docs

- https://www.npmjs.com/package/file-type — v22: signature detection only (no csv/svg/text/code, legacy office as `cfb`); web-stream APIs; `fileTypeFromTokenizer` reads random-access tokenizers; one `FileTypeParser` per call (not concurrency-safe); `maxBufferSize` bounds detector reads
- https://github.com/Borewit/file-type-cfbf — `detectCfbf` names doc/xls/ppt/msi/vsd/pub/wps by the root entry's CLSID (needs the first directory sector reachable)
- https://github.com/Borewit/file-type-xml — `createXmlDetector({ sampleSize })`: svg, xhtml, kml, rss and generic xml from a bounded sample
- https://bun.com/docs/runtime/networking/fetch — Bun `fetch({ proxy })` accepts http/https proxy URLs only (no SOCKS) (Bun 1.4)
- https://undici.nodejs.org/api/Socks5ProxyAgent — undici's SOCKS5 agent is experimental; dispatchers are not relied on under Bun
- https://github.com/thejoshwolfe/yauzl — central-directory zip reading, `fromRandomAccessReader` (override `read` and `_readStreamForRange`), `validateEntrySizes`, automatic `validateFileName` (v3)
- https://github.com/mafintosh/tar-stream — v3 ships streamx typings; destroying an entry destroys the extract, so entries are drained
- https://docs.rs/modde-sources/latest/src/modde_sources/gdrive/mod.rs.html — the usercontent download host and the virus-scan form flow (`confirm`, `uuid`) public Drive downloads take; no official Google documentation exists for it

## Tests

Category C. Offline specs run against local stand-ins (`tests/harness/`: an origin with Range,
redirects and stalls, a CONNECT/forward proxy, a SOCKS5 server, a fake Drive, a workload
`/command/` receiver with the real limits) and code-built fixtures; `s3.spec.ts` needs the S3 gate
(path-style for a non-AWS endpoint, objects under a random prefix, deleted after); `live.spec.ts`
needs `FILE_STREAMS_LIVE=1` (and `FILE_STREAMS_LIVE_DRIVE_URL`).

## Depends On

- `@owlmeans/storage-resource` (the bucket model), `@owlmeans/storage-common` (errors, instances),
  `@owlmeans/context`, `@owlmeans/error`, `@owlmeans/log`
- `@aws-sdk/client-s3`, `file-type`, `@file-type/cfbf`, `@file-type/xml`, `strtok3` (one copy with
  file-type's — its `instanceof EndOfStreamError` checks break on a second), `socks`, `tar-stream`,
  `yauzl`, `yazl`

## Related

- [[storage-resource]] — the upload resource and the bucket model
- [[storage-common]] — stored-file types and errors
- [[logging]] — scopes `file-streams:<area>`; URLs are logged redacted, contents never
