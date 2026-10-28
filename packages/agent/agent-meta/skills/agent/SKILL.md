---
name: agent
description: How to use @owlmeans/agent — context-aware LLM agents over the LangGraph functional API, and resumable PIPELINES over a checkpointed StateGraph, with the AgentPlugin and PipelinePlugin seams, CUMULATIVE PIPELINE RESULTS (cumulativeResultsPlugin), conversation-summarization and memory plugins, and storage-independent ports. Auto-invoked when importing makeAgentModel, makePipeline, makeCheckpointSaver, appendAgentsService, an agent or pipeline plugin, cumulativeResultsPlugin, toolHelper, or an agent store.
user-invocable: false
---
<!-- AUTO-GENERATED — do not edit. Regenerate via sync-agent-meta. -->

# @owlmeans/agent

**Layer:** Cross-cutting domain
**Install:** `"@owlmeans/agent": "^0.1.18"` in `dependencies`, plus the `@langchain/core` and
`@langchain/langgraph` **peers**

The agent runtime. Contracts live in `@owlmeans/agent-common`.

## Key exports

| Export | Description |
|---|---|
| `makeAgentModel(options)` | An agent over the LangGraph functional API: `invoke(input, { action, context, stop, inbox })`, `use`, `conversation`. |
| `AgentInbox` · `AGENT_INBOX_PREFIX` | The person's messages for a running loop (`drain`, `drainOrClose`) and the prefix of the turn that carries them. |
| `AGENT_STOP_INSTRUCTION` · `AGENT_STOPPED_TOOL_RESULT` · `AGENT_STOP_SUMMARY_TIMEOUT_MS` · `AGENT_STOPPED_NOTE` | A stopped loop's summary turn, the answer to a tool call it did not run, the summary's deadline, the `autoFinish` note. |
| `makePipeline(spec, options)` | A resumable state machine over a checkpointed LangGraph `StateGraph`: `invoke`, `resume`, `snapshot`, `asStep`. `options.plugins` seats `PipelinePlugin`s; `stop` on `invoke`/`resume` is the cooperative stop (`PipelineResult.stopped`, `PipelineStopReason`). |
| `cumulativeResultsPlugin(options)` · `CUMULATIVE_RESULTS_PLUGIN` · `DEFAULT_RESULT_SUMMARY_SCHEMA` | CUMULATIVE PIPELINE RESULTS — tells every step what its predecessors produced; see the `cumulative-results` part. |
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

**Contributed context goes to `PromptBlock.Context` and nowhere else.** `AgentOptions.context`,
`invoke`'s `args.context` and every plugin's `context()` land there — in the project message, the
user turn right after the system — below the system's cached `Role` + `Skills` and `Packages`
prefix that every run of a persona shares. The project message is stable for one run and is cached
for its rounds; volatile material anywhere above it would cost every run sharing the persona a
cache write.

**The loop's prompt is composed once and marked per round.** The run sends
`[system, project message, opening, …rounds]`: the system as real text in a `SystemMessage` (never a
`JSON.stringify`d block array), and the composed Tail on a COPY of the opening, so the transcript
keeps the caller's message. Each round hands the wire to the provider plugin's
`loopCache(wire, agentModel, hints)` — it strips and re-marks copies, the opening at its boundaries
and the growing conversation read back round after round — and streams with the call options it
returns. The plugin is `AgentOptions.provider ?? llmPluginRegistry.resolveFor(agentModel)`, resolved
on the unbound model. `cacheSystem: false` on the persona sends no markers. Detail:
[[llm-prompt-caching]].

**`spectate` gets the turn and the answering model.** `AgentSpectateHook(input, message, action,
retries, startedAt?, model?)` is called once per round with the turn number as `retries` and the
agent model's id as `model`, after `cacheHelper.withCacheTiers` has carried a 1-hour cache write
into the usage.

**A run that exceeds `maxTurns` throws `AgentLoopExhaustedError`.** The ceiling counts tool rounds
(`DEFAULT_MAX_TURNS` is 64, `AgentOptions.maxTurns` overrides it), and it is reached only when the
model keeps calling tools without ever answering — so catch that error by name rather than treating
every failed run alike: it says the loop ran out of room, not that a tool or the model failed.

**`stop` ends the loop at a boundary and never aborts a model call.** `invoke(input, { stop })` is read
when an answer arrives and again after the tool results come back; it is never handed to
`agent.stream` or to the model's `stream`, because an abort inside the `call-llm` task fails the whole
run, an aborted call is never billed, and a client watching the stream is left showing an open run.
Once it is aborted, every tool call of the arriving answer is answered with an error `ToolMessage`
(`AGENT_STOPPED_TOOL_RESULT`) instead of running, and tools already running finish. Then ONE summary
call ends the loop: the `AGENT_STOP_INSTRUCTION` human turn appended, the tools still bound — a
transcript carrying tool blocks needs them declared — with `tool_choice: 'none'` (sent only when
tools are declared: both providers refuse it without them), its own `AGENT_STOP_SUMMARY_TIMEOUT_MS`
and no stop, streamed and spectated like any round. A failed summary leaves an empty message and
never fails the run; a tool call in it is dropped, never run. The result carries `stopped: true`
(and `autoFinish` finalizes with `AGENT_STOPPED_NOTE`); a stop that meets an answer without tool
calls ends there, with no summary. A tool that runs a pipeline passes the same signal as the
pipeline's `stop`, so it ends at its next step boundary rather than being abandoned.

**`tool_choice: 'none'` does not reach every provider.** `@langchain/anthropic` 1.5 maps it to
`{ type: 'none' }`, Chat Completions in `@langchain/openai` 1.6 sends `'none'`, and the delegated
model passes `'none'` on. The Responses API path of `@langchain/openai` 1.6.2 keeps only an OBJECT
`tool_choice` and drops every string, so on `gpt-5*` / `gpt-6*` / `codex-*` (`useResponsesApi`) the
instruction is the only guard — which is why a summary's tool calls are dropped rather than run.

**`inbox` carries the person's messages into a running loop.** `drain()` runs before every model call
after the first — not before the summary, since a stop supersedes whatever waits — and what it
returns becomes ONE `HumanMessage` (`AGENT_INBOX_PREFIX`, then the messages) placed after the tool
results: Anthropic's `mergeMessages` merges only consecutive tool results and its API combines
consecutive user turns, so tool results first, then the person's text, is the order both providers
accept. Where the loop would end on an answer without tool calls it calls `drainOrClose()`, ONE
atomic call: messages waiting are appended and the loop goes on, none waiting closes the inbox. A
failing inbox call is logged and treated as empty. The human turns are in the transcript `onTurn`
sees, and neither they nor the summary count toward `maxTurns`.

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

**`toolHelper.safeInvokeTool(tools, call, fatal?)` takes a fatal predicate.** Containment is right for a bad
argument and wrong for an exhausted budget: a tool may be a whole pipeline behind one call, and
handing the model a readable "out of tokens" is an invitation to pick another tool and spend again.

**`makeStaticFlowProvider` must throw on an unknown flow.** `makeFlowModel` reads a string as a flow
name first and only re-reads it as a serialized token once the provider throws — returning null
would break every restore.

## Related

- [[agent-common]] — the serializable records and the run lifecycle flow
- [[llm]] — `Execution`, the model contract and the `advise`-only `ExecutionPlugin`
- [[agent-checkpoint]] — the durable Mongo implementation of both storage ports (internal)
- [[llm-prompt-caching]] — which block contributed context lands in, and why
- [[agent-skills]] — `owlmeansPackagesPlugin`, the prompt plugin that loads package skills on agent runs too

## Parts

| Part | Load it when |
|---|---|
| [pipelines](parts/pipelines.md) | declaring or running a pipeline, writing a pipeline plugin, or resuming a run |
| [cumulative-results](parts/cumulative-results.md) | telling a pipeline's later steps what earlier steps produced, or writing an extractor |
| [testing](parts/testing.md) | writing tests that drive an agent loop or a pipeline |
