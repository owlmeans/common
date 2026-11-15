---
name: extending
description: Writing your own FileSource, FileSink, TreeSink, proxy plugin or URL resolver and the contract each must keep; the invariants of the package (pinned connects, the aws-free ./fetch graph, counted limits, drained tar entries, confined paths, redacted logs); and the package's specs, stand-ins and gates.
metadata:
  purposes: data, test
  mentions: FileSource, FileSink, TreeSink, RangeReader, SinkInput, SinkResult, ProxyPlugin, ProxyConnection, TunnelTarget, UrlResolver, ResolverStep, FILE_STREAMS_LIVE, S3_TEST_BUCKET
---

# @owlmeans/file-streams — Extending and testing the package

## A source

A `FileSource` is `{ kind, info, open, ranges }`; it is also a file-inspector `ProbeSource`, so
probes, transfers and archive extraction take it as it is.

- `info({ signal? })` — metadata without the body, cached after the first success: `origin`
  redacted (no credentials, no query), `name` a safe base name, `size` and `mime` as declared
  (lower-cased, no parameters), `etag` a strong validator when the origin has one.
- `open({ range?, signal? })` — a fresh Node `Readable` from byte 0, or the honoured span with
  `range: { start, end, total }`. A one-shot source refuses a second open with
  `SourceError('consumed')`; a missing object is `SourceError('not-found')`.
- `ranges({ signal? })` — a `RangeReader` (`size`, `read(offset, length, signal?)`,
  `stream(start, end, signal?)` with `end` exclusive, `close()`) over ONE immutable version: pin it
  with the validator and throw `SourceError('changed')` when the origin moved. Answer `null`
  without random access — probes then read the head of `open()` and a zip is spooled.
- An abort rejects with the signal's reason.

## A sink

- `FileSink.write({ stream, info, verdict? }, { maxBytes?, signal? })` consumes the whole stream,
  counts it and refuses past `maxBytes` (`LimitError('max-bytes')`), commits atomically, and on
  failure destroys the input and leaves nothing behind. It answers `SinkResult { kind, location,
  bytes, url?, etag?, mime? }`, with `mime` from `verdict?.detected?.mime` before `info.mime`.
- `TreeSink.entry(path)` normalizes and confines the path (`PathError`: `absolute`, `traversal`,
  `invalid-char`, `too-long`, `too-deep`, `empty`), refuses case-fold twins where the store folds
  case, and returns the entry's `FileSink`; `directory(path)` creates an empty directory or is a
  no-op where the store has none.

## A proxy plugin

```typescript
import { createHttpClient, ProxyError } from '@owlmeans/file-streams'
import type { ProxyPlugin } from '@owlmeans/file-streams'

const bastionPlugin: ProxyPlugin = {
  types: ['bastion'],
  remoteDns: () => false,
  connect: async (endpoint, target, { signal, timeoutMs }) => {
    const socket = await openTunnel(endpoint, target.host, target.port, { signal, timeoutMs })   // your transport
    if (socket == null) {
      throw new ProxyError('connect')
    }
    return { socket, mode: 'tunnel' }
  },
}
const client = createHttpClient({ proxies: { proxies: ['bastion://jump.example.com:2222'], plugins: [bastionPlugin] } })
```

- Connect to `target.host` — the address the policy checked; `target.hostname` is for SNI and
  `Host` only. `remoteDns(endpoint) === true` hands the name to the proxy instead and gives up the
  pin (the name is still pre-checked).
- Never terminate TLS: return the raw tunnel, and the client layers TLS over it for https targets.
  `mode: 'forward'` is for plain-http absolute-form proxies only, with their auth in `headers`.
- Honour `timeoutMs` and `signal`; fail with `ProxyError('connect' | 'handshake' | 'auth-failed' |
  'refused:<code>')` — the router cools the endpoint down and tries another. A custom type needs an
  explicit port in its URL. Never log credentials.
- Register through `createProxyRouter({ plugins })`, `createHttpClient({ proxies: { plugins } })` or
  the service option `proxyPlugins`; custom plugins are tried before the built-in ones.

## A URL resolver

`UrlResolver { name, maxSteps, matches(url), rewrite(url), inspect(head, readBody), owns(url) }`:
`rewrite` turns a page link into the URL that serves the bytes (or throws
`ResolverError('<name>:<reason>')`); `inspect` sees each final 2xx GET answer before its body
reaches the caller, reads at most `readBody(maxBytes)` (replayed on accept) and answers
`{ action: 'accept' }`, `{ action: 'follow', url, headers?: { cookie } }` or
`{ action: 'fail', reason }`. A follow must stay on URLs the resolver `owns` (else
`foreign-follow`) and within `maxSteps`; its cookie is sent only there. Register with
`createHttpClient({ resolvers: [googleDriveResolver, mine] })` or the service option `resolvers`.

## Invariants

- Every connection goes through the client's connector: the policy resolves and checks, the socket
  goes to that address (or the address goes into the tunnel). Network code never calls `fetch`,
  `http.get(url)` or a DNS lookup of its own.
- The `./fetch` graph imports only `@owlmeans/error`, `@owlmeans/file-inspector`, `@owlmeans/log`,
  `@owlmeans/storage-common`, `socks` and `node:*`; `fetch.spec.ts` fails on any S3,
  storage-resource, workspace, transfer or archive module in it.
- Limits count the bytes that flowed; a declared size only refuses early.
- Tar entries are drained, never destroyed.
- Every written path passes the path rules, and nothing writes through an existing symlink.
- Logs carry redacted URLs, proxy ids and sizes — never contents, credentials or query strings.
- Failures are the package's error classes with `file-streams:<area>:<reason>` codes; S3 failures
  are `S3TransferError`, a storage `StorageApiError`.

## Tests

`bun test ./tests` in `@owlmeans/file-streams`; suites are titled `@owlmeans/file-streams — <area>`.
Build first: `fetch.spec.ts` walks the built `./fetch` graph.

- Offline specs run against local stand-ins (`tests/harness/`: an origin with Range, redirects and
  stalls, a CONNECT/forward proxy, a SOCKS5 server, a fake Drive, a workload `/command/` receiver
  answering `writeBinaryFile` and `readBinaryFile` with the real limits) and code-built fixtures.
  `tests/context.ts` holds `LOCAL_NETWORK` (`allowCidrs: ['127.0.0.1/32']`), `localClient()` and
  `boot()` — a real server context with the service registered. `workspace.spec.ts` runs over a
  temporary root.
- `s3.spec.ts` and `backed.spec.ts` need the S3 gate (`S3_ENDPOINT`, `S3_TEST_BUCKET`, `S3_KEY`,
  `S3_SECRET`, `S3_REGION`; `gateHelper.s3Gate()` from `@owlmeans/test-integration`): path-style for
  a non-AWS endpoint, `acl: false`, objects under a random base prefix, deleted after. Empty
  variables print a skip.
- `live.spec.ts` needs `FILE_STREAMS_LIVE=1` (public HTTPS), and `FILE_STREAMS_LIVE_DRIVE_URL` for a
  public Drive file.
- A new source is covered for info, whole and ranged opens, random access and a changed origin; a
  sink for atomic commit, `maxBytes` and a failure that leaves nothing; a proxy plugin by a stand-in
  that proves the checked address reaches the tunnel and no secret reaches the log; a resolver by a
  fake origin.
