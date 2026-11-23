---
name: upload
description: "How to use @owlmeans/upload — the browser-safe contract of file and folder uploads: UploadPolicy (count, per-file and total limits counted on the expanded set, archives unpacked, executables refused), UploadSession and UploadedFile with the closed rejection vocabulary (limits, type-mismatch, dangerous, refused-kind, archive-invalid, path-invalid, duplicate), AJV schemas, errors, uploadPolicyHelper (path normalization keeping original names, prechecks) and makeUploadProtocols (open, streamed file, state, remove, seal, abort under any parent, session parameter named by the app). Auto-invoked when declaring upload routes, checking files against limits in a browser, or typing upload sessions and results."
user-invocable: false
---

# @owlmeans/upload

**Layer:** Core
**Install:** `"@owlmeans/upload": "^0.2.3-alpha.0"` in `dependencies`

The contract half of the upload family: what a session accepts, what a received file became, the
rules a path and a list of files are held to, and the protocol tree. Browser-safe: no Node imports,
no I/O; kinds come from `@owlmeans/file-inspector/kinds`. The server is `@owlmeans/server-upload`,
the client `@owlmeans/client-upload`, the React UI `@owlmeans/web-upload`. `ajv` is a peer (the
schemas are typed with `JSONSchemaType`).

## Key Exports

| Export | What it is |
|---|---|
| `UploadPolicy` · `UploadLimits` · `DEFAULT_UPLOAD_POLICY` | `maxFiles` 50, `maxFileBytes` 12 MiB, `maxTotalBytes` 50 MiB, `unpackArchives` true, `refuse` `[FileKind.Executable]`, optional `allow` (frozen default) |
| `UploadSession` | `id`, `status` (`UploadSessionStatus` open/sealed/aborted), `policy`, `files` (accepted and rejected, in decision order), `totals` (accepted only), `createdAt`, `updatedAt`, `sealedAt?`, `abortedAt?` (ISO strings) |
| `UploadedFile` | `id`, `path` (normalized, folders kept), `name`, `size`, `mime?`, `kind?` (`FileKind`), `digest?` (sha256 hex), `status` (`UploadedFileStatus` accepted/rejected), `reason?` (`UploadReason`), `from?` (the archive's path) |
| `UploadReason` | `limits`, `type-mismatch`, `dangerous`, `refused-kind`, `archive-invalid`, `path-invalid`, `duplicate` |
| `UploadOpenRequest` · `UploadFileQuery` · `UploadFileResult` · `UploadSessionParams` · `UploadTotals` | `{ expect? }`; `{ path, size?, type? }`; `{ files }`; `{ [param]: id }`; `{ files, bytes }` |
| `uploadPolicyHelper` · `createUploadPolicyHelper()` · `UploadPolicyHelper` | `normalize(partial?)`, `path(raw)`, `display(raw)`, `pathKey(path)`, `remaining(limits, totals)`, `fits(limits, totals, add)`, `precheck(candidates, policy, { totals?, paths? })` |
| `UploadPathResult` (`UploadPathAccepted` · `UploadPathRefused`) · `UploadPathIssue` | `{ ok: true, path, name }` or `{ ok: false, issue }`; `empty`, `absolute`, `traversal`, `invalid-char`, `too-long`, `too-deep` |
| `UploadCandidate` · `UploadAdmission` · `UploadRefusal` · `UploadPrecheck` · `UploadPrecheckOptions` | `{ path, size }`; `{ index, path, name, size }`; `{ index, path, size, reason, issue? }`; `{ accepted, refused, totals }`; `{ totals?, paths? }` |
| `makeUploadProtocols(opts)` · `UploadProtocolOptions` · `UploadProtocols` · `UploadSessionProtocol` | The tree and its options; any member that addresses one session |
| `uploadSessionParamOf(protocol)` | The session parameter read back from a session member's own route path |
| `UploadSessionSchema`, `UploadedFileSchema`, `UploadPolicySchema`, `UploadTotalsSchema`, `UploadOpenRequestSchema`, `UploadFileQuerySchema`, `UploadFileResultSchema`, `uploadParamsSchema(param, withFile?)` | AJV schemas (`UploadSessionSchema` uses `format: 'date-time'` — add `ajv-formats`) |
| `UploadError` · `UploadSessionNotFoundError` 404 · `UploadSessionStateError` 409 · `UploadLimitError` 422 · `UploadRequestError` 400 · `UploadRejectedError` 422 (`.reason`) · `UploadPolicyError` | Errors (`upload:<area>:<detail>`), each registered with `ResilientError` |
| `UPLOAD_PATH_LIMITS` · `UploadPathLimits` · `UPLOAD_DISPLAY_PATH_LENGTH` | 1024 bytes per path, 255 per segment, 64 segments; 256 chars of a display form |
| `DEFAULT_UPLOAD_ALIAS` · `DEFAULT_UPLOAD_SESSION_PARAM` · `UPLOAD_FILE_PARAM` | `upload`, `session`, `file` |
| `FileKind` | Re-exported from `@owlmeans/file-inspector/kinds` |

## The protocol tree

```typescript
import { makeUploadProtocols } from '@owlmeans/upload'

// Mounted under a parent (its guards and gate inherited); the session is named after the app's own id
export const materialProtocols = makeUploadProtocols({
  alias: 'materials', parent: projectBase, path: '/materials', sessionParam: 'project', maxFileBytes: 12 * 1024 * 1024,
})
```

| Member | Route |
|---|---|
| `open` | POST `<path>` — body `UploadOpenRequest`, answers `UploadSession` |
| `state` | GET `<path>/:session` |
| `file` | PUT `<path>/:session/file?path=…&size=…&type=…` — raw body (`streamBody({ maxBytes: maxFileBytes, types? })`), answers `UploadFileResult` |
| `remove` | DELETE `<path>/:session/file/:file` |
| `seal` · `abort` | POST `<path>/:session/seal`, `…/abort` |

- Options: `alias` (prefix of every route alias, default `upload` — two trees in one context need
  two), `parent` (a protocol or a parent alias), `path`, `service` (set on every route: a remote
  service a client or a forwarding server calls), `sessionParam` (default `session`; must match
  `^[A-Za-z][A-Za-z0-9_]*$` and never be `file`, else `SyntaxError`), `guards`/`gate` (a tree
  without a parent; an ungated tree is a guest upload — the session id is the capability),
  `maxFileBytes` (the route's 413 ceiling, required), `types` (default `application/octet-stream` —
  the file's declared media type travels in the query, the request's content type is the
  transport's).
- An application binds the members it serves: all of them, or only `file` (+ `state`) when the
  server opens sessions itself. `uploadSessionParamOf(tree.file)` gives the parameter name to server
  and client alike — never configure it twice. It throws `SyntaxError` for a member whose path does
  not start with a parameter.
- `UploadProtocols` extends `EntrypointTree`: pass it to `bindAll` (client- or server-entrypoint),
  `protocols()` and `mapProtocols()` (`@owlmeans/entrypoint`).

## Paths

`uploadPolicyHelper.path(raw)` answers `{ ok: true, path, name }` or `{ ok: false, issue }`:
`\` → `/`, NFC, `.` and empty segments dropped, every character of every name kept (spaces, any
script, parentheses). Refused: `absolute` (`/x`, `C:`), `traversal` (`..`), `invalid-char` (C0
controls, DEL, bidi embeddings/overrides/isolates), `too-long` (path > 1024 bytes or a segment > 255,
UTF-8), `too-deep` (> 64 segments), `empty`. `display(raw)` is the form a refused path is shown and
logged in (forbidden characters → `_`, ≤ 256 chars). `pathKey(path)` (NFC, lower-cased) is what two
paths collide on: a session holds one file per key.

## Prechecks

```typescript
const check = uploadPolicyHelper.precheck(files.map(file => ({ path: file.path, size: file.size })), session.policy, {
  totals: session.totals, paths: session.files.filter(file => file.status === 'accepted').map(file => file.path),
})
check.accepted   // [{ index, path, name, size }]
check.refused    // [{ index, path, size, reason, issue? }] — path-invalid, duplicate, limits
check.totals     // after the accepted ones
```

Candidates are taken in order: path, duplicate (against `paths` and earlier candidates), per-file
size, count, total — a refused one takes no room, so later smaller ones can pass. A size that is not
a positive finite number counts as 0. An archive counts as ONE file of its own size: a lower bound
of its expansion, so a precheck never refuses what the server accepts; the server counts the
expanded set.

## Policies and errors

- `normalize(partial)` fills `DEFAULT_UPLOAD_POLICY` and throws `UploadPolicyError(<field>)` for a
  limit that is not a positive safe integer; `refuse`/`allow` are copied.
- `remaining` and `fits` read only `maxFiles` and `maxTotalBytes`; the per-file limit is checked
  separately.
- `UploadRejectedError(reason)` is what a `@owlmeans/server-upload` receiver throws to reject one
  file; `.reason` is parsed back from the message (it survives marshalling) and an unknown value
  reads as `refused-kind`.
- `UploadSessionNotFoundError` covers a missing session AND another owner's session — never tell
  them apart.

## Pitfalls

- The route ceiling (`makeUploadProtocols({ maxFileBytes })`) and the policy's `maxFileBytes` are
  separate: keep the route ceiling ≥ the policy's, or an allowed file answers 413 instead of
  being recorded; a file over the policy but under the route ceiling is recorded `limits`.
- A precheck is a courtesy, never enforcement: the server re-checks everything.
- A session id is at most 128 characters in the schemas; the server also requires one path segment.

## Maintaining this package

- **Tests** — `@owlmeans/upload`, `tests/upload.spec.ts` (category A, offline): policy
  normalization, paths, prechecks, the receiver-rejection reason, the tree's routes and streamed
  body, a parent and a remote service, schema validation with `ajv-formats`.
- **Browser-safe** — never import Node modules or the full `@owlmeans/file-inspector` here; only its
  `./kinds` subpath.
- **The vocabulary is closed** — a new `UploadReason` also needs the intake that produces it in
  `@owlmeans/server-upload` and a `reason.<value>` string in all eight `@owlmeans/web-upload`
  bundles (its i18n spec fails otherwise); schemas enumerate `Object.values`, so they follow.
- **Path rules** stay aligned with `@owlmeans/file-streams`, which writes the files where they land
  (`UPLOAD_PATH_LIMITS`).
- **A new error** extends `UploadError`, sets `typeName`/`httpStatus` and is registered with
  `ResilientError.registerErrorClass`.
- **A new tree member** goes into `UploadProtocols`, then `@owlmeans/server-upload`
  (`UploadHandlers`, `serve`) and `@owlmeans/client-upload` (`UploadClient`).

## Depends On

- `@owlmeans/entrypoint`, `@owlmeans/route` (the tree, `streamBody`), `@owlmeans/error`,
  `@owlmeans/file-inspector` (`./kinds` only); `ajv` (peer, schema types)

## Related

- [[server-upload]] — `@owlmeans/server-upload`: sessions, verification, unpacking, receivers, handlers
- [[client-upload]] — `@owlmeans/client-upload`: browser and Bun client, inputs from files, folders and paths
- [[web-upload]] — `@owlmeans/web-upload`: the React queue, drop zone, pickers and list
- [[file-inspector]] — `FileKind`, what a refusal means
- [[route]] — `streamBody`; [[server-api]] — `streamedBody`; [[entrypoint]] — trees and `mapProtocols`
