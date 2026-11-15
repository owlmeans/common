---
name: server-upload
description: "How to use @owlmeans/server-upload — upload sessions on a server: appendUploadService with a session store port and a receiver port, the per-file intake (path check, atomic reservation, spool into a scoped workspace, complete-file verification, refusals deleted and logged, archives unpacked with guards and their entries handled like files, the receiver, the spool removed), createResourceSessionStore over any Resource, treeReceiver and forwardingReceiver, and makeUploadHandlers binding the upload protocol tree with the organization taken server-side. Auto-invoked when accepting files or folders over HTTP, forwarding uploads to another service, or wiring an upload session store."
user-invocable: false
---
<!-- AUTO-GENERATED — do not edit. Regenerate via sync-agent-meta. -->

# @owlmeans/server-upload

**Layer:** Server
**Install:** `"@owlmeans/server-upload": "^0.2.1-alpha.0"` in `dependencies`

Server half of the upload family: the contract is `@owlmeans/upload`, the client
`@owlmeans/client-upload`, the React UI `@owlmeans/web-upload`. Files are verified on THIS service
before they move anywhere; only accepted files reach the application's receiver.

## Key Exports

| Export | What it is |
|---|---|
| `appendUploadService(ctx, options)` · `createUploadService(options)` → `UploadService` | Registers (or only creates) the service; `UploadServiceOptions`: `alias?` (`UPLOAD_SERVICE` = `upload`), `policy?`, `sessions`, `receiver`, `workspace?`, `inspector?`, `archives?`, `transfer?` |
| `UploadService` | `policy()`, `open(UploadOpenInput)`, `get(id)` (404 when missing), `load(id)` (null), `receive(id, UploadIncoming)`, `remove(id, fileId)`, `seal(id)`, `abort(id)` |
| `UploadOpenInput` · `UploadIncoming` | `{ id?, scope, owner?, policy?, expect? }`; `{ path, stream, length?, size?, type?, signal? }` |
| `UploadSessionState` | The wire `UploadSession` plus `scope`, `owner?`, `reserved`, `pending` (path keys in flight), `refs` (receiver refs per file id) |
| `UploadSessionStore` · `UploadReservation` · `UploadReserveOutcome` · `UploadDiscarded` | Port: `create`, `get`, `reserve(id, { files, bytes, paths? })` → `'reserved' \| 'limits' \| 'duplicate' \| 'closed' \| 'missing'`, `release`, `record(id, file, ref?)`, `discard(id, fileId)` → `{ state, file? }`, `status(id, to, from)` |
| `createResourceSessionStore(resource)` · `StoredUploadSession` | The port over any `Resource` (`{ id?, key, state }`) |
| `UploadReceiver` · `UploadReceipt` | Port: `receive(session, file, source)` → `{ ref? }`, optional `remove(session, file, ref?)`, `seal`, `abort` |
| `treeReceiver(tree \| session => tree, { remove?, transfer? })` · `UploadTreeOf` · `TreeReceiverOptions` | Accepted files into a `TreeSink` (directory, S3 prefix, workspace scope) at their paths |
| `forwardingReceiver(ctx, { file, remove?, seal?, abort? }, { paramsOf, call? })` · `ForwardingProtocols` · `ForwardingReceiverOptions` · `ForwardingContext` | Accepted files streamed to another service's `file` route |
| `makeUploadHandlers(service, { scopeOf, ownerOf?, idOf? })` → `UploadHandlers` · `UploadHandlerOptions` · `UploadMember` | `{ open, state, file, remove, seal, abort, serve(tree, members?) }`; `serve` binds the base and the members |
| `uploadSessionView(state)` | The wire view of a state (for handlers of your own) |
| `UPLOAD_SPOOL_FOLDER`, `UPLOAD_UNPACK_FOLDER`, `UPLOAD_REJECTED_RECORDS` (200), `DEFAULT_UPLOAD_WORKSPACE_ROOT`, `UPLOAD_ARCHIVE_ENTRIES_PER_FILE` (4), `UPLOAD_ARCHIVE_ENTRY_MARGIN` (16) | Constants |

## Wiring

```typescript
import { appendUploadService, createResourceSessionStore, forwardingReceiver, makeUploadHandlers } from '@owlmeans/server-upload'
import type { StoredUploadSession } from '@owlmeans/server-upload'
import { makeEntityScope } from '@owlmeans/auth-common'
import type { Resource } from '@owlmeans/resource'

const uploads = appendUploadService(context, {
  policy: { maxFiles: 50, maxFileBytes: 12 * MiB, maxTotalBytes: 50 * MiB },
  sessions: createResourceSessionStore(context.resource<Resource<StoredUploadSession>>('upload-session')),
  receiver: forwardingReceiver(context, agentMaterialProtocols, { paramsOf: session => ({ project: session.id }) }),
})
context.registerEntrypoints(makeUploadHandlers(uploads, {
  // The organization from the authenticated entity, never from the body; one scope per session.
  scopeOf: (request, session) => ({ organization: request.entity?.slug ?? makeEntityScope(request).requireEntityKey(), project: session.id, purpose: 'upload' }),
}).serve(materialProtocols))
```

An application that keys sessions by its own id opens them server-side —
`uploads.open({ id: projectId, scope, owner: makeEntityScope(request).entityKeyOf() })` — and binds
only what the client calls (`serve(tree, ['state', 'file'])`); or it binds `open` with
`idOf(request)` returning that id. `open` is idempotent per owner: the same owner gets the existing
session whatever its status, another owner 409 (`exists`). A session id is one path segment
(`[A-Za-z0-9][A-Za-z0-9._-]*`, ≤ 128, else 400 `UploadRequestError`); the scope is asserted by
`fileScopeHelper`; `expect` that cannot fit is 422 `UploadLimitError`.

A session's `policy` takes the minimum of each limit and the union of `refuse` with the service
policy; `unpackArchives` and `allow`, when given, replace the service's.

## The intake of one file

1. **Path** — `uploadPolicyHelper.path`; refused → recorded `path-invalid` (shown by `display`).
   A declared size over `maxFileBytes` → `limits`, nothing spooled.
2. **Reservation** — `reserve(id, { files: 1, bytes: Content-Length ?? query size ?? 0, paths })`,
   atomic per session: `limits` / `duplicate` → recorded rejected; a closed session → 409. Exact
   across parallel uploads.
3. **Spool** — `transferHelper.copy` into `<scope>/spool/<session>/<file>` under `maxFileBytes`
   (past it → `limits`; sha256 on the way); the reservation is then resized to the counted bytes
   (growing past the total → `limits`). The route itself answers 413 past its own ceiling.
4. **Verification** — `fileInspector.probe` of the COMPLETE file (budget
   `max(maxFileBytes, DEFAULT_PROBE_BYTES)`, so an active PDF is seen whole) against the name and
   declared type, then `enforce({ refuse, allow? })`: `FileMimicryError` → `dangerous` (executable
   under another claim, script under a passive claim, active PDF) or `type-mismatch`;
   `FileKindError` → `refused-kind` (an honest `.wasm`, an ELF without a name). The spool is deleted
   at once, then `log.error('Upload refused', …, { event: 'upload.refused' })` with the session,
   path, `from`, reason, size, claims, detection and reasons — never contents.
5. **Archive** (`unpackArchives`, detected archive/compressed kind that `archiveHelper.detect`
   recognizes: zip, tar, tar.gz, gz) — the archive itself must fit `maxFileBytes`; its reservation is
   released (it is never handed on); nothing left in the session → `limits`. `archiveHelper.extract`
   into `<scope>/unpack/<session>/<file>/` with entry and total bytes ≤ what the session still allows,
   entries ≤ 4 × files left + 16 (directories count), depth 1 (nested archives stay files), links
   skipped. A `LimitError` (other than the ratio) rejects the archive whole with `limits`; a bomb
   (ratio), traversal, duplicate, encrypted or broken archive with `archive-invalid`; a system
   failure (`E…` code) or an abort fails the request. Each entry is then path-checked under the
   archive's folder (`docs/site.zip` → `docs/<entry>`), checked against `maxFileBytes`, reserved
   (entries past the count are `limits`), verified (no declared type) and delivered like an upload,
   with `from` set; skipped entries (links, devices) are recorded `archive-invalid`.
6. **Receiver** — only while the session is still open; `UploadRejectedError(reason)` from it records
   the file rejected with that reason, any other error fails the request (nothing recorded, the
   client may retry). Then `record`, which counts the file only if the session is still open (else
   the receiver's `remove` and 409).
7. **Cleanup** — the spool and unpack folders removed, the reservation released unless recorded;
   the answer is `{ files }` — one row, or every entry of an archive (or the archive, rejected). A
   request body nobody read is drained first, so a client that is still sending gets the answer.

Rejected rows are kept in the session (up to `UPLOAD_REJECTED_RECORDS`; past it a rejection is
answered, not recorded), never counted in `totals`.

## Sessions

- `remove(id, fileId)`: only an open session; an accepted file → receiver `remove` (with its ref),
  then its totals and reservation are given back; a rejected row is just dropped; an unknown id
  answers the session unchanged.
- `seal` / `abort`: open → sealed / aborted, idempotent; a sealed session refuses `abort` and an
  aborted one `seal` (409); files and removals after either are 409. Both clean the session's spool
  and drop the scope folder when nothing else is in it, then call the receiver's `seal` / `abort`
  (once — a repeated call answers the session as it is). A file in flight when the session closes is
  answered 409 and keeps nothing.
- Handlers: the session parameter is read from each protocol's path; `ownerOf(request)` (default
  `makeEntityScope(request).entityKeyOf()`, the organization entity's stable key) is compared on every
  request — a session another owner opened is 404, like a missing one. Clients never set the owner,
  scope or policy: `open` takes only `expect` from the body.

## Stores

`createResourceSessionStore(resource)` keeps `{ key: sessionId, state }` (give `key` a unique index;
the backend mints `id`) and runs every member under a per-session lock of the process — exact for
one process. `Resource` has no conditional write: across replicas route a session to one replica, or
implement `UploadSessionStore` over the backend's atomic primitive (a guarded Mongo
`findOneAndUpdate`, a Postgres row lock, a Redis transaction).

## Receivers

- `treeReceiver(tree)` copies the source into `tree.entry(file.path)` under `maxFileBytes`; `ref` is
  the sink location. A tree cannot delete: pass `remove` when the application can (a directory:
  `rm(ref)`), and give a directory sink `onConflict: 'overwrite'` so a path removed and sent again can
  be written.
- `forwardingReceiver(ctx, remoteTree, { paramsOf })` streams the accepted file as a raw body with
  `path`, `size` and `type` in the query to a tree client-bound in `ctx` (declared with the remote
  `service`). The remote session must exist (opened by that service, keyed by the same id); give that
  service `unpackArchives: false` — anything but exactly one accepted file there rejects the file
  here (the remote's reason, else `refused-kind`; its accepted rows removed). `ref` is the remote file
  id; `remove`, `seal` and `abort` are mirrored when the tree carries them. A remote error fails the
  request.

## Pitfalls

- A server-opened session must carry the `owner` the handlers compute (`ownerOf`, default
  `entityKeyOf()`), or every request is 404.
- Keep the route ceiling (`makeUploadProtocols({ maxFileBytes })`) ≥ the policy's `maxFileBytes`.
- `scopeOf` must give each session its own scope (a per-session `purpose` or `project`): seal and
  abort drop the scope when it is empty.

## Maintaining this package

- **Tests** — `@owlmeans/server-upload`, category C, offline. `tests/context.ts` boots two server
  contexts over HTTP (A: two organizations' trees on one service with a tree receiver, plus a
  forwarding service; B: a guest tree without unpacking that receives the forwards) and a client
  with mock guards (`@owlmeans/test-auth`); `tests/fixtures.ts` builds the files. `intake.spec.ts`
  (kinds, paths, mismatch + log, executables, archives), `limits.spec.ts` (count, 413, parallel
  total, archive bounds, announcement), `sessions.spec.ts` (remove, seal, abort, tenancy, aborts
  mid-file), `receivers.spec.ts` (forwarding, nested archive, mirroring, remote rejection).
- **Invariants** — nothing reaches a receiver unverified; an archive is never delivered, only its
  entries; every reservation is released once or consumed by `record` (`makeHeldReservation`);
  every store member is atomic per session id; refusals log names and claims, never contents; the
  spool is removed in a `finally`.
- **Extending** — a new destination is an `UploadReceiver` (throw `UploadRejectedError` for a
  vocabulary refusal); a new backend is an `UploadSessionStore` whose `reserve`, `record`, `discard`
  and `status` decide and write atomically; a new reason starts in `@owlmeans/upload`.

## Depends On

- `@owlmeans/upload`, `@owlmeans/file-streams`, `@owlmeans/file-inspector`, `@owlmeans/storage-common`
  (`FileScope`), `@owlmeans/server-api` (`handlers`, `streamedBody`), `@owlmeans/server-entrypoint`,
  `@owlmeans/auth-common`, `@owlmeans/resource`, `@owlmeans/context`, `@owlmeans/log`, `@owlmeans/entrypoint`

## Related

- [[upload]] — `@owlmeans/upload`: the contract, reasons, prechecks, the protocol tree
- [[client-upload]] — `@owlmeans/client-upload`: the client that drives these routes
- [[web-upload]] — `@owlmeans/web-upload`: the React queue that sends through the client
- [[file-streams]] — workspaces, transfers, archive guards; [[file-inspector]] — verdicts
- [[logging]] — scopes `server-upload`, `server-upload:intake`, `server-upload:forwarding`
