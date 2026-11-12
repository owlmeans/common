---
name: storage-resource
description: How to use @owlmeans/storage-resource — the upload-only S3-compatible object storage resource (RustFS, MinIO, AWS) that verifies an upload's bytes through @owlmeans/file-inspector and streams it without buffering, the bucket model (makeStorageBucketModel) every S3 consumer addresses objects by, bucket exists/ensure (created at start-up when missing), split credentials, timeouts and attempts. Auto-invoked when uploading files to a bucket, wiring cfg.storageBuckets, or creating a bucket on start-up.
user-invocable: false
---
<!-- AUTO-GENERATED — do not edit. Regenerate via sync-agent-meta. -->

# @owlmeans/storage-resource

**Layer:** Infra
**Install:** `"@owlmeans/storage-resource": "^0.2.0-alpha.1"` in `dependencies`

Server-side (Node and Bun).

## Key Exports

| Export | Description |
|--------|-------------|
| `appendStorageResource(context, alias?, configKey?)` | Register the upload resource on a server context; ensures an `ensure: true` bucket while the context initializes |
| `createStorageResource(alias?, configKey?)` | The bare resource, when you register it yourself |
| `StorageResource` | `Pick<Resource<StoredRecord>, 'create'>` plus `BasicResource` — **an upload and nothing else** |
| `makeStorageBucketModel(config)` / `StorageBucketModel` | How one entry addresses its bucket: `bucket`, `endpoint`, `region`, `forcePathStyle`, `basePrefix`, `acl`, `locationConstraint`, `adminUrl`, `keyOf(prefix)`, `urlOf(prefix)`, `createClient(options?)`, `exists()`, `ensure()` |
| `StorageEnsureOutcome` (`'exists'` / `'created'`), `StorageClientOptions` (`maxAttempts`), `StorageTimeouts` | What `ensure` found; a per-client override; the entry's client limits |
| `DEFAULT_STORAGE_REGION` (`eu-central-1`), `DEFAULT_STORAGE_ACL` (`public-read`), `UNCONSTRAINED_REGION` (`us-east-1`), `STORAGE_HEAD_BYTES` (64 KiB) | Defaults; the region that takes no `LocationConstraint`; the head an upload is verified by |
| `StoredRecord`, `StorageConfig`, `StoredConfigAppend` | The uploaded object, one bucket's config, and the `cfg.storageBuckets` shape |
| `stripData` | Drop the inline payload from a `StoredFileWithData` before it goes on the wire |
| `supportedMimeTypes`, `DEFAULT_ALIAS` (`s3-storage`) | Constants |

## Usage

```typescript
import { appendStorageResource, makeStorageBucketModel } from '@owlmeans/storage-resource'

appendStorageResource(context, 'uploads', 'media-bucket')

const uploads = context.resource<StorageResource>('uploads')
const stored = await uploads.create({ stream, size, type: 'image/png', name: 'logo.png', prefix: `${entityId}/${id}` })
stored.url   // the public URL the bucket answers on

const bucket = makeStorageBucketModel(context.cfg.storageBuckets['media-bucket'])
await bucket.ensure()   // 'exists' | 'created'
```

`configKey` selects the entry in `cfg.storageBuckets`, defaulting to the alias. An entry is read by
`makeStorageBucketModel` — the one reading `create` and `@owlmeans/file-streams` share, so an object
either writes is found by the other at the same key and URL:

| Key | Value |
|---|---|
| `url` | **`<bucket>.<endpoint-host>`, no scheme and no path** — the first dot-label is the S3 `Bucket`, everything after it is the endpoint (`https://<rest>`), e.g. `media.s3.eu-central-1.amazonaws.com` uploads to bucket `media`; `https://<url>` is the public base. Optional when `endpoint` and `bucket` are set |
| `apiKey` | `"<keyId>:<keySecret>"`, split at the **first** colon (a secret may contain colons). Optional when the pair below is set |
| `accessKeyId` + `secretAccessKey` | the credentials as two leaves (each may be a mounted secret file); a full pair wins over `apiKey`, half a pair falls back to it |
| `basePrefix` | prepended to every key: the object lands at `<basePrefix>/<record.prefix>`. Empty or absent → keys start at the bucket root (`<record.prefix>`, leading slashes dropped) |
| `endpoint`, `bucket` | an S3-compatible store addressed directly (`http://rfs-s3.default.svc.cluster.local:9000`, `media`); win over what `url` says |
| `region` | signing region; default `eu-central-1` |
| `forcePathStyle` | `<endpoint>/<bucket>/<key>` addressing — what RustFS, MinIO and most S3-compatible stores need |
| `acl` | canned ACL of uploads; default `public-read`, `false` sends none (buckets with ACLs disabled) |
| `publicUrl` | the base objects answer on, when it is neither `https://<url>` nor derived from the endpoint |
| `ensure` | create the bucket when missing — at start-up and on uploads until it succeeds (below) |
| `locationConstraint` | the zone `ensure` creates the bucket in; default the region; never sent for `us-east-1` (S3 refuses it) |
| `adminPath` | the store's admin API path, exposed as `model.adminUrl` = `<endpoint>/<path>`; nothing here calls it |
| `timeouts` | `{ connectMs?, requestMs? }` — connect, and send-to-response-headers **including the upload body**; past `requestMs` the request is refused (`TimeoutError`) |
| `maxAttempts` | attempts per request, first included; SDK default (3) when absent. An upload always makes one |

**Config files read a leaf starting with `/` as a file path.** The server context's config reader
replaces such a leaf with that file's contents before the entry is read — which is how a mounted
secret becomes `apiKey` / `accessKeyId` / `secretAccessKey`, and why a literal `adminPath` is written
without its leading slash (`rustfs/admin/v3`; the model accepts both forms).

A `url` written as a plain endpoint (`https://s3.amazonaws.com`) names a bucket `https://s3` — use
`endpoint` and `bucket`. Clients compute checksums only when an operation requires them. An
unaddressable entry throws `FilePropertyError` (`storage-config`, `storage-api-key`, `storage-address`).

## Bucket ensure

- `exists()` — HeadBucket: `true`, `false` on 404, any other answer `StorageApiError(<code>)`.
- `ensure()` — HeadBucket, then CreateBucket with the location constraint. `BucketAlreadyOwnedByYou`
  is `exists`; so is `BucketAlreadyExists` when the bucket then answers HeadBucket — RustFS answers it
  to the loser of two concurrent ensures of its own bucket. Any other refusal →
  `StorageApiError(<S3 code>)` (`AccessDenied`, `InvalidBucketName`, a network `ECONNREFUSED`).
- With `ensure: true` the resource ensures the bucket **once while the context initializes**:
  `created` logs `info` (`storage-resource.bucket-created`), a failure logs `warn`
  (`storage-resource.ensure-failed`) and **never fails start-up**. Until one attempt succeeds, every
  `create` retries it first (one attempt at a time); a failed retry is logged and the upload goes
  ahead, so its own answer is authoritative. Give the entry `timeouts.connectMs` — an unreachable
  store otherwise holds initialization for the OS connect timeout.
- An app that must gate boot on its bucket calls `model.ensure()` itself.

## Upload verification

`create` checks a caller's claim against the bytes, never takes it. It reads the first
`STORAGE_HEAD_BYTES` (64 KiB) and runs `fileInspector.inspect(head, { name: record.name, mime:
record.type }, { complete, size })`, then `enforce` with `refuse: [FileKind.Executable]`:

| Refused | Error (all `FileTypeError`) |
|---|---|
| executable content, however claimed (detected, or claimed by name/type) | `FileKindError` `kind:executable` |
| executable under a passive claim, a script under a passive claim, an active PDF | `FileMimicryError` `mimicry:dangerous:<claimed>:<detected>` |
| a kind mismatch (`kind-mismatch`, `html-error-page`, `binary-as-text`) | `FileMimicryError` `mimicry:mime-mismatch` |
| another format of the same kind than the declared type or the name's extension, when a signature identifies the bytes (png declared `image/jpeg`, png named `.jpg`) — the object answers with the declared type | `FileMimicryError` `mimicry:mime-mismatch` |
| no claim at all, or a binary no signature recognizes under a claimed kind | `FileMimicryError` `mimicry:mime-mismatch` |

Callers catch `FileTypeError`. **Text types pass** — md, csv, json, svg, code, html have no signature;
the text sniffer judges them by kind. `inconclusive` verdicts for `csv-unconfirmed`, `head-only`
(an office zip larger than the head) or `probe-budget` pass. A mismatch logs `warn`
`storage-resource.mime-mismatch` with the claimed and detected types, never contents. Refused bodies
are destroyed. Scripted svg/html (`details.active`) is stored with `ContentDisposition: attachment`
(an `<img>` still renders it), everything else `inline`; `ContentType` is `record.type`, or the
detected type when only a name was claimed.

## Streaming

After the head, `create` sends the **replayed stream** with `PutObject` and `ContentLength =
record.size` — nothing is buffered beyond the head and the transport's own buffers. A counter
aborts the request the moment the body passes `size` (`StorageApiError('body-long')`) or ends short
of it (`body-short`); a failing source aborts it too (`StorageApiError()`). The upload client makes
exactly one attempt — a stream cannot be replayed. A request refusal answers `StorageApiError()`
(logged `error`); a non-200 answer `StorageApiError('code')`. The client is destroyed after every
upload. Multipart uploads of very large bodies are `@owlmeans/file-streams`' S3 sink.

## A bucket is not a record store

No index stands behind a bucket, so `StorageResource` exposes `create` alone. Keep the *record*
(url, size, type, owner) in a mongo or postgres resource. `create` needs a `stream`
(`FileStreamError`) and a `size` (`FilePropertyError`); `opts.ttl` has nothing to act on.

## Tests

Category A + C. Offline: `tests/bucket.spec.ts` (model readings: legacy, root keys, credentials,
admin URL, zone, attempts, refused connection, request timeout against a silent loopback server),
`tests/verify.spec.ts` (refusals and text acceptance before anything is sent),
`tests/ensure.spec.ts` (an unreachable `ensure: true` store never fails start-up and is retried by
`create`). S3-gated (`gateHelper.s3Gate()`, path-style for any non-AWS endpoint, `acl: false`):
`ensure.spec.ts` creates and removes `<S3_TEST_BUCKET>-<hex>` buckets, incl. concurrent ensures and
the init path; `create.spec.ts` ensures the test bucket on boot, uploads png/md/svg, refuses
mismatches, executables and wrong sizes, and streams 12 MiB through `tests/harness/counting-proxy.ts`
(a loopback TCP relay counting what left the process), asserting the body never ran more than 8 MiB
ahead of the wire. A key whose policy admits one bucket family needs `S3_TEST_BUCKET` inside it —
the random buckets are `<S3_TEST_BUCKET>-<hex>`.

## External docs

- https://docs.aws.amazon.com/AmazonS3/latest/API/API_CreateBucket.html — `LocationConstraint` omitted for us-east-1; `BucketAlreadyOwnedByYou` (409) for a bucket you own
- https://docs.aws.amazon.com/AmazonS3/latest/API/API_HeadBucket.html — 200 / 404 / 403 with no body (the SDK names the error by status)
- https://github.com/smithy-lang/smithy-typescript (`@smithy/node-http-handler`) — `requestTimeout` (to response headers) only warns without `throwOnRequestTimeout: true`; a `Readable` body is `pipe`d, so its error never ends the request — abort via `abortSignal`

## Depends On

- `@owlmeans/file-inspector` (verification), `@owlmeans/storage-common`, `@owlmeans/resource`,
  `@owlmeans/context`, `@owlmeans/server-context`, `@owlmeans/error`, `@owlmeans/log`
- `@aws-sdk/client-s3`, `file-type` (`supportedMimeTypes`)
- The manifest also carries a `react` peer that nothing here imports — a consumer without React can
  ignore the peer warning.

## Related

- [[file-inspector]] — the verdicts and policies `create` applies
- [[storage-common]] — the shared file types, schemas and errors
- [[image-resource]] — the image-shaped specialization of those types
- [[file-streams]] — streaming reads, multipart writes, probes and transfers over the same entries
- [[logging]] — scope `storage-resource`; events `bucket-created`, `ensure-failed`, `mime-mismatch`
