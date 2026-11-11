---
name: materials
description: The materials contract — files a person attaches to a NEW project's prompt: purposes, statuses, removal reasons and uses, the platform's catalogue record and its schema, the target's docs/materials/index.md document (render, parse, relevance), the workload directories and keep list, the upload limits and the brief budget.
metadata:
  purposes: data, agent, config
  mentions: MaterialPurpose, MaterialStatus, MaterialRemoval, MaterialUseBy, MaterialUseTarget, ProjectMaterialRecord, ProjectMaterialRecordSchema, MaterialIndexEntry, MaterialIndexEntrySchema, materialIndexHelper, MATERIALS_DIR, MATERIALS_INDEX, MATERIALS_ASSETS_DIR, MATERIALS_ASSET_PURPOSES, MATERIALS_KEEP, MATERIALS_LIMITS, MATERIALS_UPLOAD_POLICY, MATERIAL_TEXT_KINDS, MATERIALS_BRIEF_TOKENS, MATERIALS_SCOPE_PURPOSE
---

# @owlmeans/viable-common — Materials

"Materials" in code, "Files" in the UI: what a person attaches to a NEW project's prompt
(`src/materials/`, in the barrel). Four runtimes read the same names — the browser that checks the
limits, the API that enforces them and stores the rows, the agent that analyses and places the
files, the publisher that serves the placed assets.

## Vocabulary

| Name | Values / meaning |
|---|---|
| `MaterialPurpose` | `specification`, `brand-logo`, `icon`, `font`, `css-example`, `layout-sketch`, `html-prototype`, `algorithm-example`, `graphic-asset`, `video-asset`, `audio-asset`, `model-3d`, `notes`, `other` |
| `MaterialStatus` | `received` (stored, not analysed), `catalogued`, `removed` (dropped by the agent), `rejected` (refused by the API, no bytes kept), `placed` (in the workload) |
| `MaterialRemoval` | `type-mismatch`, `dangerous`, `executable`, `prompt-injection`, `limit`, `archive-invalid`, `path-invalid` |
| `MaterialUse` | `{ target, by: MaterialUseBy (name / reference / analysis), source?, note? }` — `source` is `'prompt'` or the citing material's path |
| `MaterialUseTarget` | the KNOWN targets (`logo`, `favicon`, `hero-image`, `hero-video`, `background-audio`, `section-media`, `font`, `theme`, `home-structure`, `architecture`, `specification`, `example`); `MaterialUse.target` stays a string |
| `MATERIAL_USABLE_STATUSES` | `received`, `catalogued`, `placed` — what a reader may use |

## The record and the entry

`ProjectMaterialRecord` is the platform's `project-material` row: platform ids as plain strings
(`id?`, `projectId`, `entityId`, `slotId`), `scope` (the claimed storage path
`<entitySlug>/<slotId>/new-project` — claimed once, stored, read back, never recomputed;
`MATERIALS_SCOPE_PURPOSE` is its last segment), `path` (original relative path, folders kept),
`name`, `size`, `mime?`, `kind?` (a `@owlmeans/file-inspector` `FileKind` value, typed as a string),
`digest?`, `from?` (the archive), `status`, `reason?`, `purpose?`, `description?`, `details?`
(`MaterialDetails`: width, height, pages, language, duration, palette — open), `uses?`,
`transcript?` (its markdown analogue under `docs/materials/`), `placedAt?`, `createdAt: Date`,
`updatedAt?: Date` — dates as `Date`, like every platform record.

`MaterialIndexEntry` is the record without `MATERIAL_PLATFORM_KEYS` (ids, `scope`, timestamps):
what the target document carries.

Schemas (`ProjectMaterialRecordSchema`, `MaterialIndexEntrySchema`, `MaterialUseSchema`) are
record-element schemas re-applied as a Mongo `$jsonSchema`: no `integer`, `DateSchema` for dates,
`IdValueSchema` for ids, nullable enums listing `null`, `details` an open object
(`additionalProperties: true`, no typed map), and `kind` / `use.target` as plain strings — a newer
agent may name a kind or a use an older platform does not know, and a row the platform cannot store
is a file the person loses.

## The target document

`MATERIALS_DIR = 'docs/materials'`, `MATERIALS_INDEX = 'docs/materials/index.md'`,
`MATERIALS_ASSETS_DIR = 'sources/web/public/assets'`; `MATERIALS_KEEP` is both directories and is
spread into every wipe's keep list (the library's `initializeProject`, the platform's reinit) —
a placed material exists nowhere else once its storage scope is purged.

`MATERIALS_ASSET_PURPOSES` (`ReadonlySet<MaterialPurpose>`: `brand-logo`, `icon`, `font`,
`graphic-asset`, `video-asset`, `audio-asset`, `model-3d`) are the WEB ASSETS — placed under
`MATERIALS_ASSETS_DIR` and served at `/assets/<original path>`; every other purpose is placed under
`MATERIALS_DIR`. The ONE set the platform's placement and `@owlmeans/viable-materials`' asset plan
(which re-exports it) both read: a purpose in one list and not the other is an asset planned at a URL
nothing serves.

`materialIndexHelper` (pure, no clock, no locale):

- `entryOf(record | entry)` — platform keys dropped, `undefined`/`null` omitted, keys in one fixed
  order, `details` keys sorted.
- `render(entries)` — a `---` fenced JSON frontmatter `{ version: MATERIALS_INDEX_VERSION, entries }`
  (entries sorted by path, code-point order) and a readable table (File, Purpose, Type, Size,
  Status, Uses, Description). The same entries in any order give the same bytes, and
  `render(parse(doc)) === doc`, so a re-render that changed nothing changes no file.
- `parse(markdown)` — TOTAL: no frontmatter, bad JSON or an entry missing `path`/`name`/`size`/a
  known `status` yields fewer entries, never a throw; unknown keys are dropped through `entryOf`.
  A JSON string can never end the frontmatter early (a newline inside it is escaped).
- `textual(entry)` — whether a file's own bytes are text: its kind (`MATERIAL_TEXT_KINDS`), its type
  (`text/*`, `MATERIAL_TEXT_MIMES`) or, failing both, its extension (`MATERIAL_TEXT_EXTENSIONS`); a
  document (PDF, Word) is not — its text is its transcript.
- `relevant(entries, { purposes?, mentions? })` — usable entries only, index order; with neither
  every usable entry, otherwise purpose match OR a whole-name, case-insensitive mention of the name
  or path in one of the texts (`logo.svg` in "use logo.svg.", not in "biglogo.svg"/"logo.svg.bak").

## Limits and budgets

`MATERIALS_LIMITS = { files: 50, fileBytes: 12 MiB, totalBytes: 50 MiB }` on the EXPANDED set
(after unpacking), checked in the browser and enforced by the API. `fileBytes` IS
`SLOT_BINARY_MAX_BYTES` — one ceiling: a larger file could never be placed in a workload or read
back through `ReadBinaryFile`. `MATERIALS_UPLOAD_POLICY` is the `@owlmeans/upload` policy of every
runtime that checks them — the browser's and the SDK's precheck, the API services' session: the limits,
archives unpacked, `FileKind.Executable` refused (frozen; the platform's `viable-common` re-exports it).
`MATERIALS_BRIEF_TOKENS = 80_000` bounds the materials brief (the prompt plus the specification texts). String ceilings: `MATERIAL_PATH_MAX`, `MATERIAL_NAME_MAX`,
`MATERIAL_DESCRIPTION_MAX`, `MATERIAL_NOTE_MAX`, `MATERIAL_USES_MAX`.

## Tests

`tests/materials.spec.ts`: wire values, paths and limits (the shared binary ceiling), schema
accept/refuse cases (`null` optionals, strays, open `kind`/`target`/`details`, no `integer`, no
platform key in an entry), render determinism and round trip, the table, a total `parse`, relevance
by purpose and by mention, `ReadBinaryFile` in the payload schema with its deadline and timeout.
`tests/connect-materials.spec.ts`: `MATERIALS_UPLOAD_POLICY` and its precheck, `textual`, and the
connector's materials routes (the create with files, the upload tree without `open`/`abort`, the
reads, `ConnectMaterialUnknown`).
