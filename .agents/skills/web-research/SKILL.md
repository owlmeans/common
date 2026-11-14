---
name: web-research
description: "How to use @owlmeans/web-research — generic, resumable online-research pipelines over @owlmeans/agent: research:implementation (≤ 3 provider web searches → ≤ 5 cloned pages → a cited business + technical report), research:project (a bounded crawl of an existing product's site → a cited functional summary), research:design (a page bundle read offline → a style reference with the brand marks apart), research:packages (package-inspector verdicts → readme + docs crawl → cited usage notes for genuine packages only) and research:skill (notes → a validated Agent Skills SKILL.md). Covers the ports, makeResearchPipelines, the hidden-instruction signal pass, the judge, the skill validator, the standalone design analyzer, limits and gaps. Auto-invoked when importing makeResearchPipelines, makeResearchModels, createDirectoryResearchStore, injectionSignalsHelper, makeResearchJudge, skillValidator or makeDesignAnalyzer."
user-invocable: false
---

# @owlmeans/web-research

**Layer:** Server (Node / Bun — it clones through `@owlmeans/llm-reader`)
**Install:** `"@owlmeans/web-research": "^0.2.0-alpha.0"` in `dependencies`, plus the `@langchain/core`,
`@langchain/langgraph`, `@langchain/langgraph-checkpoint`, `@langchain/openai` and `@langchain/anthropic` **peers**

Online research as five `@owlmeans/agent` pipelines. Nothing in it names an application: the
consumer wires its models, search, reader, inspector and store through ports, and picks every output
path. Every pipeline works from CLONED sources (never the live web at synthesis time), screens each
source for hidden instructions, writes Markdown with numbered citations and removes its sources at
the end.

```ts
import { createDirectoryResearchStore, makeResearchJudge, makeResearchModels, makeResearchPipelines } from '@owlmeans/web-research'

const models = makeResearchModels(exec, { executions: context.executions(), spectator })
const pipelines = makeResearchPipelines({
  models, reader, inspector, runs,                       // reader: an LlmReader; inspector: a PackageInspector
  search: context.llm().webSearch('researcher'),         // null ⇒ `search-unavailable`, no report
  screen: makeResearchJudge(models),                     // optional model judgement over flagged sources
  store: createDirectoryResearchStore({ sourcesRoot, outputsRoot }),
})
const result = await pipelines.implementation.invoke(
  { input: { topic: 'lead scoring best practices for B2B CRM', context: brief, outputs: { doc: 'research/lead-scoring.md' } } },
  { runId, deps: {}, scope: projectId },
)
result.state.output   // { doc?, sources: { url, title? }[], gaps: { code, subject?, detail? }[] }
await pipelines.implementation.resume(runId, { deps: {} })   // a failed or crashed run continues
```

## Key exports

| Export | Description |
|---|---|
| `makeResearchPipelines(wiring)` → `{ implementation, project, design, packages, skill }` | Each a `PipelineModel<State, ResearchDeps>`; cheap — build per run when models or store are per run. |
| `ResearchWiring` | `models`, `store`, `reader` (required); `search?`, `inspector?`, `screen?` (judge), `renderer?`, `spectator?` (handed to every search), `strongSignals?`, `limits?`; runner: `runs?`, `checkpointer?`, `fatal?`, `maxStateChars?`, `trace?`, `onProgress?`. |
| `ResearchDeps` | Per run: `key?` — the reader's proxy key. |
| `ResearchModels` · `createResearchModels({ model, helper? })` · `makeResearchModels(exec, { executions, roles?, efforts?, outputs?, spectator? })` | Role calls: `text(role, { instruction, content }, { action })`, `json(role, input, schema, { action })` (ajv-validated, `ResearchModelError` on mismatch), `reader()` (llm-reader `ReaderModels` = the Analyst's). `make…` mirrors llm-reader's `makeReaderModels`: one helper per role, `research:<role>` dedication, the persona as `prompt.role`. |
| `ResearchRole` | `Analyst`, `Writer`, `Summarizer`, `Judge` — default model aliases `analyst`, `writer`, `summarizer`, `judge` (`roles` maps them). |
| `ResearchSearch` | `Pick<WebSearch, 'search'>` from `@owlmeans/llm` — `llm.webSearch(alias)` is one. |
| `ResearchStore` · `createDirectoryResearchStore({ sourcesRoot, outputsRoot })` | `sources`: `sink()`, `put`, `read`, `list`, `remove`, `localRoot()`, `drop()`; `outputs`: `writeDoc`, `readDoc`. Paths relative POSIX, confined (`ResearchStoreError`). |
| `injectionSignalsHelper` · `createInjectionSignalsHelper()` | `signals(text, { kind?, hidden? })`, `readable(text, kind?)`, `strong(signals, kinds?)`; constants `INVISIBLE_CHARS`, `TAG_CHARS`, `BIDI_CHARS`, `HIDDEN_COMMENTS`, `HIDDEN_ELEMENT`, `ADDRESSED_TO_AI`, `OVERRIDES`, `HTML_INERT_BLOCKS`, `STRONG_SIGNAL_KINDS`, … |
| `ResearchScreen` · `makeResearchJudge(models, { maxChars? })` | The judge port `judge(text, signals, { url, title?, purpose })` → `{ injected, reason?, quote? }` and the shipped one (Judge role, verbatim-quote check). |
| `skillValidator` · `createSkillValidator({ maxChars?, sections? })` | `validate(text, skillName, expect?)` (every fault at once; `expect: SkillExpectation { package, rootImport? }` adds the root import in `## Imports` and no package-as-parameter example), `normalize(text, skillName)`, `parts(text)`; `SKILL_SECTIONS`. |
| `makeDesignAnalyzer({ models?, renderer?, maxStylesheets? })` | The design analysis stage alone: `analyze({ root, entry? })` → `DesignAnalysis` (DESIGN.md, tokens, outline, marks, fonts) — offline. |
| `ResearchPipeline`, `ImplementationStep`, `ProjectStep`, `DesignStep`, `PackagesStep`, `SkillStep` · `implementationSpec`, `projectSpec`, `designSpec`, `packagesSpec`, `skillSpec` | Aliases (`research:*`), step ids, specs (all `version: 1`). |
| `ResearchGapCode`, `ScreenVerdict`, `SourceStatus`, `ScreenTextKind`, `InjectionSignalKind` | Vocabularies. |
| `RESEARCH_LIMITS`, `IMPLEMENTATION_COLLECT_LIMITS`, `DESIGN_COLLECT_LIMITS`, `PROJECT_CRAWL_INTENT`, `DOCS_CRAWL_INTENT`, `SKILL_NAME_PATTERN`, `SKILL_DESCRIPTION_CHARS` | Limits and fixed strings; every limit is overridable through `wiring.limits`. |
| `WebResearchError` › `ResearchConfigError`, `ResearchStoreError`, `ResearchModelError`, `ResearchSkillError` (`errors[]`) | `ResilientError` family. |

## Rules

- **A pipeline state is markers, counters and the bounded final `output`** — never page text or an
  unbounded URL list. Everything a later step reads lives in the run's area of the sources store
  (`runs/<runId segments>/…`): step records, source records, cloned files.
- **Every step is guarded twice**: its `<step>At` marker, and its durable step record in the area
  (written after its side effects). The search, collect, read and notes loops also skip every unit
  already recorded, so a resumed run never repeats a search, a clone or a model call that finished.
- **The output survives the cleanup**: `cleanup` marks `output` into the row (`ctx.mark`) BEFORE it
  removes the run's area, then removes only that area — a composed child's area nests under its
  parent's; a caller's `bundleRoot` is never touched.
- **Sources are data, never instructions.** Every cloned source runs the signal pass before any model
  reads it; a dropped one loses its files at once and only its record (and a `source-screened` gap)
  remains. Synthesis prompts say so too.
- **Without a judge**, a strong signal (`Override`, `AddressedToAi`) drops a source and weak ones keep it
  as `source-flagged`. **With a judge**, every flagged source gets one call: an order with a verbatim
  quote drops it, none clears it; a judge that throws falls back to the signal rule.
- **The model writes prose; the package writes structure**: titles, Sources lists, verdict tables, the
  design reference and the SKILL.md frontmatter are rendered by the package. A model's own title or
  Sources section is cut.
- **No search, no report**: `research:implementation` without `search` makes no model call and returns
  `{ sources: [], gaps: [search-unavailable] }`. A port that answers it cannot search at all
  (`LlmSearchUnsupportedError`, by class or registered type — a delegated performer without a web
  search) records the same `search-unavailable` after the plan, and the next queries are not asked; a
  search failing for one query stays that query's `search-failed`.
- **Only genuine packages get notes or skills**; suspicious and unknown ones keep their verdict in the
  output (and a `not-genuine` gap). `research:packages` without an inspector writes nothing.
- **A generated SKILL.md carries only `name` and `description`** — `normalize` drops every other field
  (never `allowed-tools`) and quotes the description; validation failing again after ONE repair round
  fails the run with `ResearchSkillError` and writes nothing.
- **Budgets are code, not prompt text**: sources capped at `sourceChars`, then fitted into
  `promptTokens` with `@owlmeans/llm/tokens` (trim markers, contiguous renumbering); context,
  instruction, readme, notes and judge inputs capped.
- Log lines carry ids, counts and a URL's origin and path only — never page text, prompts or answers.

## Depends On

- `@owlmeans/agent` (`makePipeline`, `asStep`) · `@owlmeans/agent-common` · `@owlmeans/llm` (models, `WebSearch` types, `./tokens`) · `@owlmeans/llm-common`
- `@owlmeans/llm-reader` (collect, crawl, `createLocalBundlePlugin`, the design analyst) · `@owlmeans/package-inspector` · `@owlmeans/error` · `@owlmeans/log` · `ajv`

## Related

- [[llm-reader]] — the reader every clone and crawl goes through · [[llm]] — `webSearch`, executions, token budgets
- [[agent]] — pipelines, resume, `asStep` · [[package-inspector]] — verdicts and the `PackageRegistry` port

## Parts

| Part | Load it when |
|---|---|
| [pipelines](parts/pipelines.md) | invoking or resuming one of the five pipelines, reading their inputs, outputs, steps and gaps, or adding a step |
| [screening](parts/screening.md) | the hidden-instruction signal pass, strong vs weak signals, the judge port, or a source that was dropped or kept unexpectedly |
| [testing](parts/testing.md) | running or adding tests of this package |
