---
name: materials
description: The materials contract — files a person attaches to a NEW project's prompt and the references they point at instead (links, online research, npm packages): purposes, statuses, removal reasons and uses, the platform's catalogue record and its schema, the target's docs/materials/index.md document (render, parse, relevance, generated documents), the links budget and reserved prefix, the references.json ledger, fetched-file provenance, the reference scan with its eight-language research cues, the workload directories and keep list, the upload limits and the brief budget.
metadata:
  purposes: data, agent, config
  mentions: MaterialPurpose, MaterialStatus, MaterialRemoval, MaterialUseBy, MaterialUseTarget, ProjectMaterialRecord, ProjectMaterialRecordSchema, MaterialIndexEntry, MaterialIndexEntrySchema, materialIndexHelper, MATERIALS_DIR, MATERIALS_INDEX, MATERIALS_ASSETS_DIR, MATERIALS_ASSET_PURPOSES, MATERIALS_KEEP, MATERIALS_LIMITS, MATERIALS_UPLOAD_POLICY, MATERIAL_TEXT_KINDS, MATERIALS_BRIEF_TOKENS, MATERIALS_SCOPE_PURPOSE, MaterialLinkIntent, MATERIALS_LINK_LIMITS, MATERIALS_LINK_POLICY, MATERIALS_LINKS_PREFIX, MATERIALS_RESEARCH_PURPOSE, MATERIALS_REFERENCES, ReferencesLedger, referencesLedgerHelper, MaterialLinkDetails, materialLinkOf, materialPathHelper, referenceScanHelper, REFERENCE_RESEARCH_CUES, MaterialGeneratedKind, ModelRole.Researcher
---

# @owlmeans/viable-common — Materials

"Materials" in code, "Files" in the UI: what a person attaches to a NEW project's prompt
(`src/materials/`, in the barrel). Four runtimes read the same names — the browser that checks the
limits, the API that enforces them and stores the rows, the agent that analyses and places the
files, the publisher that serves the placed assets. **References** are what a person points at
instead of uploading — links, online research requests, npm packages — in the prompt or in the
specification while confirming it; what is fetched for them becomes rows like uploaded files
(below, "References").

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

A fetched file's row carries its provenance at `details.link` (`MaterialLinkDetails`: `url` — the
file's own, `linkId` — its ledger link, `intent`, `own`, `primaryDesign?`, `completes?` — the html
path an asset was fetched to complete, whose ownership it inherits). `details` stays open; writers
check the shape with `MaterialLinkDetailsSchema`, readers use `materialLinkOf(entry)` — tolerant: a
link without `url`, `linkId`, a known `intent` or a boolean `own` reads as none, so a hand-edited
index cannot make an upload look fetched. A file that is not the person's own is never a brand mark
or a hero and is placed with the originals, never among the public assets.

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
- `render(entries, generated?)` / `parseGenerated(markdown)` — the OPTIONAL generated-documents
  section (`MaterialGeneratedDoc { path, title, kind }`, `kind` a `MaterialGeneratedKind`: `research`,
  `reference-summary`, `reference-design`, `skill`; `path` a workload path). Only a non-empty list
  adds a `generated` frontmatter key after `entries` and a "Generated documents" table, both sorted
  by path, one per path; without it the bytes are exactly those of an index that never had the
  section, so `MATERIALS_INDEX_VERSION` stays 1. `parseGenerated` is total like `parse`: an item
  without a path or with an unknown kind is dropped, a missing title reads as the path.

## Limits and budgets

`MATERIALS_LIMITS = { files: 50, fileBytes: 12 MiB, totalBytes: 50 MiB }` on the EXPANDED set
(after unpacking), checked in the browser and enforced by the API. `fileBytes` IS
`SLOT_BINARY_MAX_BYTES` — one ceiling: a larger file could never be placed in a workload or read
back through `ReadBinaryFile`. `MATERIALS_UPLOAD_POLICY` is the `@owlmeans/upload` policy of every
runtime that checks them — the browser's and the SDK's precheck, the API services' session: the limits,
archives unpacked, `FileKind.Executable` refused (frozen; the platform's `viable-common` re-exports it).
`MATERIALS_BRIEF_TOKENS = 80_000` bounds the materials brief (the prompt plus the specification texts). String ceilings: `MATERIAL_PATH_MAX`, `MATERIAL_NAME_MAX`,
`MATERIAL_DESCRIPTION_MAX`, `MATERIAL_NOTE_MAX`, `MATERIAL_USES_MAX`.

## References

**Budget.** `MATERIALS_LINK_LIMITS = { links: 10, files: 100, fileBytes: 12 MiB, totalBytes: 100 MiB,
research: 3, researchResults: 5, skills: 5 }` per project, prompt and confirmation together (a folder
is one link); `fileBytes` is the same slot binary ceiling. `MATERIALS_LINK_POLICY` is the
`@owlmeans/upload` policy every fetched file passes before it becomes a row — the same intake as an
upload with those file limits, archives unpacked, executables refused (frozen).

**Places.**

| Name | Value |
|---|---|
| `MATERIALS_LINKS_PREFIX` | `links` — fetched files live at `links/<nn>-<slug>/…` in the materials scope, remote names kept below; reserved in both receivers, so an upload never lands there and a fetched file never replaces an uploaded one |
| `MATERIALS_RESEARCH_PURPOSE` | `research` — the transient research scope `<entitySlug>/<slotId>/research` (claimed with the materials scope, stored on the slot, read back, dropped once the documents exist) |
| `MATERIALS_REFERENCES` | `docs/materials/references.json` (`MATERIALS_REFERENCES_DOC` is its name) |
| `MATERIALS_RESEARCH_DIR` · `MATERIALS_REFERENCE_DIR` · `MATERIALS_SKILLS_DIR` | under `docs/materials/`: `research/<slug>.md`, `references/<slug>/summary.md` \| `design.md` (`MATERIALS_REFERENCE_SUMMARY` / `_DESIGN`), `skills/<name>/SKILL.md` (`MATERIALS_SKILL_FILE`) |
| `MATERIALS_SKILL_PREFIX` · `MATERIALS_WORKLOAD_SKILLS_DIR` | a package skill's workload copy is `.agents/skills/pkg-<name>/` — its frontmatter `name` is that folder's name |

`materialPathHelper` builds every one of them from untrusted text as safe storage segments
(`[a-z0-9-]`, a letter or digit first): `isLinkPath(path)`, `isReservedPath(path)` (under
`docs/materials` OR `links/`, case-insensitive — what an upload may never use), `slugOf(text)` (a URL
reads as host without `www.` plus path; ≤ `MATERIAL_LINK_SLUG_MAX`, `link` when empty, idempotent),
`folderNameOf(ordinal, slug)` (`03-twenty-com`) and `folderOf` (`links/03-twenty-com`),
`skillNameOf(packageName)` (`@tanstack/react-query` → `tanstack-react-query`; `pkg-<name>` fits
`MATERIAL_SKILL_NAME_MAX` = 64; `null` when nothing is left; idempotent — two names may collide after
the cut), `researchDocOf`, `summaryDocOf`, `designDocOf`, `skillDocOf`, `skillDirOf`.

**The ledger** `references.json` (`ReferencesLedger`, `REFERENCES_VERSION` = 1, `ReferencesLedgerSchema`):

- `links: ReferenceLink[]` — `id` (16 hex digits digesting the normalized URL), `url`, `normalized`,
  `intents: MaterialLinkIntent[]` (`design`, `function`, `content`, `asset`, `package`), `own`,
  `instruction?` (the person's quote), `origin` (`prompt` | `specification`), `status`
  (`ReferenceLinkStatus`: `pending`, `fetched`, `researched`, `skipped`, `refused`, `failed`),
  `reason?`, `folder?` (`links/<nn>-<slug>`), `files?`, `bytes?`, `docs?`.
- `research: ReferenceResearch[]` — `id` (digest of the folded query), `query`, `instruction?`,
  `origin`, `status` (`ReferenceResearchStatus`: `pending`, `researched`, `skipped`, `failed`),
  `reason?`, `doc?`, `sources?`, `gap?`.
- `packages: ReferencePackage[]` — keyed by `name`; `origin` (`ReferenceOrigin` — `link` only here),
  `verdict?` (`ReferencePackageVerdict`: `genuine`, `suspicious`, `unknown`), `reasons?`,
  `lookalikeOf?`, `skill?` (the FULL path of the generated guide, `docs/materials/skills/<name>/SKILL.md`),
  `status` (`ReferencePackageStatus`: `pending`, `verified`, `refused`,
  `skilled`, `failed`), `reason?`.
- `updatedAt?` — ISO; lists capped at `REFERENCE_LINKS_MAX` / `_RESEARCH_MAX` / `_PACKAGES_MAX`.

`referencesLedgerHelper` (pure, no clock — the caller stamps `updatedAt`; never mutates): `empty()`,
`parse(text)` (TOTAL — bad JSON gives an empty ledger, broken rows, unknown keys and mistyped
optionals are dropped, repeats in a list removed), `render(ledger)` (two-space JSON, fixed key
order, rows in ledger order — a link's place is its ordinal — final newline; `render(parse(t)) ===
t`), `linkIdOf(url)`, `researchIdOf(query)`, `findLink` / `findResearch` / `findPackage`,
`merge(ledger, patch)` (by id / name: a known row keeps its place and takes the patch's fields — an
explicit `undefined` clears, an absent key keeps; new rows appended), `usage(ledger, stored?)` and
`remaining(ledger, stored?)` against `MATERIALS_LINK_LIMITS`: links counted when admitted
(`REFERENCE_LINK_ADMITTED` — pending, fetched, researched), files and bytes summed over every link
or taken from `stored` (counted from the rows), research when admitted
(`REFERENCE_RESEARCH_ADMITTED`), skills when `skilled`; never below zero.

**The scan.** `referenceScanHelper` (pure, browser-safe — manager-api runs it on a create's prompt
before any model): `normalize(url)` (http(s) or `s3://` with a host, ≤ `MATERIAL_LINK_URL_MAX`;
scheme and host lower-cased, default port, fragment, credentials and an empty query dropped; `null`
otherwise), `urls(text)` (distinct normalized URLs in order of appearance; markdown links and
autolinks read; trailing punctuation, quotes and unbalanced `)` stripped), `research(text)`,
`scan(text)` → `{ links, research }`. The research cue lexicon `REFERENCE_RESEARCH_CUES` covers the
manager's eight languages (`REFERENCE_CUE_LANGUAGES`); every language is tried on every text. Cue
syntax: words, `stem*`, `a|b` alternatives, `…` = up to `REFERENCE_CUE_GAP_WORDS` (6) words between;
the text and the lexicon are folded alike (decomposed, marks dropped, lower-cased — `й` reads as
`и`, `ü` as `u`), matched on whole words, URLs not read. Recall over precision: a false positive
costs one model decision in the links pipeline, a false negative loses the request — add a
phrasing to the lexicon (and to `references.spec.ts`) rather than tightening one. Mind the
inflected stems (Belarusian `інтэрнэт` → `у інтэрнэце`: the stem is `інтэрнэ*`).

`ModelRole.Researcher` (`researcher`, `ModelTier.Standard`) is the role whose model runs the
provider-hosted web search.

**Outside this package.** The slot's `SlotMaterials` (+ `links?`, `researchScope?`), the manager's
`MaterialsAnnouncement` (+ `links?`) and `MaterialCatalogue` (+ `references`) are the platform's
`viable-common` (`sources/common`). The connector reads references through routes of their own —
`connect.project.createWithReferences` (POST `/project/with-references`, the closed `ConnectCreateBody`)
and `connect.project.confirmWithReferences` (POST `/project/:id/confirm-with-references`,
`ConnectConfirmBody`), both → `ConnectProjectStatus`: the platform scans the prompt, the body never names
a link. `ConnectMaterialsAnnouncement` stays files-only; `ConnectMaterialCatalogue` carries the optional
`references?: ReferencesLedger` and `generated?: MaterialGeneratedDoc[]`, and `ConnectMaterialText.source`
may be `generated` (`ConnectMaterialTextSource.Generated` — a document the index lists, read by its path).

## Tests

`tests/references.spec.ts`: the references wire values, the link budget and policy (the shared
binary ceiling), places, the path helper (reserved prefix, folders, skill names, document paths),
the ledger schema, total parse, render round trip, ids, merge and budget, the provenance schema and
reader through the index document, the scan (URLs in prose, markdown, brackets, `s3://`, dedupe and
order, cues and negatives in all eight languages), the researcher role in every role enumeration,
and the index's generated-documents section (today's bytes without it, round trip with it).
`tests/materials.spec.ts`: wire values, paths and limits (the shared binary ceiling), schema
accept/refuse cases (`null` optionals, strays, open `kind`/`target`/`details`, no `integer`, no
platform key in an entry), render determinism and round trip, the table, a total `parse`, relevance
by purpose and by mention, `ReadBinaryFile` in the payload schema with its deadline and timeout.
`tests/connect-materials.spec.ts`: `MATERIALS_UPLOAD_POLICY` and its precheck, `textual`, and the
connector's materials routes (the create with files, the upload tree without `open`/`abort`, the
reads, `ConnectMaterialUnknown`).
