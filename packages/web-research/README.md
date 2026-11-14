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
bun add @owlmeans/web-research@^0.2.0-alpha.0
```

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
- **Gaps** — why an output is thinner than asked (`search-unavailable`, `source-screened`,
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

```ts
// The pure pieces
import { injectionSignalsHelper, skillValidator, ScreenTextKind } from '@owlmeans/web-research'

injectionSignalsHelper.signals(html, { kind: ScreenTextKind.Html })   // [{ kind: 'override', excerpt }]
skillValidator.validate(text, 'pkg-dayjs')                              // { ok, errors: [...] }
```

## API

`makeResearchPipelines`; `createResearchModels`, `makeResearchModels`; `createDirectoryResearchStore`;
`injectionSignalsHelper`, `createInjectionSignalsHelper`; `makeResearchJudge`; `skillValidator`,
`createSkillValidator`; `makeDesignAnalyzer`; specs `implementationSpec`, `projectSpec`, `designSpec`,
`packagesSpec`, `skillSpec`; enums `ResearchRole`, `ResearchPipeline`, `ImplementationStep`,
`ProjectStep`, `DesignStep`, `PackagesStep`, `SkillStep`, `ResearchGapCode`, `ScreenVerdict`,
`SourceStatus`, `ScreenTextKind`, `InjectionSignalKind`; constants `RESEARCH_LIMITS`,
`IMPLEMENTATION_COLLECT_LIMITS`, `DESIGN_COLLECT_LIMITS`, `PROJECT_CRAWL_INTENT`, `DOCS_CRAWL_INTENT`,
`SKILL_NAME_PATTERN`, `SKILL_DESCRIPTION_CHARS`, `SKILL_SECTIONS`, `STRONG_SIGNAL_KINDS`, the signal
patterns, the instructions and personas; errors `WebResearchError`, `ResearchConfigError`,
`ResearchStoreError`, `ResearchModelError`, `ResearchSkillError`; every input, output, state and port type.

## Common pitfalls

- Read `result.state.output` — the run's own files are gone after `cleanup`.
- Without `search`, implementation research writes no report (`search-unavailable`).
- Without `inspector`, packages research writes nothing; only genuine packages get notes or skills.
- Pass the same `runs` and `store` to resume; new models are fine.
- A caller's `bundleRoot` is read in place and never removed.

## Related packages

`@owlmeans/llm-reader` (collect, crawl, design analyst), `@owlmeans/llm` (web search, executions),
`@owlmeans/agent` (pipelines), `@owlmeans/package-inspector` (verdicts); npm facts come from connect's
`@owlmeans/package-registry-npm`.
