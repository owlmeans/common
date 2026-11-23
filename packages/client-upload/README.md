# @owlmeans/client-upload

The upload client of OwlMeans apps, in a browser and in a Bun or Node process. It calls an
`@owlmeans/upload` protocol tree that the context binds with client entrypoints: it opens sessions,
checks files against the session's policy before anything is sent, sends them a few at a time with
retries, reports per-file and overall progress, and stops on an abort signal. The main entry is
browser-safe; `@owlmeans/client-upload/node` turns files and folders on the local disk into inputs.

- **Upload** — `makeUploadClient(ctx, protocols).upload(sessionId, inputs, options)`: a precheck
  against the session (`uploadPolicyHelper.precheck`), `concurrency` inputs in flight, retries with
  a doubling pause for transport failures and retryable statuses, `onProgress(file, overall)`, one
  result per input in input order.
- **Sessions** — `open`, `state`, `remove`, `seal` and `abort` over the same tree; the session
  parameter is read from the tree, so the id passed may be the application's own (a project id).
- **Inputs** — `uploadInputHelper.fromFiles` turns picked or dropped `File`s into inputs with their
  folder paths kept; a body may be a `Blob`/`File`, bytes, a Node stream or a factory that opens a
  fresh stream per attempt.
- **Local disk** — `uploadPathHelper.fromPaths` (`./node`) walks files and folders, skips symbolic
  links, and makes every body a retryable factory.

## Installation

```bash
bun add @owlmeans/client-upload@^0.2.3-alpha.0 @owlmeans/upload@^0.2.3-alpha.0 @owlmeans/client-entrypoint@^0.2.3-alpha.0
```

`@owlmeans/upload` declares the tree; `@owlmeans/client-entrypoint` binds it in the client context
(`bindAll`). The server side is `@owlmeans/server-upload`.

## Quick start

```typescript
import { bindAll } from '@owlmeans/client-entrypoint'
import { makeUploadClient, uploadInputHelper } from '@owlmeans/client-upload'
import { materialProtocols } from './shared/protocols.js'   // makeUploadProtocols(...)

context.registerEntrypoints(bindAll(materialProtocols))      // before configure/init
const uploads = makeUploadClient(context, materialProtocols)  // once — never inside a render

const session = await uploads.open({ expect: { files: input.files.length, bytes: totalBytes } })
const results = await uploads.upload(session.id, uploadInputHelper.fromFiles(input.files), {
  session,                                                   // skips the state call of the precheck
  signal: controller.signal,
  onProgress: (file, overall) => render(file.path, file.state, overall.total > 0 ? overall.loaded / overall.total : 0),
})

results.filter(result => result.refused != null)                                    // refused before sending
results.flatMap(result => result.files).filter(file => file.status === 'rejected')  // refused by the server
results.filter(result => result.error != null)                                      // failed after the retries
await uploads.seal(session.id)
```

## Usage

### From the local disk (Bun, Node)

```typescript
import { uploadPathHelper } from '@owlmeans/client-upload/node'

const inputs = await uploadPathHelper.fromPaths(['./brand', './brief.md'])   // brand/logo.png, brand/fonts/…, brief.md
const nested = await uploadPathHelper.fromPaths(['./site/docs'], { base: './site' })   // docs/… relative to ./site
await uploads.upload(sessionId, [...inputs, ...nested])
```

### Inputs of your own

```typescript
import { createReadStream } from 'node:fs'
import { Readable } from 'node:stream'

await uploads.upload(sessionId, [
  { path: 'docs/brief.md', body: new Blob([markdown], { type: 'text/markdown' }) },
  { path: 'data/report.csv', body: bytes, type: 'text/csv' },
  { path: 'big/video.mp4', body: () => createReadStream(local), size: knownSize },   // a factory: retryable
  { path: 'once/log.txt', body: Readable.from([chunk]), size: chunk.length },        // a stream: sent once, never retried
], { concurrency: 2, retries: 3 })
```

Give `size` for a stream or a factory: the precheck and the server's reservation see it, and the
server can refuse an oversized file before spooling it.

## API

| Export | Purpose |
|---|---|
| `makeUploadClient(ctx, protocols)` | An `UploadClient` over a client-bound `UploadProtocols` tree. |
| `uploadInputHelper` | `fromFiles(files)`, `sizeOf(body)`, `isReusable(body)`, `bodyOf(body)`. |
| `createUploadInputHelper()` | Makes a fresh `UploadInputHelper`. |
| `DEFAULT_UPLOAD_CONCURRENCY` | `3` — inputs in flight at once. |
| `DEFAULT_UPLOAD_RETRIES` | `2` — retries of one input. |
| `UPLOAD_RETRY_DELAY_MS` | `300` — the first pause before a retry; each next one doubles. |
| `UPLOAD_RETRY_STATUSES` | `[408, 425, 429, 500, 502, 503, 504]` — statuses a retry may cure (a failure without a status is retried too). |
| `UploadClient` | `open(request?)`, `state(id)`, `upload(id, inputs, options?)`, `remove(id, fileId)`, `seal(id)`, `abort(id)`. |
| `UploadInput` | `{ path, body, size?, type? }` — one file to upload. |
| `UploadBody` · `UploadBodyFactory` | A `BinaryBody` (Blob, bytes, Node stream) or a function returning one per attempt. |
| `UploadRunOptions` | `concurrency`, `retries`, `onProgress`, `signal`, `session`, `precheck`, `call`. |
| `UploadInputResult` | `{ index, path, files, refused?, error?, status? }` — one per input, in order. |
| `UploadFileProgress` · `UploadFileState` | `{ index, path, loaded, total?, state }`; `queued`, `sending`, `done`, `refused`, `failed`. |
| `UploadOverallProgress` · `UploadProgressListener` | `{ loaded, total, settled, count }`; `(file, overall) => void`. |
| `UploadFileLike` | A browser `File` as read here (`name`, `webkitRelativePath?`, a dropzone's `path?`). |
| `UploadInputHelper` | The input helper's interface. |
| `uploadPathHelper` (`./node`) | `fromPaths(paths, { base? })` — inputs from the local disk. |
| `createUploadPathHelper()` (`./node`) | Makes a fresh `UploadPathHelper`. |
| `UploadPathHelper` · `UploadPathOptions` (`./node`) | The path helper's interface; `{ base? }`. |

## Configuration

`UploadRunOptions` of `upload`:

| Option | Default | Meaning |
|---|---|---|
| `concurrency` | `3` | Inputs in flight at once |
| `retries` | `2` | Retries of one input after a retryable failure |
| `onProgress` | — | Called on every state change and every transport progress event |
| `signal` | — | Aborts the input in flight and every queued one |
| `session` | — | The session as already known: the precheck makes no `state` call |
| `precheck` | `true` | `false` sends without the precheck |
| `call` | — | Added to every `file` call: `timeout`, `auth`, a host (`CallOptions` without `signal` and the progress listeners) |

## Security and limits

- **Precheck first.** Unless `precheck: false`, the client reads the session (one `state` call, or
  `options.session`) and runs `uploadPolicyHelper.precheck` against its policy, totals and accepted
  paths. A refused input (`path-invalid`, `duplicate`, `limits`) is never sent and carries
  `refused`. An archive counts as one file of its own size; the server counts its entries.
- **Normalized paths.** Inputs are sent under the precheck's normalized path; the server
  normalizes again and has the last word.
- **Retries.** After a failure without a status, or with 408, 425, 429, 500, 502, 503 or 504, with a
  pause of 300 ms doubling each time — never after another status (a refusal), never for a one-shot
  stream (pass a factory), never after an abort.
- **Abort.** `signal` fails the input in flight and every queued one with the signal's reason; the
  server releases what it had reserved.
- **Symbolic links.** `fromPaths` never follows them, neither as a given path nor inside a folder.
- **Size.** A stream or a factory is sent without a Content-Length; its declared `size` goes in the
  query, so the server reserves it before reading.

## Related packages

- `@owlmeans/upload` — the contract: the tree, the policy, the precheck rules, the reasons.
- `@owlmeans/server-upload` — what the server does with each file (verification, archives,
  receivers); its `forwardingReceiver` calls a remote tree the same way.
- `@owlmeans/web-upload` — the React queue, drop zone, pickers and list built on this client.
- `@owlmeans/client-entrypoint` — `bindAll`, streamed bodies and `onUploadProgress`;
  `@owlmeans/api` — the transport and `apiStatusHelper` (`./status`).

<!-- owlmeans:agent-guidance:start -->
## Agent guidance

This package ships embedded agent skills under `agent-meta/`. After installing your
`@owlmeans/*` packages, run the OwlMeans agent-skills installer to place them into
your project's skill store (`.agents/skills/`):

```sh
npx @owlmeans/agent-skills@^0.2.3-alpha.0
```

The embedded files are version-matched to this package release. Do not edit them
directly — they are regenerated on each publish. To contribute guidance edits,
open a PR against the source monorepo.
<!-- owlmeans:agent-guidance:end -->
