---
name: agent
description: How to use @owlmeans/agent — context-aware LLM agents over the LangGraph functional API, and resumable PIPELINES over a checkpointed StateGraph, with the AgentPlugin seam, conversation-summarization and memory plugins, and storage-independent ports. Auto-invoked when importing makeAgentModel, makePipeline, makeCheckpointSaver, appendAgentsService, an agent plugin, safeInvokeTool, or an agent store.
user-invocable: false
---

# @owlmeans/agent

**Layer:** Cross-cutting domain
**Install:** `"@owlmeans/agent": "^0.1.18-rc.15"` in `dependencies`, plus the `@langchain/core` and
`@langchain/langgraph` **peers**

The agent runtime. Contracts live in `@owlmeans/agent-common`.

## Key exports

| Export | Description |
|---|---|
| `makeAgentModel(options)` | An agent over the LangGraph functional API: `invoke`, `use`, `conversation`. |
| `makePipeline(spec, options)` | A resumable state machine over a checkpointed LangGraph `StateGraph`: `invoke`, `resume`, `snapshot`, `asStep`. |
| `makeCheckpointSaver(store)` | A `BaseCheckpointSaver` over the `CheckpointStore` port. |
| `makeAgentsService(options?, alias?)` · `appendAgentsService(ctx, options?, alias?)` · `agentServiceApi(options, self)` | The service, and its half without `createService` for composition. |
| `summarizePlugin(options?)` | Compacts each finished run into `summary` + `advice`; replays the last few. |
| `memoryGraphPlugin(options?)` · `memoryGraph(store, options?)` | Durable notes filed by subsystem, with links. Plugin **and** plain API. |
| `memoryEventsPlugin(options?)` · `memoryEvents(store, options?)` | A bounded, ordered record of what happened. |
| `inquiryPlugin(options?)` · `INQUIRY_PLUGIN` · `ASK_USER_TOOL` | The `ask_user` tool and its one Context paragraph — offered only when a channel is wired. |
| `safeInvokeTool`, `toErrorResponse`, `isToolError` | The never-throwing tool contract. |
| `composeCompaction`, `composeRollingSummary`, `renderTranscript`, `messageText` | Summary primitives; both composers are total. |
| `makeStaticFlowProvider(flows)` | The server-side `FlowProvider` `@owlmeans/flow` does not ship. |
| `inProcessTransport()`, `AgentTransport` | The scaling seam; default carries messages by direct call. |
| `createMemory*Store()` | In-memory reference implementations of every port, including `createMemoryPipelineRunStore` and `createMemoryCheckpointStore`. |
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

## The plugin seam

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

**`safeInvokeTool` must never throw.** The loop wraps it in a LangGraph `task`, and a rejected task
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

**`compose()` is called with `files: exec.files`.** Without it, a prompt plugin that resolves
knowledge from disk is silently inert on agent runs while working fine on plain model calls.

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
a prompt is a request. Both composers (`composeCompaction`, `composeRollingSummary`) are total: with
no model, a failing model or an empty answer they fall back deterministically, so a caller can record
history unconditionally. A failed fold costs detail, never the event.

**Ports, not resources.** `ConversationStore`, `MemoryGraphStore`, `MemoryEventStore`,
`PipelineRunStore` and `CheckpointStore` are narrow interfaces a consumer implements. A port names exactly what the
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

**A step asks with `ctx.ask(inquiry)`, and a run nobody can answer parks `Waiting`.** Three
outcomes in order: an answer already in the state comes straight back (a question is never asked
twice); a live `options.inquiry.ask` answer is RECORDED in the state — `stateAnswerOf(capAnswer(…))`
under `state[INQUIRY_ANSWERS_KEY][id]`, the decision whole and the prose cut — and the FULL answer
returned to the step; otherwise the run stops `Waiting` with the inquiry on its row, and with no run
store it throws `PipelineNotResumableError` instead. A throwing channel is not a park: it fails the
step as an ordinary outcome, because the asking failed rather than the answer being no. `Inquiry.id`
is the only thing an answer is matched by, so DERIVE it from the step and the thing being decided —
an id minted per call never matches the state, and the run re-asks and parks forever.

**Answers are merged by the RUNNER, in `invoke` and in `resume({ answers })`, never by a mapping.**
`invoke` builds `{ ...restored, ...seed }`, so a mapping that forwarded the answers map would
replace the child's own recorded answers wholesale — and write `undefined` over them when the parent
had none, which re-asks question 1 on every resume. When a composed child parks, `asStep` relays its
question to the parent's `ctx.ask` and re-invokes the child with the answer (bounded at 8 questions
per composing step); the parent parks only when its own `ask` parks, and never throws a plain error
in that path.

**An agent that installs `inquiryPlugin` must pass `fatal: e => isFatalError(e) != null`.** The tool
rethrows `InquiryUnavailable` alone — no channel is an answerable situation, a channel that has GONE
is terminal — and `safeInvokeTool` contains everything else by default, so without that predicate
the loop spends its whole turn budget on a dead channel. See [[inquiry]] for the whole primitive.

**`safeInvokeTool(tools, call, fatal?)` takes a fatal predicate.** Containment is right for a bad
argument and wrong for an exhausted budget: a tool may be a whole pipeline behind one call, and
handing the model a readable "out of tokens" is an invitation to pick another tool and spend again.

**`makeStaticFlowProvider` must throw on an unknown flow.** `makeFlowModel` reads a string as a flow
name first and only re-reads it as a serialized token once the provider throws — returning null
would break every restore.

## Testing

Category A (unit, no env, no network). The model is doubled with a small scripted object in
`tests/_tools/model.ts` because `@langchain/core`'s own `FakeStreamingChatModel` always replays its
first response and so cannot drive a tool loop. That double stands in for the MODEL, an external
boundary — never for an `@owlmeans/*` package.

## Related

- [[inquiry]] — the human-in-the-loop primitive `ctx.ask`, `Waiting` and `ask_user` belong to
- [[agent-common]] — the serializable records and the run lifecycle flow
- [[llm]] — `Execution`, the model contract and the `advise`-only `ExecutionPlugin`
- [[agent-checkpoint]] — the durable Mongo implementation of both storage ports (internal)
- [[llm-prompt-caching]] — which block contributed context lands in, and why
- [[agent-skills]] — `projectSkillsAgentPlugin` and the `read_skill` tool
