---
name: client-upload
description: "How to use @owlmeans/client-upload — the upload client for browsers and Bun: makeUploadClient over a client-bound upload protocol tree (open, upload with a precheck against the session policy, concurrency, retries, abort and per-file plus overall progress, state, remove, seal, abort), inputs from picked or dropped files and folders (uploadInputHelper.fromFiles keeps webkitRelativePath) and from local paths (uploadPathHelper.fromPaths in ./node, folders walked, symlinks skipped). Auto-invoked when sending files from a browser screen, a service forwarding files, or an MCP stdio client reading the disk."
user-invocable: false
---

# @owlmeans/client-upload

**Layer:** Client
**Install:** `"@owlmeans/client-upload": "^0.2.3"` in `dependencies`

Client half of the upload family: the contract is `@owlmeans/upload`, the server
`@owlmeans/server-upload`, the React UI `@owlmeans/web-upload` (built on this client). The main entry
is browser-safe; `@owlmeans/client-upload/node` reads the local disk (Node, Bun).

## Key Exports

| Export | What it is |
|---|---|
| `makeUploadClient(ctx, protocols)` → `UploadClient` | `open(request?)`, `state(id)`, `upload(id, inputs, options?)`, `remove(id, fileId)`, `seal(id)`, `abort(id)` |
| `UploadInput` · `UploadBody` · `UploadBodyFactory` | `{ path, body, size?, type? }`; a `Blob`/`File`, bytes, a Node `Readable`, or `() => body` (sync or async) |
| `UploadRunOptions` | `concurrency` (3), `retries` (2), `onProgress(file, overall)`, `signal`, `session?` (skips the `state` call), `precheck` (default true), `call` (timeout, auth, host — `file` calls only) |
| `UploadInputResult` | `{ index, path, files, refused?, error?, status? }` — one per input, in order |
| `UploadFileProgress` · `UploadFileState` · `UploadOverallProgress` · `UploadProgressListener` | `{ index, path, loaded, total?, state }`; `queued`/`sending`/`done`/`refused`/`failed`; `{ loaded, total, settled, count }`; `(file, overall) => void` |
| `uploadInputHelper` · `createUploadInputHelper()` · `UploadInputHelper` · `UploadFileLike` | `fromFiles(files)`, `sizeOf(body)`, `isReusable(body)`, `bodyOf(body)`; a `File` with `webkitRelativePath?` and a dropzone's `path?` |
| `uploadPathHelper` · `createUploadPathHelper()` · `UploadPathHelper` · `UploadPathOptions` (`./node`) | `fromPaths(paths, { base? })` |
| `DEFAULT_UPLOAD_CONCURRENCY`, `DEFAULT_UPLOAD_RETRIES`, `UPLOAD_RETRY_DELAY_MS`, `UPLOAD_RETRY_STATUSES` | 3; 2; 300; `[408, 425, 429, 500, 502, 503, 504]` |

## Usage

```typescript
import { bindAll } from '@owlmeans/client-entrypoint'
import { makeUploadClient, uploadInputHelper } from '@owlmeans/client-upload'

context.registerEntrypoints(bindAll(materialProtocols))      // before configure/init
const uploads = makeUploadClient(context, materialProtocols)  // once, outside a render

const results = await uploads.upload(projectId, uploadInputHelper.fromFiles(input.files), {
  onProgress: (file, overall) => setProgress(overall.total > 0 ? overall.loaded / overall.total : 0),
  signal: controller.signal,
})
results.filter(result => result.refused != null)                         // refused before sending
results.flatMap(result => result.files).filter(file => file.status === 'rejected')   // refused by the server
results.filter(result => result.error != null)                           // failed after the retries (status?)
await uploads.seal(projectId)
```

```typescript
import { uploadPathHelper } from '@owlmeans/client-upload/node'

const inputs = await uploadPathHelper.fromPaths(['./brand', './brief.md'])   // brand/logo.png, brand/fonts/…, brief.md
await uploads.upload(session.id, inputs)
```

A Bun service forwarding files binds the remote tree the same way (the tree declared with
`service: '<remote>'`) and calls `makeUploadClient` over it.

## Behaviour

- **Session parameter**: read from the tree (`uploadSessionParamOf(protocols.file)`) — the id passed
  is the app's own (a project id) when the tree names its parameter so.
- **Precheck** (default): one `state` call (or `options.session`), then
  `uploadPolicyHelper.precheck` against the policy, the totals and the accepted paths; a refused input
  (`path-invalid`, `duplicate`, `limits`) is never sent and carries `refused`. An input without a
  known size counts as 0 bytes. An archive counts as one file of its own size — the server counts its
  entries. A failing `state` call rejects the whole `upload` (nothing is sent).
- **Sending**: `PUT …/file` with the normalized path, the size and the type (when not empty) in the
  query and the body as is (a Blob or bytes send their Content-Length; a stream is sent chunked, so
  give its `size`). `concurrency` inputs at a time; results stay in input order.
- **Retries**: after a failure without a status or with 408, 425, 429, 500, 502, 503 or 504, with a
  doubling pause (300 ms, 600 ms …) that an abort cuts short — never after another status (a refusal),
  never for a one-shot `Readable` (pass a factory, as `fromPaths` does, to make a stream retryable),
  never once aborted.
- **Abort**: `signal` fails the input in flight and every queued one (`error` = the signal's reason);
  the server releases what it had reserved.
- **Progress**: every state change and every upload progress event of the transport (axios
  throttles them, about three per second) calls `onProgress` with a copy of the input's progress and
  the overall sums; `overall` counts every input not refused, `total` only the known sizes.
- `fromFiles(files)` takes a `FileList`, an array or any iterable of `File`s: the path is
  `webkitRelativePath` (a picked folder), else a dropzone's `path` without its leading `./` or `/`,
  else the name; `size` and `type` (when not empty) from the file.
- `fromPaths(paths, { base? })`: a file → its name (or its path relative to `base`), a folder → its
  name plus every regular file under it, sorted by name; symlinks are skipped, never followed (given
  or inside a folder); each body is a factory opening a read stream per attempt, its size from
  `lstat`; Windows separators become `/`.

## Pitfalls

- Bind the tree client-side (`bindAll`) before `configure`/`init`, and make the client once — not
  per render: `makeUploadClient` reads the tree's session parameter at creation.
- A plain `Readable` body is never retried; a factory is.
- `options.session` must be current, or the precheck counts against stale totals (the server still
  enforces).
- `call` is spread into the `file` calls only, never into `open`/`state`/`remove`/`seal`/`abort` or
  the precheck's `state` call.

## Maintaining this package

- **Tests** — `@owlmeans/client-upload`, `tests/client.spec.ts` (category C, offline): a real
  `@owlmeans/server-upload` service over HTTP from `tests/context.ts` (a guest tree, a tree receiver
  into a temporary folder that fails the first delivery of every `flaky/` path, as a busy downstream
  would). Covered: mixed bodies with progress and concurrency, the precheck, retries for a reusable
  body but not a one-shot stream, abort, `fromFiles` with remove/seal/abort, `fromPaths` over a
  folder with a symlink.
- **Invariants** — the main entry imports no Node module (only `./node` does); results are one per
  input in input order; any status outside `UPLOAD_RETRY_STATUSES` is final, and that constant is
  the only list of retryable statuses.
- **Extending** — a new member of the `@owlmeans/upload` tree gets a method on `UploadClient`; a new
  input source goes into `uploadInputHelper` (browser-safe) or the `./node` helper (disk).

## Depends On

- `@owlmeans/upload`, `@owlmeans/api` (`./status` — the status of a failure), `@owlmeans/entrypoint`,
  `@owlmeans/context`

## Related

- [[upload]] — `@owlmeans/upload`: the contract and the precheck rules
- [[server-upload]] — `@owlmeans/server-upload`: what the server does with each file
- [[web-upload]] — `@owlmeans/web-upload`: the React queue and parts over this client
- [[client-entrypoint]] — binding the tree; streamed bodies and `onUploadProgress`
