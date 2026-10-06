---
name: agent
description: How to use @owlmeans/agent — context-aware LLM agents over the LangGraph functional API, and resumable PIPELINES over a checkpointed StateGraph, with the AgentPlugin and PipelinePlugin seams, CUMULATIVE PIPELINE RESULTS (cumulativeResultsPlugin), conversation-summarization and memory plugins, and storage-independent ports. Auto-invoked when importing makeAgentModel, makePipeline, makeCheckpointSaver, appendAgentsService, an agent or pipeline plugin, cumulativeResultsPlugin, toolHelper, or an agent store.
user-invocable: false
---
<!-- AUTO-GENERATED — do not edit. Regenerate via sync-agent-meta. -->

# @owlmeans/agent

**Layer:** Cross-cutting domain
**Install:** `"@owlmeans/agent": "^0.1.18-rc.48"` in `dependencies`, plus the `@langchain/core` and
`@langchain/langgraph` **peers**

The agent runtime. Contracts live in `@owlmeans/agent-common`.

## Key exports

| Export | Description |
|---|---|
| `makeAgentModel(options)` | An agent over the LangGraph functional API: `invoke`, `use`, `conversation`. |
| `makePipeline(spec, options)` | A resumable state machine over a checkpointed LangGraph `StateGraph`: `invoke`, `resume`, `snapshot`, `asStep`. `options.plugins` seats `PipelinePlugin`s. |
| `cumulativeResultsPlugin(options)` · `CUMULATIVE_RESULTS_PLUGIN` · `DEFAULT_RESULT_SUMMARY_SCHEMA` | CUMULATIVE PIPELINE RESULTS — tells every step what its predecessors produced; see below. |
| `PipelinePlugin` and its events, `StepResults`, `PipelineParentRef` | The pipeline plugin seam (types, from `./pipeline`). |
| `makeCheckpointSaver(store)` | A `BaseCheckpointSaver` over the `CheckpointStore` port. |
| `makeAgentsService(options?, alias?)` · `appendAgentsService(ctx, options?, alias?)` · `agentServiceApi(options, self)` | The service, and its half without `createService` for composition. |
| `summarizePlugin(options?)` | Compacts each finished run into `summary` + `advice`; replays the last few. |
| `memoryGraphPlugin(options?)` · `makeMemoryGraphApi(store, options?)` | Durable notes filed by subsystem, with links. Plugin **and** plain API. |
| `memoryEventsPlugin(options?)` · `makeMemoryEventsApi(store, options?)` | A bounded, ordered record of what happened. |
| `toolHelper.{safeInvokeTool, toErrorResponse, isToolError}` | The never-throwing tool contract. |
| `compactionHelper.{composeCompaction, renderTranscript, messageText}`, `composeRollingSummary` | Summary primitives; both composers are total. |
| `makeStaticFlowProvider(flows)` | The server-side `FlowProvider` `@owlmeans/flow` does not ship. |
| `inProcessTransport()`, `AgentTransport` | The scaling seam; default carries messages by direct call. |
| `createMemory*Store()` | In-memory reference implementations of every port, including `createMemoryPipelineRunStore`, `createMemoryCheckpointStore` and `createMemoryCumulativeResultStore`. |
| `AgentError` · `AgentMissconfiguredError` · `AgentLoopExhaustedError` | The `ResilientError` family. `AgentMissconfiguredError` is a model or tool set the agent was built without; `AgentLoopExhaustedError` is the tool loop hitting its ceiling. |
| `DEFAULT_MAX_TURNS` (64) · `DEFAULT_PLUGIN_ORDER` · `DEFAULT_ACTION` · `DEFAULT_ENTRYPOINT` | The loop and plugin defaults. |

Subpath exports: `./plugins`, `./helpers`, `./stores`, `./pipeline`, `./checkpoint`.

## Pipelines

A pipeline is a **state machine over named steps** whose position is persisted at every step
boundary, so a run killed anywhere continues from the step it stopped at rather than from zero.

```ts
const spec: PipelineSpec = {
  alias: 'vib:story:design', version: 1,
  steps: [
    { step: 'screens' },
    { step: 'ux', after: ['screens'] },
    { step: 'data', after: ['screens'] },          // runs BESIDE `ux`
    { step: 'persist', after: ['ux', 'data'] },    // joins BOTH
  ],
}

const pipeline = makePipeline<State, Deps>(spec, { steps, runs, checkpointer, fatal })
await pipeline.invoke(seed, { runId, deps, scope: projectId })
await pipeline.resume(runId, { deps, from: 'data' })
```

**`StateGraph`, not the functional API.** A resume must be able to name the step it starts at, and
only a graph has named nodes; `entrypoint`/`task` identifies a task by its positional call ordinal,
which renumbers on any edit to the function — under a file watcher that is the common case, not the
corner case. The functional API stays exactly where it is, inside `makeAgentModel`'s ReAct loop.

**Edges are `after: string[]`.** Several steps naming one predecessor fan out; one step naming
several joins them, and the join waits for ALL of them (the array form of `addEdge`, which is a
barrier — separate single edges would fire on the first). Branching is `skipWhen`, never a
conditional edge: a branch expressed as an edge is invisible to a resume, while a branch expressed
as a guard is the same mechanism that makes a resume correct.

**The graph is compiled per run and the steps close over their dependencies.** Passing collaborators
through the engine's config would make a run depend on which config keys a given LangGraph minor
propagates into a node body. A closure cannot be lost.

## Pipeline plugins

```ts
interface PipelinePlugin<S, C> {
  alias: string; order?: number                     // seated by alias, run by ascending order
  enter?: (event) => void        // once per invoke/resume: mode fresh|continue|restart, inherited steps, parent
  beforeStep?: (event) => { results?: StepResults } | void   // the step WILL run; may hand it ctx.results
  afterStep?: (event) => void    // patch merged into state, BEFORE the row commit marks the step done
  passStep?: (event) => void     // reason: 'skipped' (guard) | 'failed' (optional step, run goes on)
  exit?: (event) => void         // once, with the result the caller is about to receive
}
```

**A plugin watches a run; it never writes the state and never decides where the run stands.**
Whatever it keeps, it keeps in a store of its own. `afterStep` runs before the commit so a plugin's
own write lands before the step is durably done — a crash between the two re-runs the step rather
than leaving a done step with nothing recorded about it.

**A plugin that throws costs a warning, never the run** — unless `options.fatal` calls the error
fatal: then it takes the exact path a fatal step error takes, the row written `Failed` first and the
error rethrown (from `enter`, `passStep` and `exit` too). The runner's stop signal passes through.

**Seating nothing changes nothing.** Every hook site is guarded, so a pipeline without plugins awaits
nothing it did not await before — its parallel steps interleave identically and its step context
has no `results` key. `tests/pipeline-compat.spec.ts` pins this with golden rows, trace lines and
progress events recorded from the runner before the seam existed; it must stay green unedited.

`asStep` passes the composing step to the child as `PipelineInvokeArgs.parent` (read-only:
pipeline, run id, step, and the parent step's `results`); the child's plugins see it on `enter`.

## Cumulative pipeline results

After each step, code reads what the step produced into FACTS (`CumulativeResultFact`: a type's
shape and import specifier, an endpoint's method/path/guard, a resource's table, a file) and every
later step is told them — so it uses the authoritative names instead of re-deriving them.

```ts
const pipeline = makePipeline<State, Deps>(spec, {
  steps, runs,
  plugins: [cumulativeResultsPlugin<State, Deps>({
    spec: { steps: { types: { extractors: ['ts-types'], full: ['endpoints'] } } }, // or run => spec | null
    extractors: { 'ts-types': { scope: ({ deps }) => deps.glob('src/types/**'), extract: readTypes } },
    store,                                    // CumulativeResultStore; share it with composed pipelines
  })],
})
// inside a step:
const exec = executions().withResults(taskExec, ctx.results?.view)   // every model built from it composes the view
ctx.results?.record({ files: written })                             // what the step touched
ctx.results?.facts({ kind: 'type', name: 'User' })                  // typed query for code
```

- **Extractors are deterministic code, never a model call.** A rebuild after a crash must find
  exactly what the first pass found. `scope` recomputes the files an extractor answers for from
  DURABLE inputs (state keys, the file tree), never from what a step reported — it is what a rebuild
  reads. Declarations name extractors; the plugin holds the code.
- **The ledger is an optimization, never the authority.** A fresh start or restart clears the run's
  own entries (and those of runs composed under it); a continuation loads them and silently
  REBUILDS any missing entry of a finished step from its durable scope. Resume correctness never
  depends on the store; a failing store is a warning. A step's `record({ facts })`-only facts with
  no extractor cannot be rebuilt.
- **A view is cut once per step**: predecessors only (siblings may not have run), full within
  `window` edges (default 2) or when the producer names the step in `full` (`'*'` for every step),
  names only beyond, never shown when named in `omit`. Over `maxChars` the OLDEST entries not naming
  the step go to names only, then out (listed in `view.omitted`); named ones last; an entry's own
  text is never cut. `facts()` answers from every visible entry regardless of the prompt budget.
- **A fact belongs to the first entry that produced it** — the step's predecessors and the runs
  composed under the step itself. A later re-extraction never duplicates it.
- **A later step that rewrites an earlier entry's files refreshes it**: re-extracted from its own
  sources, revision bumped, facts about untouched files kept (`refresh: false` opts out). Entries of
  other pipelines are never refreshed — their extractors live elsewhere.
- **A skipped step** keeps a stored entry, or gets one rebuilt from its files; **a failed optional
  step** gets a `partial` entry from what it left behind.
- **Model summaries are OFF unless a step declares `summary`** and the plugin has `summarize`.
  The request carries a ready prompt and schema; the answer is rendered deterministically, capped
  in code, always labelled "not verified", and a failure is a warning without the summary.
- **A composed run shares its parent's ledger** (parent's, else the root run id); its steps see the
  parent's view for the composing step, and the parent's later steps see the child's entries,
  labelled `<composingStep>/<childStep>` and ordered inside the composing step. Both pipelines must
  be given the SAME store.
- **Seeds** are facts known before any step ran, visible to every step. A declaration resolved to
  `null`/`false` leaves that run without `ctx.results` at all.

## The agent plugin seam

```ts
interface AgentPlugin {
  alias: string
  order?: number                                   // lower first, default 50
  context?: (run) => Promise<string[]>             // what the agent knows
  tools?: (run) => AgentToolSet                    // what it can do
  onTurn?: (run, messages) => Promise<void>        // watch it work
  onFinish?: (run, result, outcome) => Promise<void> // act when it stops
}
```

Registered with `agent.use(plugin)` or `service.use(plugin)`; seated **by alias**, so re-registering
replaces rather than duplicating. Everything memory- and summary-related is one of these; the loop
itself does not know those features exist.

## Rules

**Contributed context goes to `PromptBlock.Context` and nowhere else.** It is the only block a
provider will not put a cache breakpoint on — the Anthropic plugin explicitly refuses to mark a
trailing `Context`. Volatile material anywhere above it invalidates the `Role` + `Skills` prefix
that every call sharing a persona pays for.

**A run that exceeds `maxTurns` throws `AgentLoopExhaustedError`.** The ceiling counts tool rounds
(`DEFAULT_MAX_TURNS` is 64, `AgentOptions.maxTurns` overrides it), and it is reached only when the
model keeps calling tools without ever answering — so catch that error by name rather than treating
every failed run alike: it says the loop ran out of room, not that a tool or the model failed.

**`toolHelper.safeInvokeTool` must never throw.** The loop wraps it in a LangGraph `task`, and a rejected task
aborts the whole superstep: every sibling tool call in the same parallel batch dies with AbortError
and the run ends on "Multiple errors occurred during superstep 0", discarding work the others had
already finished. A tool failure comes back as `{ error }` the model can read and correct — most are
the model's own mistake, and the error text already names what was expected.

**Tools resolve by `tool.name`, with the map key as a fallback.** `bindTools` advertises the tool's
own name, so a map keyed by a local variable silently loses any tool whose two names drifted apart:
advertised, callable, permanently "not found".

**A prompt plugin's cheap side call has to be wired.** `AgentOptions.utility` is what the run hands
to `PromptComposeParams.utility`, normally `() => executions().utility(exec)`. Nothing resolves one
by default — the agent holds an execution, not the service that knows its policy — so a plugin that
would spend one cheap call on a relevance pick silently degrades until this is passed. What such a
call returns may never land in a cached block; see [[llm-prompt-caching]].

**`compose()` is called with `files: exec.files` and `results: exec.results`.** Without them, a
prompt plugin that resolves knowledge from disk — or the cumulative results block — is silently
inert on agent runs while working fine on plain model calls.

**Use `autoFinish: false` whenever something runs after the agent.** A compaction written before a
validation or build pass describes a state that did not survive it, so its "what to do next" is
advice about a world that no longer exists. Call `result.run.finish(outcome)` once the real outcome
is known — it is idempotent, and a second call is a no-op rather than a second event.

**A failed run is still reported to `onFinish` before the error is rethrown.** A run that vanishes
from the history is one the next session repeats verbatim.

**Plugin failures never fail a run.** Contributing, per-turn work and finalization are each
swallowed with a warning. Memory is an enhancement: losing it costs context, throwing costs the work.

**Give the compaction call a `runName` the application filters.** Every model call carrying a purpose
is streamed to the client, so without it the summary of a run types itself out in the user's view of
that run, immediately after it finished.

**Character caps are applied after the model answers, never asked for in the prompt alone.** A cap in
a prompt is a request. Both composers (`compactionHelper.composeCompaction`, `composeRollingSummary`) are total: with
no model, a failing model or an empty answer they fall back deterministically, so a caller can record
history unconditionally. A failed fold costs detail, never the event.

**Ports, not resources.** `ConversationStore`, `MemoryGraphStore`, `MemoryEventStore`,
`PipelineRunStore`, `CheckpointStore` and `CumulativeResultStore` are narrow interfaces a consumer implements. A port names exactly what the
plugin needs, which is a far smaller surface than CRUD, and anything can satisfy it — a `Resource`,
or a file on disk, which is what the project-history equivalent is. An unbound port is a no-op, not
an error.

**Memory writes merge, they do not replace.** Replacing would make every write a potential act of
forgetting, which is not a decision one caller has the standing to take. A node that outgrows
`maxNodeChars` is compacted through the cheap model, or head-truncated when there is none.

**Only the memory INDEX is injected — names and links, never content.** Bulk-injecting notes spends
the context window on knowledge the run cannot tell apart from what it needs; the agent pulls what it
wants by name.

**The run ROW is the authority on where a run stands — never the LangGraph checkpoint.** The
checkpoint is size-guarded and expires, so a design that reads a run's position out of it has a
silent hole exactly where a crashed run needs an answer. Every reader of a position — a resume, a
reconciler, an operator, a status endpoint — reads the row. With no checkpointer bound at all, a
resume is still correct; the checkpointer buys replay, never correctness.

**Every step is guarded twice.** The runner refuses to re-enter a step its row calls complete, and
the application's `skipWhen` reads a durable marker the step itself wrote. The first covers a clean
crash; the second covers a crash BETWEEN the side effect and the row write, which the first cannot
see. A step that does N undoable things in a loop marks a cursor with `ctx.mark`.

**A pipeline state is scalars and KEYS.** Ids, revisions, markers, lists of codes — never an
artifact. The state is serialized into the row at every step boundary, so a field carrying a
document writes one copy of it per step. Over `maxStateChars` the step FAILS: refused, never
truncated, because a resume replaying from a cut-down state replays from a state that never existed.

**A step failure is an OUTCOME, not a throw.** `invoke`/`resume` return
`{ status: Failed, failedAt, error }`, because every caller has a status, a warning or a record to
write before it decides anything, and a throwing runner puts that in a `catch` where it gets
forgotten. The one exception is `options.fatal`: those are written to the row Failed FIRST and then
rethrown, so an exhausted budget cannot become a result a caller carries on from.

**No default retry.** `attempts` defaults to 1, because retry budgets in this family MULTIPLY — an
outer retry around a model's own inner retry is their product. `attempts > 1` on a `nonIdempotent`
step is refused at build time: an automatic retry is exactly what that flag says must not happen.

**`nonIdempotent` marks a step whose side effect cannot be undone** — a wipe, a purge, a claim
against a rate-limited authority, a model call whose output is already on disk. `resume({ from })`
refuses to re-enter a completed one without `force`.

**A ReAct run is not a resumable unit, and that is why `makeAgentModel` still builds its
`entrypoint` inside `invoke()`.** Its state is an unbounded message list whose tool results are side
effects already applied to the world: re-entering a turn re-applies them. What IS resumable is a
pipeline — and an agent run belongs inside one of its steps.

**`toolHelper.safeInvokeTool(tools, call, fatal?)` takes a fatal predicate.** Containment is right for a bad
argument and wrong for an exhausted budget: a tool may be a whole pipeline behind one call, and
handing the model a readable "out of tokens" is an invitation to pick another tool and spend again.

**`makeStaticFlowProvider` must throw on an unknown flow.** `makeFlowModel` reads a string as a flow
name first and only re-reads it as a serialized token once the provider throws — returning null
would break every restore.

## Testing

Category A (unit, no env, no network). The model is doubled with a small scripted object in
`tests/_tools/model.ts` because `@langchain/core`'s own `FakeStreamingChatModel` always replays its
first response and so cannot drive a tool loop. That double stands in for the MODEL, an external
boundary — never for an `@owlmeans/*` package. The cumulative-results specs keep the project as a
`Map` of files in `deps` — the durable input extractors read — so a "new process" is a new plugin
over the same files.

## Related

- [[agent-common]] — the serializable records and the run lifecycle flow
- [[llm]] — `Execution`, the model contract and the `advise`-only `ExecutionPlugin`
- [[agent-checkpoint]] — the durable Mongo implementation of both storage ports (internal)
- [[llm-prompt-caching]] — which block contributed context lands in, and why
- [[agent-skills]] — `projectSkillsAgentPlugin` and the `read_skill` tool
