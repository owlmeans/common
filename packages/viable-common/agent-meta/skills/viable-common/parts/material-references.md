---
name: material-references
description: References in the materials contract — links, online research requests and npm packages a person points at instead of uploading: the links budget and policy, the reserved links/ prefix and places, the references.json ledger, fetched-file provenance, the reference scan with its eight-language research cues, generated documents and the connector's reference routes.
metadata:
  purposes: data, agent, config
  mentions: MaterialLinkIntent, MATERIALS_LINK_LIMITS, MATERIALS_LINK_POLICY, MATERIALS_LINKS_PREFIX, MATERIALS_RESEARCH_PURPOSE, MATERIALS_REFERENCES, ReferencesLedger, referencesLedgerHelper, MaterialLinkDetails, materialLinkOf, referenceScanHelper, REFERENCE_RESEARCH_CUES, MaterialGeneratedKind, ModelRole.Researcher
---
<!-- AUTO-GENERATED — do not edit. Regenerate via sync-agent-meta. -->

# @owlmeans/viable-common — Material references

What a person points at instead of uploading. Fetched files become rows like uploaded files; the
record, the index document and the limits they share are in the `materials` part.

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
