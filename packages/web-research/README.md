# @owlmeans/web-research

Online research pipelines over `@owlmeans/llm-reader`, provider web search and
`@owlmeans/package-inspector`: implementation research with a cited report, a functional summary of
an existing product's site, a style reference from a designed page, usage notes for verified npm
packages and Agent Skills `SKILL.md` files from them. Every pipeline is a resumable `@owlmeans/agent`
pipeline that works from cloned sources, screens them for hidden instructions to AI agents, writes
Markdown with numbered citations and removes its sources at the end. Use it when an agent must learn
something from the web before it builds; it names no application — models, search, reader, inspector
and storage are ports the consumer wires.

## Installation

```sh
bun add @owlmeans/web-research@^0.2.4-rc.1
bun add @langchain/core @langchain/langgraph @langchain/langgraph-checkpoint @langchain/openai @langchain/anthropic
```

The LangChain packages are peers (the pipelines run on `@owlmeans/agent`).

## Concepts

- **Pipelines** — `research:implementation`, `research:project`, `research:design`, `research:packages`,
  `research:skill`; each a `PipelineModel` (`invoke`, `resume`, `snapshot`, `asStep`), version 1.
- **Ports** — `ResearchModels` (role calls: Analyst, Writer, Summarizer, Judge), `ResearchSearch`
  (`@owlmeans/llm`'s `WebSearch['search']`), an `LlmReader`, a `PackageInspector`, a `ResearchStore`
  (transient sources + lasting outputs) and the optional `ResearchScreen` judge.
- **Two guards per step** — a state marker and a durable record in the run's area of the sources store,
  so a resumed (or re-invoked) run repeats no search, clone or model call that finished.
- **Screening** — a deterministic hidden-instruction signal pass on every cloned source; strong signals
  drop a source, weak ones are noted, a wired judge decides with a verbatim quote.
- **Gaps** — why an output is thinner than asked (`search-unavailable`, `search-timeout`, `source-screened`,
  `not-genuine`, …), always recorded, never thrown.

## Usage

```ts
import {
  createDirectoryResearchStore, makeResearchJudge, makeResearchModels, makeResearchPipelines,
} from '@owlmeans/web-research'
import { createLlmReader } from '@owlmeans/llm-reader'

const models = makeResearchModels(exec, { executions })            // an @owlmeans/llm execution
const pipelines = makeResearchPipelines({
  models,
  reader: createLlmReader({ fetch: pinnedFetch }),
  search: llm.webSearch('researcher'),
  screen: makeResearchJudge(models),
  store: createDirectoryResearchStore({ sourcesRoot: '/tmp/research/sources', outputsRoot: '/srv/docs' }),
  runs,                                                             // a PipelineRunStore: resumable runs
})

const report = await pipelines.implementation.invoke({
  input: { topic: 'lead scoring best practices for B2B CRM', context: brief, outputs: { doc: 'research/lead-scoring.md' } },
}, { runId: 'research-1', deps: {}, scope: projectId })
report.state.output   // { doc: 'research/lead-scoring.md', sources: [{ url, title }], gaps: [] }
```

```ts
// An existing product, and a design to take the look from (its brand marks listed apart)
await pipelines.project.invoke({ input: { url: 'https://twenty.com', outputs: { doc: 'research/twenty.md' } } }, args)
await pipelines.design.invoke({ input: { url: 'https://example.com', outputs: { doc: 'research/design.md' } } }, args)
```

```ts
// Packages: verdicts first, notes for genuine ones only; then a validated SKILL.md
const pipelines = makeResearchPipelines({ ...wiring, inspector: createPackageInspector({ registry }) })
await pipelines.packages.invoke({ input: { packages: [{ name: 'dayjs' }, { name: 'loadsh' }], outputs: { doc: 'research/packages.md' } } }, args)
await pipelines.skill.invoke({ input: { name: 'dayjs', skillName: 'pkg-dayjs', outputs: { doc: 'skills/pkg-dayjs/SKILL.md' } } }, args)
```

`registry` is an `@owlmeans/package-inspector` `PackageRegistry` — for npm, `createNpmRegistry()` from
`@owlmeans/package-registry-npm`.

```ts
// The pure pieces
import { injectionSignalsHelper, skillValidator, ScreenTextKind } from '@owlmeans/web-research'

injectionSignalsHelper.signals(html, { kind: ScreenTextKind.Html })   // [{ kind: 'override', excerpt }]
skillValidator.validate(text, 'pkg-dayjs')                              // { ok, errors: [...], chars }
```

To resume, build the pipelines again over the same `runs` and `store` and call
`pipelines.<name>.resume(runId, { deps: {} })`, or `invoke` the same `runId`.

## Configuration

`makeResearchPipelines(wiring)` — `ResearchWiring`:

| Field | Purpose |
|---|---|
| `models` (required) | `makeResearchModels(exec, { executions, roles?, efforts?, outputs?, spectator? })` or `createResearchModels({ model, helper? })`. |
| `store` (required) | A `ResearchStore`; `createDirectoryResearchStore({ sourcesRoot, outputsRoot })` on two local directories. |
| `reader` (required) | An `LlmReader`; its guard, proxies and injected `fetch` govern every request. |
| `search` | A `ResearchSearch` (`llm.webSearch(alias)`); without it implementation research writes no report. |
| `inspector` | A `PackageInspector`; required by `research:packages` and by `research:skill` without notes. |
| `screen` | A `ResearchScreen` judge (`makeResearchJudge(models)`); without it the signal rule decides. |
| `renderer` | A `PageRenderer` (`@owlmeans/llm-reader-playwright`) a design bundle is rendered with; borrowed, never closed. |
| `spectator` | Handed to every web search. |
| `strongSignals` | The signal kinds that drop a source without a judge; `STRONG_SIGNAL_KINDS` by default. |
| `limits` | Any subset of `RESEARCH_LIMITS` (below). |
| `runs`, `checkpointer`, `fatal`, `maxStateChars`, `trace`, `onProgress` | The `@owlmeans/agent` runner's options; without `runs` a run is not resumable. |

`ResearchDeps` (per run): `key` — the reader's proxy key.

`RESEARCH_LIMITS`: `maxQueries` 3, `maxResults` 5, `collectSpare` 2, `maxProjectPages` 8,
`maxProjectDepth` 2, `maxPackages` 5, `maxDocsPages` 6, `docsDepth` 1, `sourceChars` 40 000,
`promptTokens` 30 000, `minSourceTokens` 200, `contextChars` 6 000, `instructionChars` 2 000,
`readmeChars` 30 000, `notesChars` 60 000, `skillChars` 12 000, `judgeChars` 24 000,
`collectTimeoutMs` 60 000, `implementationCollect` (`IMPLEMENTATION_COLLECT_LIMITS`: the page only),
`designCollect` (`DESIGN_COLLECT_LIMITS`: the page with its styles, fonts and pictures), `crawlDelayMs`
(unset: the reader's), `maxGaps` 40. Input values (`maxQueries`, `maxResults`, `maxPages`, `depth`) are
clamped to them.

## Security and limits

- **Sources are data, never instructions.** Every cloned source runs the signal pass before any
  model reads it; a dropped source's files are removed at once, and synthesis prompts say pages are
  data.
- **The judge needs proof** — `makeResearchJudge` counts an injection only with a sentence the source
  really holds.
- **Every request goes through the reader** — its address guard, robots-honouring crawl and limits;
  the pipelines open no connection of their own.
- **Budgets are code** — sources capped at `sourceChars`, fitted into `promptTokens`; context,
  instruction, readme, notes and judge inputs capped.
- **Stores are confined** — absolute paths, `..`, backslashes and NUL are refused
  (`ResearchStoreError`); files are written beside their target and renamed into place.
- **Generated skills carry only `name` and `description`** — never `allowed-tools`.
- **Logs** carry ids, counts and a URL's origin and path — never page text, prompts or answers.

## API

| Export | Purpose |
|---|---|
| `makeResearchPipelines(wiring)` | `{ implementation, project, design, packages, skill }`, each a `PipelineModel<State, ResearchDeps>`. |
| `makeResearchModels(exec, options)` · `createResearchModels({ model, helper? })` | The `ResearchModels` port: `text`, `json` (ajv-validated), `reader()`. |
| `createDirectoryResearchStore({ sourcesRoot, outputsRoot })` | A `ResearchStore` on two local directories. |
| `injectionSignalsHelper` · `createInjectionSignalsHelper()` | The signal pass: `signals(text, { kind?, hidden? })`, `readable(text, kind?)`, `strong(signals, kinds?)`. |
| `makeResearchJudge(models, { maxChars? })` | The shipped `ResearchScreen`: one Judge-role call per flagged source. |
| `skillValidator` · `createSkillValidator({ maxChars?, sections? })` | `validate(text, skillName, expect?)`, `normalize(text, skillName)`, `parts(text)`. |
| `makeDesignAnalyzer({ models?, renderer?, maxStylesheets? })` | The design stage alone: `analyze({ root, entry? })` → `DesignAnalysis`, offline. |
| `implementationSpec`, `projectSpec`, `designSpec`, `packagesSpec`, `skillSpec` | The pipeline specs (version 1). |
| `ResearchRole`, `ResearchPipeline`, `ImplementationStep`, `ProjectStep`, `DesignStep`, `PackagesStep`, `SkillStep`, `ResearchGapCode`, `ScreenVerdict`, `SourceStatus`, `ScreenTextKind`, `InjectionSignalKind` | Enums. |
| `RESEARCH_LIMITS`, `IMPLEMENTATION_COLLECT_LIMITS`, `DESIGN_COLLECT_LIMITS`, `RESEARCH_RUNS_DIR`, `PROJECT_CRAWL_INTENT`, `DOCS_CRAWL_INTENT`, `SKILL_NAME_PATTERN`, `SKILL_DESCRIPTION_CHARS`, `SKILL_SECTIONS`, `DEFAULT_DESIGN_ENTRY` | Limits and fixed values. |
| `STRONG_SIGNAL_KINDS`, `INVISIBLE_CHARS`, `TAG_CHARS`, `TAG_CHAR`, `BIDI_CHARS`, `INVISIBLE_NOISE`, `HIDDEN_COMMENTS`, `HIDDEN_ELEMENT`, `HIDDEN_PROSE_WORDS`, `ADDRESSED_TO_AI`, `OVERRIDES`, `HTML_INERT_BLOCKS`, `SIGNAL_EXCERPT_CHARS`, `SIGNALS_SHOWN` | The signal pass's patterns and thresholds. |
| `RESEARCH_PERSONAS`, `RESEARCH_OUTPUT_TOKENS`, `JUDGE_INSTRUCTION`, `InjectionAnswerSchema`, `PLAN_INSTRUCTION`, `SYNTHESIZE_INSTRUCTION`, `SUMMARIZE_INSTRUCTION`, `NOTES_INSTRUCTION`, `SKILL_INSTRUCTION`, `REPAIR_INSTRUCTION` | Role personas and output budgets, and the constant instruction of each model step. |
| `WebResearchError`, `ResearchConfigError`, `ResearchStoreError`, `ResearchModelError`, `ResearchSkillError` | The `ResilientError` family (`web-research:<kind>:…`; `ResearchSkillError.errors` lists the validator's faults). |

Types: `ResearchWiring`, `ResearchPipelines`, `ResearchSearch`, `ResearchDeps`, `ResearchLimits`,
`ResearchGap`, `ResearchSourceRef`, `ResearchModels`, `ResearchModelsOptions`, `MakeResearchModelsOptions`,
`ResearchInput`, `ResearchCallOptions`, `ResearchStore`, `ResearchSources`, `ResearchOutputs`,
`DirectoryResearchStoreOptions`, `InjectionSignal`, `InjectionSignalOptions`, `InjectionSignalsHelper`,
`ResearchScreen`, `ScreenContext`, `ScreenJudgement`, `InjectionAnswer`, `ResearchJudgeOptions`,
`SkillSection`, `SkillParts`, `SkillValidation`, `SkillExpectation`, `SkillValidatorOptions`,
`SkillValidator`, `DesignAnalyzer`, `DesignAnalyzerOptions`, `DesignAnalysis`, `DesignTarget`,
`DesignOutlineBlock`, `DesignHeading`, `DesignMarks`, and each pipeline's input, output, state and
record types (`ImplementationInput`/`Output`/`State`, `ProjectInput`/…, `DesignInput`/…,
`PackagesInput`/…, `PackageRequest`, `PackageVerdictSummary`, `PackageNotesRef`, `SkillInput`/…).

The package has one entry point; there are no subpath exports.

## Common pitfalls

- Read `result.state.output` — the run's own files are gone after `cleanup`.
- Without `search`, implementation research writes no report (`search-unavailable`); a search that
  times out for good (`LlmSearchTimeoutError`, a silent delegated performer) stops the searching
  (`search-timeout`, the later queries not asked).
- Without `inspector`, packages research writes nothing; only genuine packages get notes or skills.
- Pass the same `runs` and `store` to resume; new models are fine.
- A caller's `bundleRoot` is read in place and never removed.
- A skill that fails validation again after one repair round fails the run (`ResearchSkillError`)
  and writes nothing.

## Related packages

- [`@owlmeans/llm-reader`](../llm-reader) — collect, crawl and the design analyst every pipeline reads through
- [`@owlmeans/llm-reader-playwright`](../llm-reader-playwright) — the renderer a design bundle can be rendered with
- [`@owlmeans/package-inspector`](../package-inspector) — package verdicts and the `PackageRegistry` port
- [`@owlmeans/package-registry-npm`](https://github.com/owlmeans/connect/tree/main/packages/package-registry-npm) (OwlMeans connect) — the npm registry adapter the inspector reads
- [`@owlmeans/llm`](../llm) — web search, executions, token budgets · [`@owlmeans/agent`](../agent) — pipelines, resume, `asStep`

The `web-research` skill covers the same package for agents.

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
