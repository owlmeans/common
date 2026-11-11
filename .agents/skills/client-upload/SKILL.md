---
name: client-upload
description: "How to use @owlmeans/client-upload — the upload client for browsers and Bun: makeUploadClient over a client-bound upload protocol tree (open, upload with a precheck against the session policy, concurrency, retries, abort and per-file plus overall progress, state, remove, seal, abort), inputs from picked or dropped files and folders (uploadInputHelper.fromFiles keeps webkitRelativePath) and from local paths (uploadPathHelper.fromPaths in ./node, folders walked, symlinks skipped). Auto-invoked when sending files from a browser screen, a service forwarding files, or an MCP stdio client reading the disk."
user-invocable: false
---

# @owlmeans/client-upload

**Layer:** Client
**Install:** `"@owlmeans/client-upload": "^0.1.22-rc.0"` in `dependencies`

Client half of the upload family (contract `/upload`, server `/server-upload`). The main entry is
browser-safe; `@owlmeans/client-upload/node` reads the local disk (Node, Bun).

## Key Exports

| Export | What it is |
|---|---|
| `makeUploadClient(ctx, protocols)` → `UploadClient` | `open(request?)`, `state(id)`, `upload(id, inputs, options?)`, `remove(id, fileId)`, `seal(id)`, `abort(id)` |
| `UploadInput` · `UploadBody` · `UploadBodyFactory` | `{ path, body, size?, type? }`; a `Blob`/`File`, bytes, a Node `Readable`, or `() => body` |
| `UploadRunOptions` | `concurrency` (3), `retries` (2), `onProgress(file, overall)`, `signal`, `session?` (skips the `state` call), `precheck` (default true), `call` (timeout, auth, host) |
| `UploadInputResult` | `{ index, path, files, refused?, error?, status? }` — one per input, in order |
| `UploadFileProgress` · `UploadOverallProgress` | `{ index, path, loaded, total?, state }` (`queued`/`sending`/`done`/`refused`/`failed`); `{ loaded, total, settled, count }` |
| `uploadInputHelper` | `fromFiles(files)`, `sizeOf(body)`, `isReusable(body)`, `bodyOf(body)` |
| `uploadPathHelper` (`./node`) | `fromPaths(paths, { base? })` |
| `DEFAULT_UPLOAD_CONCURRENCY`, `DEFAULT_UPLOAD_RETRIES`, `UPLOAD_RETRY_DELAY_MS`, `UPLOAD_RETRY_STATUSES` | Constants |

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
await uploads.seal(projectId)
```

```typescript
import { uploadPathHelper } from '@owlmeans/client-upload/node'

const inputs = await uploadPathHelper.fromPaths(['./brand', './brief.md'])   // brand/logo.png, brand/fonts/…, brief.md
await uploads.upload(session.id, inputs)
```

## Behaviour

- **Session parameter**: read from the tree (`uploadSessionParamOf`) — the id passed is the app's
  own (a project id) when the tree names its parameter so.
- **Precheck** (default): one `state` call (or `options.session`), then
  `uploadPolicyHelper.precheck` against the policy, the totals and the accepted paths; a refused input
  (`path-invalid`, `duplicate`, `limits`) is never sent and carries `refused`. An archive counts as one
  file of its own size — the server counts its entries.
- **Sending**: `PUT …/file` with the normalized path, the size and the type in the query and the body
  as is (a Blob or bytes send their Content-Length; a stream is sent chunked, so give its `size`).
  `concurrency` inputs at a time; results stay in input order.
- **Retries**: after a transport failure, a 5xx, 408, 425 or 429, with a doubling pause
  (300 ms, 600 ms …) — never after a refusal (4xx), and never for a one-shot `Readable` (pass a
  factory, as `fromPaths` does, to make a stream retryable).
- **Abort**: `signal` fails the input in flight and every queued one (`error`); the server releases
  what it had reserved.
- **Progress**: every state change and every upload progress event of the transport (in Bun about
  three per second) calls `onProgress` with a copy of the input's progress and the overall sums.
- `fromFiles(files)` takes a `FileList`, an array or any iterable of `File`s: the path is
  `webkitRelativePath` (a picked folder), else a dropzone's `path` without its leading `./` or `/`,
  else the name; `size` and `type` from the file.
- `fromPaths(paths, { base? })`: a file → its name (or its path relative to `base`), a folder → its
  name plus every regular file under it, sorted; symlinks are skipped, never followed; each body is a
  factory opening a read stream per attempt.

## Tests

Category C — `tests/client.spec.ts` drives a real `@owlmeans/server-upload` service over HTTP
(`tests/context.ts`; its receiver fails the first delivery of a `flaky/` path, as a busy downstream
would): mixed bodies with progress and concurrency, the precheck, retries, abort, `fromFiles`,
`fromPaths` over a folder.

## Depends On

- `@owlmeans/upload`, `@owlmeans/api` (`./status` — the status of a failure), `@owlmeans/entrypoint`,
  `@owlmeans/context`

## Related

- [[upload]] — the contract and the precheck rules
- [[server-upload]] — what the server does with each file
- [[client-entrypoint]] — binding the tree; streamed bodies and `onUploadProgress`
