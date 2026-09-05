---
name: agent
description: How to use @owlmeans/agent — context-aware LLM agents and pipelines over the LangGraph functional API, with the AgentPlugin seam, conversation-summarization and memory plugins, storage-independent ports, and the ExecutionPlugin checkpoint implementation. Auto-invoked when importing makeAgentModel, appendAgentsService, an agent plugin, safeInvokeTool, or an agent store.
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
| `makeAgentsService(options?, alias?)` · `appendAgentsService(ctx, options?, alias?)` · `agentServiceApi(options, self)` | The service, and its half without `createService` for composition. |
| `summarizePlugin(options?)` | Compacts each finished run into `summary` + `advice`; replays the last few. |
| `memoryGraphPlugin(options?)` · `memoryGraph(store, options?)` | Durable notes filed by subsystem, with links. Plugin **and** plain API. |
| `memoryEventsPlugin(options?)` · `memoryEvents(store, options?)` | A bounded, ordered record of what happened. |
| `safeInvokeTool`, `toErrorResponse`, `isToolError` | The never-throwing tool contract. |
| `composeCompaction`, `composeRollingSummary`, `renderTranscript`, `messageText` | Summary primitives; both composers are total. |
| `makeAgentExecutionPlugin(options)` | The first real implementation of `@owlmeans/llm`'s `ExecutionPlugin`. |
| `makeStaticFlowProvider(flows)` | The server-side `FlowProvider` `@owlmeans/flow` does not ship. |
| `inProcessTransport()`, `AgentTransport` | The scaling seam; default carries messages by direct call. |
| `createMemory*Store()` | In-memory reference implementations of every port. |
| `AgentError` · `AgentMissconfiguredError` · `AgentLoopExhaustedError` | The `ResilientError` family. `AgentMissconfiguredError` is a model or tool set the agent was built without; `AgentLoopExhaustedError` is the tool loop hitting its ceiling. |
| `DEFAULT_MAX_TURNS` (64) · `DEFAULT_PLUGIN_ORDER` · `DEFAULT_ACTION` · `DEFAULT_ENTRYPOINT` | The loop and plugin defaults. |

Subpath exports: `./plugins`, `./helpers`, `./stores`.

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

**Ports, not resources.** `ConversationStore`, `MemoryGraphStore`, `MemoryEventStore` and
`AgentRunStateStore` are narrow interfaces a consumer implements. A port names exactly what the
plugin needs, which is a far smaller surface than CRUD, and anything can satisfy it — a `Resource`,
or a file on disk, which is what the project-history equivalent is. An unbound port is a no-op, not
an error.

**Memory writes merge, they do not replace.** Replacing would make every write a potential act of
forgetting, which is not a decision one caller has the standing to take. A node that outgrows
`maxNodeChars` is compacted through the cheap model, or head-truncated when there is none.

**Only the memory INDEX is injected — names and links, never content.** Bulk-injecting notes spends
the context window on knowledge the run cannot tell apart from what it needs; the agent pulls what it
wants by name.

**Checkpoints are size-guarded.** A project-level execution carries the whole project specification;
writing that on every checkpoint is a storage problem that surfaces much later and much worse than a
skipped write.

**No LangGraph checkpointer, and the `entrypoint` is created inside `invoke()`.** Recoverability
lives in the OwlMeans execution and flow layers, which already own a serializable state model;
adopting a second one would leave two half-truths about where a crashed run stands.

**`makeStaticFlowProvider` must throw on an unknown flow.** `makeFlowModel` reads a string as a flow
name first and only re-reads it as a serialized token once the provider throws — returning null
would break every restore.

## Testing

Category A (unit, no env, no network). The model is doubled with a small scripted object in
`tests/_tools/model.ts` because `@langchain/core`'s own `FakeStreamingChatModel` always replays its
first response and so cannot drive a tool loop. That double stands in for the MODEL, an external
boundary — never for an `@owlmeans/*` package.

## Related

- [[agent-common]] — the serializable records and the run lifecycle flow
- [[llm]] — `Execution`, the model contract and `ExecutionPlugin`
- [[llm-prompt-caching]] — which block contributed context lands in, and why
- [[agent-skills]] — `projectSkillsAgentPlugin` and the `read_skill` tool
