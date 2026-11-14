---
name: pipelines
description: The five research pipelines — inputs, steps, what each step records, outputs and gaps; resume and crash behaviour; the composed packages run inside research:skill; the design reference format.
metadata:
  purposes: agent, job, data
  mentions: makeResearchPipelines, research:implementation, research:project, research:design, research:packages, research:skill, ImplementationInput, ImplementationOutput, ProjectInput, ProjectOutput, DesignInput, DesignOutput, PackagesInput, PackagesOutput, SkillInput, SkillOutput, ResearchGapCode, RESEARCH_LIMITS, asStep, makeDesignAnalyzer
---

# @owlmeans/web-research — Pipelines

Seed every pipeline with `{ input }` and read `result.state.output` (bounded: sources ≤ `maxResults`
or pages, gaps ≤ `maxGaps`). Output paths are the CALLER's (`input.outputs`), written through
`store.outputs`; the run's own files live under `runs/<runId segments>/` of `store.sources` until
`cleanup`.

| Pipeline | Input | Steps | Output |
|---|---|---|---|
| `research:implementation` | `topic`, `questions?`, `instruction?`, `context?`, `maxQueries?` (≤ 3), `maxResults?` (≤ 5), `blockedDomains?`, `outputs.doc` | `plan` → `search` → `collect` → `screen` → `synthesize` → `cleanup` | `{ doc?, sources, gaps }` |
| `research:project` | `url`, `instruction?`, `maxPages?` (≤ 8), `depth?` (≤ 2), `outputs.doc` | `crawl` → `screen` → `summarize` → `cleanup` | `{ doc?, sources, pages, gaps }` |
| `research:design` | `url?` or `bundleRoot?` (+ `entry?`), `instruction?`, `outputs.{doc, designMd?, tokens?}` | `collect` → `analyze` → `pack` → `cleanup` | `{ doc?, url?, by?, rendered?, marks?, gaps }` |
| `research:packages` | `packages: { name, intent? }[]` (≤ 5), `context?`, `maxPages?` (≤ 6), `outputs.{doc, notesDir?}` | `inspect` → `read` → `screen` → `notes` → `cleanup` | `{ doc?, verdicts, notes: { name, doc? }[], gaps }` |
| `research:skill` | `name`, `skillName` (`^[a-z0-9-]{1,64}$`), `intent?`, `notes?` (an outputs path), `context?`, `audience?`, `outputs.{doc, notes?}` | `notes` → `write` → `validate` → `cleanup` | `{ doc?, notes?, verdict?, chars?, repaired?, gaps }` |

## research:implementation

- `plan` — one Analyst structured call (`{ queries }`), deduplicated, cut to `maxQueries`; the topic
  itself when the model names none. No `search` wired: no call, the record says `unavailable`.
- `search` — one `search(query, { maxUses: 1, contextSize: 'low', blockedDomains?, spectator? })` per
  query, each answer a unit record. Candidates: each query's best URL first, then each query's
  second (round robin), fragments and tracking parameters dropped, blocked domains left out,
  `maxResults + collectSpare` kept. A failing search is a `search-failed` gap, never a failure. A
  search answering `LlmSearchUnsupportedError` is recorded `unavailable` (the unit and the step record);
  the later queries are recorded unavailable without being asked.
- `collect` — `reader.collect` candidates in order until `maxResults` are cloned
  (`limits.implementationCollect`: the page only, no assets); a page bundle's text becomes
  `content.md` (llm-reader's page content); a text file is read as is; a binary is `unreadable`.
- `screen` — see the `screening` part. `synthesize` — the usable sources fitted into `promptTokens`,
  one Analyst text call (Summary, Business recommendations, Technical recommendations, Risks and
  pitfalls, Open questions — every claim `[n]`), the package's `# Research: <topic>` title and Sources
  list around it. Nothing usable ⇒ no report and a `no-sources` gap (`search-unavailable` alone when
  there was no search, or the search answered that it cannot search).

## research:project

`reader.crawl(url, { intent: PROJECT_CRAWL_INTENT, maxPages, depth, delay: limits.crawlDelayMs })` —
robots.txt honoured, same origin, the reader's link ranking. Each page's html (screened) and Markdown
(read) are saved. `summarize` is one Analyst call: Purpose, Audiences and roles, Features, Key flows,
Data entities, Pricing model, Integrations, Differentiators, every statement `[n]`. A repository page
(GitHub) is a site like any other.

## research:design

- `collect` — `url` ⇒ `reader.collect` into the run's `bundle/` (`limits.designCollect`: stylesheets,
  fonts, pictures, `bundle.json`); `bundleRoot` ⇒ recorded and read in place.
- `analyze` — `makeDesignAnalyzer({ models: models.reader(), renderer })`: a reader whose plugins are
  the local bundle and an offline refusal, so no request reaches the network; rendered when a
  renderer is wired (parsed on failure, `not-rendered`); llm-reader's design analyst writes DESIGN.md +
  tokens, the measured facts alone without models or on failure (`design-by-facts`). Outline = the
  facts' blocks + headings ≤ h3; marks = site name, logo alts, the header brand, the title's lead
  segment, logos and icons the bundle holds (mapped back to their original URLs). Written to the
  area (and `outputs.designMd` / `outputs.tokens` when asked).
- `pack` — rendered without a model: Palette, Typography (+ loaded fonts), Spacing and shapes,
  Components, Layout and blocks, Look and feel (DESIGN.md's Overview, Layout, Do's and Don'ts), then
  `## Brand marks — do not reuse`. Brand names are replaced by "the reference brand" everywhere above
  that section.

## research:packages

- `inspect` — `inspector.inspectAll` (full verdicts kept in the area, summaries in the output).
- `read` — per genuine package (unit record): the registry readme (`readmeChars`) as a source cited by
  the registry page, and `reader.crawl(homepage ?? repository page, { intent: DOCS_CRAWL_INTENT,
  maxPages ≤ maxDocsPages, depth: docsDepth })`. No start page or nothing read ⇒ `docs-unavailable`.
- `notes` — per genuine package one Writer call (Install, Imports — FIRST the root's canonical import,
  ESM and CJS, default vs named, then subpaths; Core API with signatures, Usage, Configuration, Pitfalls
  and breaking changes for the current major), cited per package. The facts it reads carry the
  manifest's entry points (`facts.entry`: module system, `main`, `module`, `types`, the exports root and
  subpaths) and the readme's own import lines of the package, root imports first (`utils/entry.ts`);
  a CommonJS main with no named root import in the sources is a DEFAULT import. The package renders the
  same as `## Entry points (package manifest)` right under each notes title (ending
  `The package root is importable: \`<name>\`` when it is). The doc: a verdict table (suspicious ones
  with "did you mean …?"), then each package's notes one heading level down; `notesDir` also gets
  `<name>.md` per package.

## research:skill

- `notes` — skipped when `input.notes` is given; otherwise `research:packages` for the package, composed
  with `asStep` (child run `<runId>/notes`, notes at `outputs.notes ?? <doc>.notes.md`). Its gaps and
  verdict go to the step record.
- `write` — one Writer call from the notes (`notesChars`), normalized (`skillValidator.normalize`) and
  kept as a draft in the area. No notes (not genuine) ⇒ no draft, no skill.
- `validate` — `skillValidator.validate(text, skillName, { package, rootImport })`: `rootImport` when
  the notes import the root or say it is importable — the `## Imports` section must then show the root's
  import; and no code example may take the package (its root binding, else its camel-cased name) as a
  function parameter. The writer is told both (Imports opens with the root's ESM and CJS forms; recipes
  import the package at their top). On faults ONE repair call with the fault list, then a
  `ResearchSkillError` (`errors`) that fails the run. Only a valid file reaches `outputs.doc`.

## Resume

Build the pipelines again over the same `runs` and `store` (new models are fine) and call
`resume(runId, { deps })`, or `invoke` the same `runId` (an unfinished row continues). Without a run
store a re-invoke starts at the first step, and every step still skips on its durable record.
