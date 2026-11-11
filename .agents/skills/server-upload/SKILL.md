---
name: server-upload
description: "How to use @owlmeans/server-upload — upload sessions on a server: appendUploadService with a session store port and a receiver port, the per-file intake (path check, atomic reservation, spool into a scoped workspace, complete-file verification, refusals deleted and logged, archives unpacked with guards and their entries handled like files, the receiver, the spool removed), createResourceSessionStore over any Resource, treeReceiver and forwardingReceiver, and makeUploadHandlers binding the upload protocol tree with the organization taken server-side. Auto-invoked when accepting files or folders over HTTP, forwarding uploads to another service, or wiring an upload session store."
user-invocable: false
---

# @owlmeans/server-upload

**Layer:** Server
**Install:** `"@owlmeans/server-upload": "^0.2.0-alpha.0"` in `dependencies`

Server half of the upload family (contract: `/upload`). Files are verified on THIS service before
they move anywhere; only accepted files reach the application's receiver.

## Key Exports

| Export | What it is |
|---|---|
| `appendUploadService(ctx, { alias?, policy?, sessions, receiver, workspace?, inspector?, archives?, transfer? })` → `UploadService` | Registers the service (alias `upload`, `UPLOAD_SERVICE`) and answers it |
| `UploadService` | `policy()`, `open({ id?, scope, owner?, policy?, expect? })`, `get(id)`, `load(id)`, `receive(id, { path, stream, length?, size?, type?, signal? })`, `remove(id, fileId)`, `seal(id)`, `abort(id)` |
| `UploadSessionState` | The wire `UploadSession` plus `scope`, `owner?`, `reserved`, `pending`, `refs` (receiver refs per file id) |
| `UploadSessionStore` | Port: `create`, `get`, `reserve(id, { files, bytes, paths? })` → `'reserved' \| 'limits' \| 'duplicate' \| 'closed' \| 'missing'`, `release`, `record(id, file, ref?)`, `discard(id, fileId)`, `status(id, to, from)` |
| `createResourceSessionStore(resource)` · `StoredUploadSession` | The port over any `Resource` (`{ id?, key, state }`) |
| `UploadReceiver` · `UploadReceipt` | Port: `receive(session, file, source)` → `{ ref? }`, optional `remove(session, file, ref?)`, `seal`, `abort` |
| `treeReceiver(tree \| session => tree, { remove?, transfer? })` | Accepted files into a `TreeSink` (directory, S3 prefix, workspace scope) at their paths |
| `forwardingReceiver(ctx, { file, remove?, seal?, abort? }, { paramsOf, call? })` | Accepted files streamed to another service's `file` route |
| `makeUploadHandlers(service, { scopeOf, ownerOf?, idOf? })` → `{ open, state, file, remove, seal, abort, serve(tree, members?) }` | HTTP handlers; `serve` binds the base and the members |
| `uploadSessionView(state)` | The wire view of a state (for handlers of your own) |
| `UPLOAD_SPOOL_FOLDER`, `UPLOAD_UNPACK_FOLDER`, `UPLOAD_REJECTED_RECORDS`, `DEFAULT_UPLOAD_WORKSPACE_ROOT` | Constants |

## Wiring

```typescript
import { appendUploadService, createResourceSessionStore, forwardingReceiver, makeUploadHandlers } from '@owlmeans/server-upload'
import { makeEntityScope } from '@owlmeans/auth-common'

const uploads = appendUploadService(context, {
  policy: { maxFiles: 50, maxFileBytes: 12 * MiB, maxTotalBytes: 50 * MiB },
  sessions: createResourceSessionStore(context.resource('upload-session')),
  receiver: forwardingReceiver(context, agentMaterialProtocols, { paramsOf: session => ({ project: session.id }) }),
})
context.registerEntrypoints(makeUploadHandlers(uploads, {
  // The organization from the authenticated entity, never from the body; one purpose per session.
  scopeOf: (request, session) => ({ organization: request.entity?.slug ?? makeEntityScope(request).requireEntityKey(), project: session.id, purpose: 'upload' }),
}).serve(materialProtocols))
```

An application that keys sessions by its own id opens them server-side —
`uploads.open({ id: projectId, scope, owner })` — and binds only `file`/`state` (`serve(tree, ['file', 'state'])`);
or it binds `open` with `idOf(request)` returning that id (re-opening by the same owner answers the
existing session). A session id is one path segment (`[A-Za-z0-9][A-Za-z0-9._-]*`, ≤ 128).

## The intake of one file

1. **Path** — `uploadPolicyHelper.path`; refused → recorded `path-invalid` (shown by `display`).
2. **Reservation** — `reserve(id, { files: 1, bytes: Content-Length ?? query size ?? 0, paths })`,
   atomic per session: `limits` / `duplicate` → recorded rejected; a closed session → 409. Exact
   across parallel uploads.
3. **Spool** — `transferHelper.copy` into `<scope>/spool/<session>/<file>` under `maxFileBytes`
   (sha256 on the way); the reservation is then resized to the counted bytes. The route itself
   answers 413 past its `maxFileBytes`.
4. **Verification** — `fileInspector.probe` of the COMPLETE file (budget = `maxFileBytes`, so an
   active PDF is seen whole) against the name and declared type, then `enforce(policy)`:
   `FileMimicryError` → `dangerous` (executable under another claim, script under a passive claim,
   active PDF) or `type-mismatch`; `FileKindError` → `refused-kind` (an honest `.wasm`, an ELF without
   a name). The spool is deleted at once, then `log.error('Upload refused', { session, path, from?,
   reason, size, declared, detected, reasons, error }, { event: 'upload.refused' })` — never contents.
5. **Archive** (`unpackArchives`, detected zip/tar/tar.gz/gz) — its own reservation released (the
   archive is never handed on); `archiveHelper.extract` into `<scope>/unpack/<session>/<file>/` with
   bytes ≤ what the session still allows and entries ≤ 4 × files left + 16 (directories count),
   depth 1 (nested archives stay files), links skipped. Past those bounds the archive is rejected
   whole with `limits`; a bomb, traversal, broken or encrypted archive with `archive-invalid`. Each
   entry is then path-checked under the archive's folder (`docs/site.zip` → `docs/<entry>`), reserved
   (entries past the count are `limits`), verified and delivered like an upload, with `from` set;
   skipped link entries are recorded `archive-invalid`.
6. **Receiver** — only while the session is still open; `UploadRejectedError(reason)` from it records
   the file rejected with that reason, any other error fails the request (nothing recorded, the
   client may retry). Then `record`, which counts the file only if the session is still open (else
   the receiver's `remove` and 409).
7. **Cleanup** — the spool and unpack folders removed; the answer is `{ files }` — one row, or every
   entry of an archive (or the archive, rejected). A request body nobody read is drained first, so a
   client that is still sending gets the answer.

Rejected rows are kept in the session (up to `UPLOAD_REJECTED_RECORDS`), never counted in `totals`.

## Sessions

- `remove(id, fileId)`: only an open session; an accepted file → receiver `remove` (with its ref),
  then its totals and reservation are given back; a rejected row is just dropped; an unknown id
  answers the session unchanged.
- `seal` / `abort`: open → sealed / aborted, idempotent; a sealed session refuses `abort` and an
  aborted one `seal` (409); files and removals after either are 409. Both clean the session's spool
  and drop the scope folder when nothing else is in it, then call the receiver's `seal` / `abort`.
  A file in flight when the session closes is answered 409 and keeps nothing.
- Handlers: the session parameter is read from each protocol's path; `ownerOf(request)` (default
  `makeEntityScope(request).entityKeyOf()`, the organization's stable key) is compared on every
  request — a session another owner opened is 404, like a missing one.

## Stores

`createResourceSessionStore(resource)` keeps `{ key: sessionId, state }` (give `key` a unique index; the
backend mints `id`), and reads, decides and writes every member under a per-session lock of the
process: exact for everything one process serves. The `Resource` contract has no conditional write,
so across replicas either route a session's requests to one replica or implement
`UploadSessionStore` over the backend's own atomic primitive (Mongo `findOneAndUpdate` guarded by the
limits, a Postgres row lock, a Redis transaction).

## Receivers

- `treeReceiver(tree)` copies the source into `tree.entry(file.path)`; `ref` is the sink location. A
  tree cannot delete: pass `remove` when the application can (a directory: `rm(ref)`), and give a
  directory sink `onConflict: 'overwrite'` so a path removed and sent again can be written.
- `forwardingReceiver(ctx, remoteTree, { paramsOf })` streams the accepted file as a raw body with
  `path`, `size` and `type` in the query to a tree client-bound in `ctx`. The remote session must
  exist (opened by that service, keyed by the same id); give that service `unpackArchives: false`
  — anything but exactly one accepted file there rejects the file here (the remote's reason, its
  accepted rows removed). `ref` is the remote file id; `remove`, `seal` and `abort` are mirrored
  when the tree carries them.

## Tests

Category C, offline: `tests/context.ts` boots two real server contexts over HTTP (A: two
organizations' trees over one service with a tree receiver, plus a forwarding service; B: a guest
tree receiving the forwards) and a client context with mock guards (`@owlmeans/test-auth`).
`intake` (accepted kinds and paths, mismatch + log, executables, zip/tar.gz, paths), `limits`
(count, 413 both ways, parallel total, archive bounds, announcement), `sessions` (remove, seal,
abort, tenancy, client abort, a session closed mid-file), `receivers` (forwarding, mirrored removal
and seal, remote rejection).

## Depends On

- `@owlmeans/upload`, `@owlmeans/file-streams` (workspace, transfer, archives),
  `@owlmeans/file-inspector`, `@owlmeans/storage-common` (`FileScope`), `@owlmeans/server-api`
  (`handlers`, `streamedBody`), `@owlmeans/server-entrypoint`, `@owlmeans/auth-common`,
  `@owlmeans/resource`, `@owlmeans/context`, `@owlmeans/log`, `@owlmeans/entrypoint`

## Related

- [[upload]] — the contract, reasons, prechecks, the protocol tree
- [[client-upload]] — the client that drives these routes
- [[file-streams]] — workspaces, transfers, archive guards; [[file-inspector]] — verdicts
- [[logging]] — scopes `server-upload`, `server-upload:intake`, `server-upload:forwarding`
