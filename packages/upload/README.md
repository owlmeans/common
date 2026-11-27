# @owlmeans/upload

The browser-safe contract of file and folder uploads in OwlMeans apps. It defines what an upload
session accepts, what became of each received file, the rules a path and a list of files are held
to, and the protocol tree a server binds and a client calls. It has no Node imports and does no I/O:
the server is `@owlmeans/server-upload`, the client `@owlmeans/client-upload`, the React UI
`@owlmeans/web-upload`.

- **Policy** — `UploadPolicy`: how many files, how large each, how large all together (counted on
  the expanded set: an archive's entries, not the archive), whether archives are unpacked, which
  file kinds are refused or allowed. `DEFAULT_UPLOAD_POLICY` fills what an application leaves out.
- **Sessions and files** — `UploadSession` and `UploadedFile`: original relative paths kept, the
  detected media type and kind, a sha256 digest, and a closed rejection vocabulary
  (`UploadReason`: `limits`, `type-mismatch`, `dangerous`, `refused-kind`, `archive-invalid`,
  `path-invalid`, `duplicate`).
- **Rules** — `uploadPolicyHelper`: policy normalization, path normalization that keeps every name
  as written, a display form for refused paths, the case-insensitive collision key, and the
  precheck a browser runs before it sends anything.
- **Protocols** — `makeUploadProtocols`: `open`, a streamed `file` route, `state`, `remove`,
  `seal` and `abort`, mountable under any parent, with the session route parameter named after the
  application's own id when it wants.
- **Schemas and errors** — AJV schemas of every wire shape and the `UploadError` family, registered
  with `@owlmeans/error` so they survive marshalling.

## Installation

```bash
bun add @owlmeans/upload@^0.2.4-rc.0 ajv
```

`ajv` is a peer dependency (the schemas are typed with its `JSONSchemaType`). Add
`@owlmeans/server-upload`, `@owlmeans/client-upload` or `@owlmeans/web-upload` (same version) on the
side that serves, sends or renders the uploads.

## Quick start

Declare the tree once, in a module both the server and the client import:

```typescript
import { DEFAULT_GUARD } from '@owlmeans/auth-common'
import { makeUploadProtocols } from '@owlmeans/upload'

const MiB = 1024 * 1024

export const materialProtocols = makeUploadProtocols({
  alias: 'materials',          // route aliases materials:open, materials:file, …
  path: '/materials',
  guards: DEFAULT_GUARD,       // a tree without a parent carries its own guards (or a gate)
  maxFileBytes: 12 * MiB,      // the file route answers 413 past it
})
```

| Member | Route |
|---|---|
| `open` | `POST <path>` — body `UploadOpenRequest`, answers `UploadSession` |
| `state` | `GET <path>/:session` |
| `file` | `PUT <path>/:session/file?path=…&size=…&type=…` — raw body, answers `UploadFileResult` |
| `remove` | `DELETE <path>/:session/file/:file` |
| `seal` | `POST <path>/:session/seal` |
| `abort` | `POST <path>/:session/abort` |

## Usage

### Mount under a parent, name the session after your own id

```typescript
import { makeUploadProtocols, uploadSessionParamOf } from '@owlmeans/upload'

export const projectMaterials = makeUploadProtocols({
  alias: 'project-materials',
  parent: projectBase,          // a protocol (or a parent alias): its guards and gate are inherited
  path: '/materials',
  sessionParam: 'project',      // PUT …/materials/:project/file
  maxFileBytes: 12 * MiB,
})

uploadSessionParamOf(projectMaterials.file)   // 'project' — servers and clients read it, never configure it twice
```

Two trees in one context need two `alias` values. `service` puts every route on a remote service
(what a client of another service, or a forwarding server, calls). `types` replaces the accepted
transport content types (default `application/octet-stream`; the file's own declared type travels
in the `type` query parameter).

### Precheck files in a browser before sending

```typescript
import { UploadedFileStatus, uploadPolicyHelper } from '@owlmeans/upload'

const check = uploadPolicyHelper.precheck(
  picked.map(file => ({ path: file.webkitRelativePath || file.name, size: file.size })),
  session.policy,
  {
    totals: session.totals,
    paths: session.files.filter(file => file.status === UploadedFileStatus.Accepted).map(file => file.path),
  },
)
check.accepted   // [{ index, path, name, size }] — path normalized
check.refused    // [{ index, path, size, reason, issue? }] — 'path-invalid' | 'duplicate' | 'limits'
check.totals     // the totals once every accepted candidate is counted
```

Candidates are taken in order: path, duplicate (against the session and earlier candidates),
per-file size, count, total. A refused candidate takes no room, so a later smaller one can still
pass. An archive counts as one file of its own size — a lower bound of its expansion, so a precheck
never refuses what the server would accept.

### Paths

```typescript
uploadPolicyHelper.path('site\\docs/./Brief (final).md')   // { ok: true, path: 'site/docs/Brief (final).md', name: 'Brief (final).md' }
uploadPolicyHelper.path('../etc/passwd')                    // { ok: false, issue: 'traversal' }
uploadPolicyHelper.display(rawPath)                         // a refused path, safe to show and log
uploadPolicyHelper.pathKey('Docs/Brief.md')                 // 'docs/brief.md' — what two paths collide on
```

### Policies

```typescript
import { FileKind, uploadPolicyHelper } from '@owlmeans/upload'

const images = uploadPolicyHelper.normalize({ maxFiles: 10, allow: [FileKind.Image], unpackArchives: false })
uploadPolicyHelper.remaining(images, session.totals)                       // { files, bytes } still allowed
uploadPolicyHelper.fits(images, session.totals, { files: 3, bytes: 4 * MiB })
```

### Errors and schemas

```typescript
import Ajv from 'ajv'
import addFormats from 'ajv-formats'
import { UploadReason, UploadRejectedError, UploadSessionSchema } from '@owlmeans/upload'

// In a server-upload receiver: reject one file with a vocabulary reason
throw new UploadRejectedError(UploadReason.Duplicate)

// Validate a wire session (the timestamps use the date-time format)
const ajv = new Ajv({ strict: false })
addFormats(ajv)
const isSession = ajv.compile(UploadSessionSchema)
```

## API

| Export | Purpose |
|---|---|
| `makeUploadProtocols(options)` | The protocol tree (`UploadProtocols`): `base`, `open`, `state`, `file`, `remove`, `seal`, `abort`. Throws `SyntaxError` for a session parameter that is not a route-parameter name or is `file`. |
| `uploadSessionParamOf(protocol)` | The session parameter a session member was declared with, read from its route path. |
| `uploadPolicyHelper` | `normalize`, `path`, `display`, `pathKey`, `remaining`, `fits`, `precheck`. |
| `createUploadPolicyHelper()` | Makes a fresh `UploadPolicyHelper` (the singleton above is one). |
| `DEFAULT_UPLOAD_POLICY` | 50 files, 12 MiB each, 50 MiB together, archives unpacked, executables refused (frozen). |
| `UPLOAD_PATH_LIMITS` | 1024 bytes per path, 255 bytes per segment, 64 segments (frozen). |
| `UPLOAD_DISPLAY_PATH_LENGTH` | 256 — the longest display form of a refused path. |
| `DEFAULT_UPLOAD_ALIAS` | `'upload'` — the default route alias prefix. |
| `DEFAULT_UPLOAD_SESSION_PARAM` | `'session'` — the default session route parameter. |
| `UPLOAD_FILE_PARAM` | `'file'` — the file route parameter of `remove`. |
| `UploadSessionStatus` | `open`, `sealed`, `aborted`. |
| `UploadedFileStatus` | `accepted`, `rejected`. |
| `UploadReason` | `limits`, `type-mismatch`, `dangerous`, `refused-kind`, `archive-invalid`, `path-invalid`, `duplicate`. |
| `FileKind` | The kind vocabulary, re-exported from `@owlmeans/file-inspector/kinds`. |
| `UploadError` | Base class; messages read `upload:<area>:<detail>`. |
| `UploadSessionNotFoundError` | 404 — no such session, or one another owner opened (never told apart). |
| `UploadSessionStateError` | 409 — the session's status forbids the operation. |
| `UploadLimitError` | 422 — an `open` announcement (`expect`) that cannot fit. |
| `UploadRequestError` | 400 — a session id that is not one path segment. |
| `UploadPolicyError` | A policy limit that is not a positive safe integer (an application fault, no HTTP status). |
| `UploadRejectedError` | 422 — a file refused with a vocabulary reason; `.reason` reads it back (unknown → `refused-kind`). |
| `UploadTotalsSchema` | AJV schema of `UploadTotals`. |
| `UploadPolicySchema` | AJV schema of `UploadPolicy`. |
| `UploadedFileSchema` | AJV schema of `UploadedFile`. |
| `UploadSessionSchema` | AJV schema of `UploadSession` (needs `ajv-formats` for `date-time`). |
| `UploadOpenRequestSchema` | AJV schema of the `open` body. |
| `UploadFileQuerySchema` | AJV schema of the `file` query. |
| `UploadFileResultSchema` | AJV schema of the `file` answer. |
| `uploadParamsSchema(param, withFile?)` | The params schema of a session route (plus `file` for `remove`). |
| `UploadPolicy` · `UploadLimits` · `UploadTotals` | Policy (limits + `unpackArchives`, `refuse`, `allow?`), the three limits, `{ files, bytes }`. |
| `UploadSession` · `UploadedFile` | The wire session and one received file. |
| `UploadOpenRequest` · `UploadFileQuery` · `UploadFileResult` · `UploadSessionParams` | `{ expect? }`, `{ path, size?, type? }`, `{ files }`, `{ [param]: id }`. |
| `UploadPathLimits` | The shape of `UPLOAD_PATH_LIMITS`. |
| `UploadPolicyHelper` | The helper's interface. |
| `UploadPathResult` · `UploadPathAccepted` · `UploadPathRefused` · `UploadPathIssue` | `path()`'s answer; the issues `empty`, `absolute`, `traversal`, `invalid-char`, `too-long`, `too-deep`. |
| `UploadCandidate` · `UploadAdmission` · `UploadRefusal` · `UploadPrecheck` · `UploadPrecheckOptions` | `precheck()`'s input, accepted row, refused row, answer and options (`totals?`, `paths?`). |
| `UploadProtocolOptions` | `makeUploadProtocols` options. |
| `UploadProtocols` · `UploadSessionProtocol` | The tree (an `EntrypointTree`); any member that addresses one session. |

## Configuration

`UploadPolicy` (what `uploadPolicyHelper.normalize` fills from `DEFAULT_UPLOAD_POLICY`):

| Field | Default | Meaning |
|---|---|---|
| `maxFiles` | `50` | Accepted files of a session |
| `maxFileBytes` | `12 MiB` | Bytes of one accepted file |
| `maxTotalBytes` | `50 MiB` | Bytes of every accepted file together |
| `unpackArchives` | `true` | zip, tar, tar.gz and gz are unpacked and their entries handled like uploaded files |
| `refuse` | `[FileKind.Executable]` | Kinds refused even under an honest claim |
| `allow` | — | When set, only these detected kinds are accepted |

`normalize` throws `UploadPolicyError(<field>)` for a limit that is not a positive safe integer.

`makeUploadProtocols` options: `path` (required), `maxFileBytes` (required — the route ceiling,
separate from the policy's), `alias` (`upload`), `parent`, `service`, `sessionParam` (`session`),
`guards` and `gate` (a tree without a parent only), `types` (`['application/octet-stream']`).

## Security and limits

- **Paths keep names, refuse escapes.** `\` becomes `/`, the text is NFC-normalized, `.` and empty
  segments are dropped; every character of every name is kept. Refused: absolute paths (`/x`,
  `C:…`), `..` segments, C0 controls, DEL and bidi embedding/override/isolate characters, a path over
  1024 bytes or a segment over 255 bytes (UTF-8), more than 64 segments, an empty path.
- **Refused paths are shown safely.** `display` replaces the forbidden characters with `_` and caps
  the text at 256 characters.
- **Collisions are case-insensitive.** `pathKey` (NFC, lower-cased) is what a session holds one file
  per — a case-insensitive file system would keep only one of the two.
- **Limits are counted on the expanded set.** The server counts an archive's entries, not the
  archive; the browser precheck counts the archive as one file of its own size, a lower bound.
- **Kinds.** `refuse` blocks kinds even when the bytes match the name; executables are refused by
  default. `allow`, when set, admits detected kinds only.
- **Ungated trees are guest uploads.** A tree with neither a parent nor `guards`/`gate` lets anyone
  call it; the session id is then the capability.
- **Route ceiling.** The `file` route is a streamed body (`streamBody` of `@owlmeans/route`) with
  `maxBytes: maxFileBytes`: past it the request answers 413, before the body is read when the length
  is declared.
- **Sizes in a precheck.** A size that is not a positive finite number counts as 0.

## Related packages

- `@owlmeans/server-upload` — sessions, verification, archive unpacking, receivers and the handlers
  of this tree.
- `@owlmeans/client-upload` — the client of this tree for browsers and Bun, with the same precheck.
- `@owlmeans/web-upload` — the React queue, drop zone, pickers and list built on the client.
- `@owlmeans/file-inspector` — `FileKind` (from its browser-safe `./kinds` subpath) and what a
  refusal means.
- `@owlmeans/route` (`streamBody`), `@owlmeans/entrypoint` (`protocols()`, `mapProtocols()` over the
  tree), `@owlmeans/client-entrypoint` / `@owlmeans/server-entrypoint` (`bindAll`, `bind`),
  `@owlmeans/error` (the error registry).

<!-- owlmeans:agent-guidance:start -->
## Agent guidance

This package ships embedded agent skills under `agent-meta/`. After installing your
`@owlmeans/*` packages, run the OwlMeans agent-skills installer to place them into
your project's skill store (`.agents/skills/`):

```sh
npx @owlmeans/agent-skills@^0.2.4-rc.1
```

The embedded files are version-matched to this package release. Do not edit them
directly — they are regenerated on each publish. To contribute guidance edits,
open a PR against the source monorepo.
<!-- owlmeans:agent-guidance:end -->
