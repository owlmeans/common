# @owlmeans/agent-common

Serializable contracts for OwlMeans agents and LLM pipelines: conversation identity, the run
lifecycle flow, the pipeline declaration and run row, the cumulative-results records with their
deterministic renderers, and the record shapes an application persists. Runtime-free by design — no
LangChain, no LangGraph, no storage driver — so a backend, a reconciler, an operator console or a
browser bundle imports it to read what an agent wrote and to say where a pipeline run stands. It does
not run anything: executing agents and pipelines, binding stores and cutting result views is the
runtime, [`@owlmeans/agent`](../agent). The package's skill is `agent-common`.

## Installation

```bash
bun add @owlmeans/agent-common@^0.1.18-rc.48
```

## Concepts

- **Conversation** — `ConversationRef` (`{ conversationId, scope }`): the thread a run belongs to and
  the wider subject its memory is filed under. `conversationFor` derives both from an `LlmPurpose`
  dedication (`<kind>:<id>`).
- **Run lifecycle** — `agentRunFlow`, an `@owlmeans/flow` declaration with steps `Received` →
  `Prepared` → `Working` → `Finalizing` → `Finished`, plus a terminal `Failed`. The steps say how far
  a run got; nothing resumes one.
- **Pipeline** — `PipelineSpec`, a declaration of named steps joined by `after` edges. It is the
  resumable unit; `makePipelineSpecModel(spec)` validates and orders it.
- **Pipeline run** — `PipelineRun`, the one authority on where a run stands: status, `completed` /
  `pending` steps, `state` as JSON **text** with `stateChars`, and `heartbeatAt`.
- **Cumulative results** — `CumulativeResultFact`s a step produced, collected into a
  `CumulativeResultEntry` per step, rendered full or names-only so later steps reuse the
  authoritative names.
- **Port** — a store name (`AGENT_CONVERSATION_STORE`, …) a consumer binds its own storage under. An
  unbound port is not an error; the plugin that needs it degrades to a no-op.

## Usage

### Derive a conversation and cap text

```typescript
import { DEFAULT_SUMMARY_CHARS, conversationFor, truncateAt } from '@owlmeans/agent-common'

const ref = conversationFor({ type: 'coder', dedication: `project:${projectId}` })
// { conversationId: 'project:<id>', scope: '<id>' } — an empty dedication becomes 'anonymous'

const summary = truncateAt(modelAnswer, DEFAULT_SUMMARY_CHARS) // cuts on a paragraph/line/sentence/word, marks with '…'
```

### Drive the run lifecycle

```typescript
import { makeFlowModel } from '@owlmeans/flow'
import { AgentRunStep, AgentRunTransition, agentRunFlow } from '@owlmeans/agent-common'

const model = await makeFlowModel(agentRunFlow)
model.transit(model.next().transition, true) // Received → Prepared: one automatic edge per step
model.transit(AgentRunTransition.Work, true)

model.step().step === AgentRunStep.Working
```

### Declare and validate a pipeline

```typescript
import { makePipelineSpecModel, PipelineSpecError } from '@owlmeans/agent-common'
import type { PipelineSpec } from '@owlmeans/agent-common'

export const scaffoldPipeline: PipelineSpec = {
  alias: 'scaffold',
  version: 2, // bump on every added, removed or renamed step
  steps: [
    { step: 'plan', title: 'Plan the change' },
    { step: 'types', after: ['plan'] },
    { step: 'api', after: ['types'] },
    { step: 'web', after: ['types'] },
    { step: 'wipe-preview', after: ['api', 'web'], nonIdempotent: true },
  ],
}

const spec = makePipelineSpecModel(scaffoldPipeline)
spec.validate()              // throws PipelineSpecError naming every fault at once
spec.orderSteps()            // ['plan', 'types', 'api', 'web', 'wipe-preview']
spec.descendants('types')    // what a resume from 'types' re-runs, 'types' included
spec.ancestry('wipe-preview') // [{ step: 'plan', depth: 3 }, { step: 'types', depth: 2 }, …]
```

### Render a step's results

```typescript
import { CumulativeFactKind, CumulativeResultSource, cumulativeResultsHelper } from '@owlmeans/agent-common'

const { full, compact } = cumulativeResultsHelper.renderResultEntry({
  label: 'types',
  source: CumulativeResultSource.Extracted,
  facts: [
    { kind: CumulativeFactKind.Type, name: 'User', signature: '{ id: string; email: string }', specifier: '@app/common' },
    { kind: CumulativeFactKind.Endpoint, name: 'user.create', ref: 'User', attrs: { method: 'POST', path: '/api/users' } },
  ],
})

const spec = cumulativeResultsHelper.mergeResultsSpecs(pipelineResults, deploymentOverlay)
```

## API

### Functions and helpers

| Export | Purpose |
|---|---|
| `conversationFor(purpose, override?)` | Derives a `ConversationRef` from an `LlmPurpose` dedication — the thread identity an agent run belongs to |
| `truncateAt(text, max)` | Boundary-aware truncation; every character cap in the family lands here |
| `makePipelineSpecModel(spec)` | `PipelineSpecModel`: `validate`, `orderSteps`, `descendants`, `ancestry`, `ancestors`, `stepOf`, `record` |
| `validatePipelineSpec`, `orderPipelineSteps`, `pipelineDescendants`, `pipelineStep` | Deprecated wrappers over `makePipelineSpecModel` |
| `cumulativeResultsHelper` (`createCumulativeResultsHelper()`) | `factKey`, `sortFacts`, `renderResultFact`, `renderResultEntry`, `renderResultSummary`, `compareResultOrder`, `rootRunOf`, `resultLabel`, `mergeResultsSpecs` |

### Records and types

| Export | Purpose |
|---|---|
| `agentRunFlow` / `agentFlows` / `AgentRunStep` / `AgentRunTransition` | The `@owlmeans/flow` lifecycle a run is driven through |
| `ConversationEvent` (+ `ConversationEventInput`) | One finished run, compacted: `summary` (what happened) + `advice` (what to do next) |
| `MemoryNode` / `MemoryEvent` (+ `MemoryEventInput`) | Agent-authored memory: a subsystem graph node, and an entry in a bounded sequence |
| `AgentRunMessage` | What a transport carries; execution state travels by reference |
| `PipelineSpec`, `PipelineStepSpec`, `PipelineState` | The declaration and the scalar state passed between steps |
| `PipelineRun`, `PipelineRunInquiry`, `PipelineProgress` | The persisted run row, the question a `Waiting` run stopped on, runner progress |
| `PipelineSpecModel`, `PipelineStepDepth` | The spec model and an ancestor with its edge distance |
| `CumulativeResultFact`, `CumulativeResultEntry`, `RenderableResultEntry`, `RenderedResultEntry`, `ResultRenderCaps` | Cumulative-results records and rendering |
| `CumulativeResultsSpec`, `StepResultsSpec`, `ResultSummarySpec`, `ResultFactQuery`, `CumulativeResultsHelper` | The JSON-safe declaration, a facts query, the helper interface |

### Constants and enums

| Export | Value / members |
|---|---|
| `AGENTS_SERVICE` | `'agents'` — plural, so it never collides with an app's own `agent` service |
| `AGENT_CONVERSATION_STORE`, `AGENT_MEMORY_GRAPH_STORE`, `AGENT_MEMORY_EVENTS_STORE`, `AGENT_PIPELINE_RUN_STORE`, `AGENT_CHECKPOINT_STORE`, `AGENT_CUMULATIVE_RESULT_STORE` | Port names |
| `AGENT_RUN_FLOW`, `SCOPE_SEP`, `INQUIRY_ANSWERS_KEY`, `RESULTS_EVERY_STEP` | `'agent-run'`, `':'`, `'answers'`, `'*'` |
| `DEFAULT_SUMMARY_CHARS` 1200 · `DEFAULT_ADVICE_CHARS` 400 · `DEFAULT_EVENT_WINDOW` 3 · `DEFAULT_MEMORY_NODE_CHARS` 2000 · `DEFAULT_MEMORY_EVENTS_LIMIT` 50 | Run and memory caps |
| `DEFAULT_MAX_STATE_CHARS` 256 000 · `DEFAULT_STEP_ATTEMPTS` 1 · `DEFAULT_STEP_TIMEOUT` 1 800 000 ms | Pipeline defaults |
| `DEFAULT_RESULTS_MAX_CHARS` 12 000 · `DEFAULT_RESULT_ENTRY_CHARS` 4 000 · `DEFAULT_RESULT_COMPACT_CHARS` 400 · `DEFAULT_RESULTS_WINDOW` 2 · `DEFAULT_RESULT_SUMMARY_CHARS` 600 | Cumulative-results caps |
| `AgentRunStatus` | `Ok`, `Failed` |
| `PipelineRunStatus` | `Running`, `Done`, `Failed`, `Aborted`, `Waiting` |
| `CumulativeResultSource` | `Extracted`, `Rebuilt`, `Seeded`, `Summarized` |
| `CumulativeFactKind` | `Type`, `Symbol`, `Endpoint`, `Resource`, `File` |
| `ResultViewMode` | `Full`, `Compact`, `Omitted` |

### Errors

All extend `AgentCommonError` (a `ResilientError`) and are registered for marshalling.

| Error | Thrown when |
|---|---|
| `AgentRunStateError` | a run is asked to advance along a transition its step does not offer |
| `PipelineSpecError` | a declaration is not runnable — every fault in one message |
| `PipelineVersionError` | a resume targets a run started under another spec `version` |
| `PipelineUnknownStepError` | a step name the spec does not declare |
| `PipelineNotIdempotentError` | a resume would re-enter a completed `nonIdempotent` step without `force` |
| `PipelineStateTooLargeError` | a step's state exceeds the run row's cap |
| `PipelineNotResumableError` | a step asks a question with no one to answer and no run store to park in |

## Conventions worth knowing

**Timestamps are ISO strings, never `Date`.** These contracts cross process boundaries and storage
backends and must survive `JSON.stringify` unchanged. A store whose backend prefers dates converts
at its own adapter boundary.

**Flow steps are lifecycle stages, not conversational turns.** `FlowPayload` holds flat scalars
only and a ReAct loop's turn count is unbounded, so the loop lives inside the `Working` step and
only its counter travels in the payload. What the steps buy is the ability to say how far a run got
when it ended. Resumable work is a pipeline.

**Each working step has exactly one non-explicit outgoing transition**, so `FlowModel.next()` always
has an unambiguous answer and a driver can advance a run without knowing the vocabulary. `Fail` is
marked explicit precisely so it never becomes that automatic answer.

**Port names are exported, ports are not bound here.** `AGENT_CONVERSATION_STORE` and friends are
the keys a consumer registers its own storage under. An unbound port is not an error — the plugin
that needs it degrades to a no-op. A pipeline without `AGENT_PIPELINE_RUN_STORE` still runs but
cannot be resumed.

**A rendered result entry is deterministic.** Facts sort by kind (file facts last), name and
location; nothing that varies (timestamp, run id, revision) is rendered, and over its cap an entry
drops whole facts and says how many.

## Common pitfalls

- A pipeline state is scalars and keys; a document in it fails the step with
  `PipelineStateTooLargeError` rather than being truncated — store artifacts elsewhere and pass keys.
- Forgetting to bump `version` after renaming a step lets a resume skip work silently; a bumped
  version makes the resume refuse instead.
- `nonIdempotent: true` with `attempts > 1` is a validation fault.
- `ancestry`/`ancestors` exclude the named step, `descendants` include it.
- Caps are applied by truncation after the model answers; restating them in a prompt is not a cap.
- A `Waiting` run's `heartbeatAt` does not move — do not treat it as stale.

## Related packages

- [`@owlmeans/agent`](../agent) — the runtime that executes runs and pipelines and writes these records
- [`@owlmeans/llm-common`](../llm-common) — `LlmPurpose` and `Inquiry`
- [`@owlmeans/flow`](../flow) — the flow model the run lifecycle is declared against
- [`@owlmeans/resource`](../resource) — `ResourceRecord`, the base of every persisted record
- [`@owlmeans/error`](../error) — `ResilientError`, the base of the error family

<!-- owlmeans:agent-guidance:start -->
## Agent guidance

This package ships embedded agent skills under `agent-meta/`. After installing your
`@owlmeans/*` packages, run the OwlMeans agent-skills installer to place them into
your project's skill store (`.agents/skills/`):

```sh
npx @owlmeans/agent-skills@^0.1.18-rc.49
```

The embedded files are version-matched to this package release. Do not edit them
directly — they are regenerated on each publish. To contribute guidance edits,
open a PR against the source monorepo.
<!-- owlmeans:agent-guidance:end -->
