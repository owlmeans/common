---
name: upload
description: "How to use @owlmeans/upload — the browser-safe contract of file and folder uploads: UploadPolicy (count, per-file and total limits counted on the expanded set, archives unpacked, executables refused), UploadSession and UploadedFile with the closed rejection vocabulary (limits, type-mismatch, dangerous, refused-kind, archive-invalid, path-invalid, duplicate), AJV schemas, errors, uploadPolicyHelper (path normalization keeping original names, prechecks) and makeUploadProtocols (open, streamed file, state, remove, seal, abort under any parent, session parameter named by the app). Auto-invoked when declaring upload routes, checking files against limits in a browser, or typing upload sessions and results."
user-invocable: false
---
<!-- AUTO-GENERATED — do not edit. Regenerate via sync-agent-meta. -->

# @owlmeans/upload

**Layer:** Core
**Install:** `"@owlmeans/upload": "^0.2.0-alpha.0"` in `dependencies`

The contract half of the upload family: what a session accepts, what a received file became, the
rules a path and a list of files are held to, and the protocol tree. Browser-safe (no Node imports;
kinds come from `@owlmeans/file-inspector/kinds`). The server is `@owlmeans/server-upload`, the
client `@owlmeans/client-upload`, the UI `@owlmeans/web-upload`.

## Key Exports

| Export | What it is |
|---|---|
| `UploadPolicy` · `UploadLimits` · `DEFAULT_UPLOAD_POLICY` | `maxFiles` 50, `maxFileBytes` 12 MiB, `maxTotalBytes` 50 MiB, `unpackArchives` true, `refuse` `[FileKind.Executable]`, optional `allow` |
| `UploadSession` | `id`, `status` (`UploadSessionStatus` open/sealed/aborted), `policy`, `files`, `totals` (accepted only), `createdAt`, `updatedAt`, `sealedAt?`, `abortedAt?` (ISO strings) |
| `UploadedFile` | `id`, `path` (normalized, folders kept), `name`, `size`, `mime?`, `kind?` (`FileKind`), `digest?` (sha256 hex), `status` (`UploadedFileStatus` accepted/rejected), `reason?` (`UploadReason`), `from?` (the archive's path) |
| `UploadReason` | `limits`, `type-mismatch`, `dangerous`, `refused-kind`, `archive-invalid`, `path-invalid`, `duplicate` |
| `UploadOpenRequest` · `UploadFileQuery` · `UploadFileResult` · `UploadSessionParams` · `UploadTotals` | `{ expect? }`; `{ path, size?, type? }`; `{ files }`; `{ [param]: id }`; `{ files, bytes }` |
| `uploadPolicyHelper` | `normalize(partial)`, `path(raw)`, `display(raw)`, `pathKey(path)`, `remaining(policy, totals)`, `fits(policy, totals, add)`, `precheck(candidates, policy, { totals?, paths? })` |
| `makeUploadProtocols(opts)` · `UploadProtocols` · `uploadSessionParamOf(protocol)` | The tree; the session parameter read back from a member's own path |
| `UploadSessionSchema`, `UploadedFileSchema`, `UploadPolicySchema`, `UploadTotalsSchema`, `UploadOpenRequestSchema`, `UploadFileQuerySchema`, `UploadFileResultSchema`, `uploadParamsSchema(param, withFile?)` | AJV schemas |
| `UploadSessionNotFoundError` 404 · `UploadSessionStateError` 409 · `UploadLimitError` 422 · `UploadRequestError` 400 · `UploadRejectedError` 422 (`.reason`) · `UploadPolicyError` | Errors (`upload:<area>:<detail>`) |
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

- Options: `alias` (prefix, default `upload` — two trees in one context need two), `parent`, `path`,
  `service` (set on every route: a remote service a client or a forwarding server calls),
  `sessionParam` (default `session`; a route-parameter name, never `file`), `guards`/`gate` (a tree
  without a parent; an ungated tree is a guest upload — the session id is the capability),
  `maxFileBytes` (the route's 413 ceiling), `types` (default `application/octet-stream` — the file's
  declared media type travels in the query, the request's content type is the transport's).
- An application binds the members it serves: all of them, or only `file` (+ `state`) when the
  server opens sessions itself. `uploadSessionParamOf(tree.file)` gives the parameter name to server
  and client alike — never configure it twice.
- `UploadProtocols` extends `EntrypointTree`: pass it to `bindAll`, `protocols()` and `mapProtocols()`.

## Paths

`uploadPolicyHelper.path(raw)` answers `{ ok: true, path, name }` or `{ ok: false, issue }`:
`\` → `/`, NFC, `.` and empty segments dropped, every character of every name kept (spaces, any
script, parentheses). Refused: `absolute` (`/x`, `C:`), `traversal` (`..`), `invalid-char` (C0
controls, DEL, bidi overrides), `too-long` (path > 1024 bytes or a segment > 255), `too-deep`
(> 64 segments), `empty`. `display(raw)` is the form a refused path is shown and logged in.
`pathKey(path)` (NFC, lower-cased) is what two paths collide on: a session holds one file per key.

## Prechecks

```typescript
const check = uploadPolicyHelper.precheck(files.map(file => ({ path: file.path, size: file.size })), session.policy, {
  totals: session.totals, paths: session.files.filter(file => file.status === 'accepted').map(file => file.path),
})
check.accepted   // [{ index, path, name, size }]
check.refused    // [{ index, path, size, reason, issue? }] — path-invalid, duplicate, limits
check.totals     // after the accepted ones
```

Candidates are taken in order: path, duplicate (against the session and earlier candidates),
per-file size, count, total — a refused one leaves room for later smaller ones. An archive counts as
ONE file of its own size: a lower bound of its expansion, so a precheck never refuses what the server
accepts; the server counts the expanded set.

## Tests

Category A — `tests/upload.spec.ts`: policy normalization, paths, prechecks, the tree's routes and
streamed body, schema validation.

## Depends On

- `@owlmeans/entrypoint`, `@owlmeans/route` (the tree, `streamBody`), `@owlmeans/error`,
  `@owlmeans/file-inspector` (`./kinds` only); `ajv` (peer, schema types)

## Related

- [[server-upload]] — sessions, verification, unpacking, receivers, handlers
- [[client-upload]] — browser and Bun client, inputs from files, folders and paths
- [[file-inspector]] — `FileKind`, what a refusal means
- [[route]] — `streamBody`; [[server-api]] — `streamedBody`
