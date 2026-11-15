# @owlmeans/server-upload

Uploads on an OwlMeans server, verified before they move anywhere. It keeps upload sessions, takes
each file of the `@owlmeans/upload` protocol tree through one intake — path check, an atomic
reservation against the session's limits, a spool into a scoped temporary workspace, verification
of the complete file, archive unpacking — and hands only accepted files to the application's
receiver. The HTTP handlers bind the tree with the session owner and the file scope taken
server-side.

- **Sessions** — `appendUploadService`: open (idempotent per owner), remove, seal and abort; limits
  counted on the expanded set and reserved atomically, so parallel uploads never pass them; a session
  belongs to the owner that opened it (the organization entity by default).
- **Intake** — each file spooled under `<scope>/spool/<session>/<file>`, hashed (sha256), probed as
  a whole by `@owlmeans/file-inspector`; a type that does not match its name, executable or active
  content is deleted at once and logged. Archives (zip, tar, tar.gz, gz) are unpacked with guards
  and their entries handled like uploads, original paths kept.
- **Stores** — the `UploadSessionStore` port and `createResourceSessionStore` over any OwlMeans
  `Resource` (static, Redis, Mongo, Postgres), exact for everything one process serves.
- **Receivers** — the `UploadReceiver` port: `treeReceiver` writes accepted files into a directory,
  an S3 prefix or a workspace scope; `forwardingReceiver` streams them to another service's upload
  route.
- **Handlers** — `makeUploadHandlers(service, options).serve(tree)`: every member bound, a stranger's
  session answered 404 like a missing one.

## Installation

```bash
bun add @owlmeans/server-upload@^0.2.1-alpha.0 @owlmeans/upload@^0.2.1-alpha.0 @owlmeans/file-streams@^0.2.1-alpha.0
```

`@owlmeans/upload` declares the tree (shared with the client), `@owlmeans/file-streams` gives the
sinks a receiver writes into. Sessions need a `Resource` — `@owlmeans/static-resource` in tests, a
Redis, Mongo or Postgres resource package in production.

## Quick start

```typescript
import { rm } from 'node:fs/promises'
import { makeEntityScope } from '@owlmeans/auth-common'
import { createDirectorySink } from '@owlmeans/file-streams'
import {
  appendUploadService, createResourceSessionStore, makeUploadHandlers, treeReceiver,
} from '@owlmeans/server-upload'
import type { StoredUploadSession } from '@owlmeans/server-upload'
import type { Resource } from '@owlmeans/resource'
import { materialProtocols } from './shared/protocols.js'   // makeUploadProtocols(...)

const MiB = 1024 * 1024

const uploads = appendUploadService(context, {
  policy: { maxFiles: 50, maxFileBytes: 12 * MiB, maxTotalBytes: 50 * MiB },
  sessions: createResourceSessionStore(context.resource<Resource<StoredUploadSession>>('upload-session')),
  receiver: treeReceiver(
    session => createDirectorySink(`/data/uploads/${session.id}`, { onConflict: 'overwrite' }),
    { remove: async (_session, _file, ref) => { if (ref != null) await rm(ref, { force: true }) } },
  ),
})

context.registerEntrypoints(makeUploadHandlers(uploads, {
  // The organization from the authenticated request, never from the body; one scope per session.
  scopeOf: (request, session) => ({
    organization: request.entity?.slug ?? makeEntityScope(request).requireEntityKey(),
    purpose: `upload-${session.id}`,
  }),
}).serve(materialProtocols))
```

## Usage

### Sessions keyed by the application's own id

An application that keys sessions by its own record opens them server-side and serves only the
members the client needs:

```typescript
const session = await uploads.open({
  id: project.id,                                            // one path segment, ≤ 128
  scope: { organization: entitySlug, project: project.id, purpose: 'upload' },
  owner: makeEntityScope(request).entityKeyOf(),             // what the handlers compare on every request
  policy: { maxFiles: 20 },                                  // narrows the service policy
  expect: { files: 3, bytes: 4 * MiB },                      // refused up front (422) when it cannot fit
})

context.registerEntrypoints(makeUploadHandlers(uploads, { scopeOf }).serve(projectMaterials, ['state', 'file', 'remove', 'seal']))
```

Or serve `open` too and give the handlers an `idOf(request)` that answers the application's id (from
the parent route's params or the authenticated request): re-opening by the same owner answers the
existing session, whatever its status; an id another owner holds answers 409.

### Forwarding accepted files to another service

```typescript
import { bindAll } from '@owlmeans/client-entrypoint'
import { forwardingReceiver } from '@owlmeans/server-upload'
import { makeUploadProtocols } from '@owlmeans/upload'

// The other service's tree, declared on its service and bound client-side in this context
const agentMaterials = makeUploadProtocols({ alias: 'agent-materials', path: '/materials', service: 'agent', maxFileBytes: 12 * MiB })
context.registerEntrypoints(bindAll(agentMaterials))

const forwarding = appendUploadService(context, {
  alias: 'upload-forward',
  sessions: createResourceSessionStore(context.resource<Resource<StoredUploadSession>>('upload-forward-session')),
  receiver: forwardingReceiver(context, agentMaterials, { paramsOf: session => ({ session: session.id }) }),
})
```

The remote session must exist already (opened by that service under the same id), and that service
should run with `unpackArchives: false`: anything but exactly one accepted file there rejects the file
here with the remote's reason. `remove`, `seal` and `abort` are mirrored when the remote tree carries
them.

### A receiver of your own

```typescript
import { UploadReason, UploadRejectedError } from '@owlmeans/upload'
import type { UploadReceiver } from '@owlmeans/server-upload'

const receiver: UploadReceiver = {
  receive: async (session, file, source) => {
    if (await names.taken(session.id, file.path)) throw new UploadRejectedError(UploadReason.Duplicate)
    const { stream } = await source.open()
    return { ref: await store.put(file.path, stream, file.mime) }   // handed back to remove
  },
  remove: async (session, file, ref) => { if (ref != null) await store.delete(ref) },
}
```

`UploadRejectedError` records the file rejected with that reason; any other error fails the request
(nothing recorded, the client may retry).

## API

| Export | Purpose |
|---|---|
| `appendUploadService(ctx, options)` | Creates the service, registers it on the context, answers it. |
| `createUploadService(options)` | Creates the service without registering it. |
| `createResourceSessionStore(resource)` | An `UploadSessionStore` over a `Resource<StoredUploadSession>`, serialized per session in this process. |
| `treeReceiver(tree \| sessionToTree, options?)` | Accepted files copied into a `TreeSink` at their own paths; `ref` = the sink location. |
| `forwardingReceiver(ctx, protocols, options)` | Accepted files streamed to another service's `file` route; `ref` = the remote file id. |
| `makeUploadHandlers(service, options)` | Handlers for each member and `serve(tree, members?)`, ready for `registerEntrypoints`. |
| `uploadSessionView(state)` | The wire `UploadSession` of a state (no scope, owner, reservations or refs). |
| `UPLOAD_SERVICE` | `'upload'` — the default service alias. |
| `UPLOAD_SPOOL_FOLDER` · `UPLOAD_UNPACK_FOLDER` | `'spool'`, `'unpack'` — folders of a scope the intake uses. |
| `DEFAULT_UPLOAD_WORKSPACE_ROOT` | `'owlmeans-upload'` — the workspace root under `os.tmpdir()` by default. |
| `UPLOAD_REJECTED_RECORDS` | `200` — rejected rows a session keeps. |
| `UPLOAD_ARCHIVE_ENTRIES_PER_FILE` · `UPLOAD_ARCHIVE_ENTRY_MARGIN` | `4`, `16` — entries an archive may carry: 4 per file still allowed, plus 16. |
| `UploadService` | `policy()`, `open(input)`, `get(id)`, `load(id)`, `receive(id, incoming)`, `remove(id, fileId)`, `seal(id)`, `abort(id)`. |
| `UploadServiceOptions` | `alias?`, `policy?`, `sessions`, `receiver`, `workspace?`, `inspector?`, `archives?`, `transfer?`. |
| `UploadOpenInput` | `{ id?, scope, owner?, policy?, expect? }`. |
| `UploadIncoming` | `{ path, stream, length?, size?, type?, signal? }` — one file arriving. |
| `UploadSessionState` | The wire session plus `scope`, `owner?`, `reserved`, `pending`, `refs`. |
| `UploadSessionStore` | The store port: `create`, `get`, `reserve`, `release`, `record`, `discard`, `status` — each atomic per session. |
| `UploadReservation` · `UploadReserveOutcome` | `{ files, bytes, paths? }`; `reserved`, `limits`, `duplicate`, `closed`, `missing`. |
| `UploadDiscarded` | `{ state, file? }` — what `discard` answers. |
| `StoredUploadSession` | The resource record: `{ id?, key, state }` (give `key` a unique index). |
| `UploadReceiver` · `UploadReceipt` | The receiver port (`receive`, optional `remove`, `seal`, `abort`); `{ ref? }`. |
| `UploadTreeOf` · `TreeReceiverOptions` | `session => TreeSink`; `{ remove?, transfer? }`. |
| `ForwardingProtocols` · `ForwardingReceiverOptions` · `ForwardingContext` | `file` plus optional `remove`/`seal`/`abort`; `{ paramsOf, call? }`; a context with the remote tree bound. |
| `UploadHandlerOptions` · `UploadHandlers` · `UploadMember` | `{ scopeOf, ownerOf?, idOf? }`; the handlers; a served member name. |

## Configuration

`UploadServiceOptions`:

| Option | Default | Meaning |
|---|---|---|
| `alias` | `upload` | Service alias (two services in one context need two) |
| `policy` | `DEFAULT_UPLOAD_POLICY` | The policy every session starts from (normalized; a bad limit throws `UploadPolicyError`) |
| `sessions` | required | The `UploadSessionStore` |
| `receiver` | required | The `UploadReceiver` accepted files go to |
| `workspace` | `createWorkspace({ root: 'owlmeans-upload' })` | Where files are spooled (under `os.tmpdir()`) |
| `inspector` · `archives` · `transfer` | `@owlmeans/file-streams` defaults | Verification, extraction, copying |

A session's own policy (`open({ policy })`) takes the minimum of each limit and the union of `refuse`
with the service policy; `unpackArchives` and `allow`, when given, are the session's.

`UploadHandlerOptions`:

| Option | Default | Meaning |
|---|---|---|
| `scopeOf(request, { id })` | required | The `FileScope` a new session spools under — server-side, one per session (the scope is cleaned when the session ends) |
| `ownerOf(request)` | `makeEntityScope(request).entityKeyOf()` | Who may use a session; `undefined` makes it a guest session |
| `idOf(request)` | a random UUID | The id `open` creates — an application's own |

## Security and limits

- **Path first.** A path the `@owlmeans/upload` rules refuse is recorded `path-invalid` under its
  display form; nothing is read.
- **Atomic reservation.** Each file reserves one file, its declared bytes (Content-Length, else the
  query `size`, else 0) and its path key before a byte is spooled; the reservation is resized to the
  bytes counted. `limits` and `duplicate` are recorded rejections, a closed session answers 409.
  Parallel uploads never pass the count, the total or a path.
- **Bounded spool.** The copy stops at the policy's `maxFileBytes` (`limits`); the route answers 413
  past its own ceiling; a file declared larger than `maxFileBytes` is rejected without being spooled.
- **Complete-file verification.** `probe` with a budget of at least `maxFileBytes`, then `enforce`
  of `refuse`/`allow`: a mimicry is `dangerous` (executable under another claim, a script under a
  passive claim, an active PDF) or `type-mismatch`, a refused kind is `refused-kind`. The spool is
  deleted at once and `upload.refused` is logged with names, claims and detections — never contents.
- **Archives.** Unpacked only when `unpackArchives` is set and the bytes are an archive. The archive
  itself is never handed on: its reservation is released and each entry is checked, reserved,
  verified and delivered like an upload, with `from` set and its path under the archive's folder.
  Extraction is bounded by what the session still allows (bytes, and 4 entries per file left + 16),
  depth 1 (a nested archive stays a file), links and devices skipped and recorded `archive-invalid`.
  Past those bounds the archive is rejected whole with `limits`; a bomb (ratio), traversal,
  duplicate, encrypted or broken archive with `archive-invalid`.
- **Closed sessions take nothing.** A session sealed or aborted while a file is in flight answers
  409; the receiver never sees the file, or — when the session closed after the receiver took it —
  is asked to `remove` it.
- **Tenancy.** The handlers compare `ownerOf(request)` with the session's owner on every request; a
  stranger gets 404, like a missing session. Clients never set the owner, the scope or the policy.
- **Rejected rows** are kept up to `UPLOAD_REJECTED_RECORDS` per session and never count in
  `totals`.
- **Cleanup.** Spool and unpack folders are removed after each file; seal and abort remove the
  session's folders and drop the scope when nothing else is in it. An unread request body is drained
  so a client still sending receives the answer.
- **Across replicas.** `createResourceSessionStore` locks per session inside one process. Route a
  session's requests to one replica, or implement `UploadSessionStore` over the backend's own atomic
  primitive.

## Related packages

- `@owlmeans/upload` — the contract: policy, reasons, prechecks, the protocol tree.
- `@owlmeans/client-upload` — the client that drives these routes (browser and Bun).
- `@owlmeans/web-upload` — the React queue and parts that send through the client.
- `@owlmeans/file-streams` — workspaces, transfers, archive guards, sinks.
- `@owlmeans/file-inspector` — verdicts, kinds, active-PDF detection.
- `@owlmeans/storage-common` (`FileScope`), `@owlmeans/server-api` (`streamedBody`),
  `@owlmeans/auth-common` (`makeEntityScope`), `@owlmeans/resource`.

<!-- owlmeans:agent-guidance:start -->
## Agent guidance

This package ships embedded agent skills under `agent-meta/`. After installing your
`@owlmeans/*` packages, run the OwlMeans agent-skills installer to place them into
your project's skill store (`.agents/skills/`):

```sh
npx @owlmeans/agent-skills@^0.2.1-alpha.0
```

The embedded files are version-matched to this package release. Do not edit them
directly — they are regenerated on each publish. To contribute guidance edits,
open a PR against the source monorepo.
<!-- owlmeans:agent-guidance:end -->
