---
name: agent-common
description: "How to use @owlmeans/agent-common — runtime-free contracts for OwlMeans agents: conversation identity, the run-lifecycle flow, the PIPELINE declaration (PipelineSpec, PipelineRun, validatePipelineSpec, orderPipelineSteps) and the record shapes an application persists. Auto-invoked when importing agent record types, a pipeline spec or run type, conversationFor, truncateAt, or the agent run flow."
user-invocable: false
---
<!-- AUTO-GENERATED — do not edit. Regenerate via sync-agent-meta. -->

# @owlmeans/agent-common

**Layer:** Cross-cutting domain
**Install:** `"@owlmeans/agent-common": "^0.1.18-rc.24"` in `dependencies`

Serializable contracts for the agent family. No LangChain, no LangGraph, no storage driver — a
backend or a browser bundle imports these to read what an agent wrote without pulling the runtime.
The runtime is `@owlmeans/agent`.

## Key exports

| Export | Description |
|---|---|
| `ConversationRef` | `{ conversationId, scope }` — the thread a run belongs to, and the wider subject it is about. Two fields, because memory is filed per subject while threads may be finer-grained. |
| `conversationFor(purpose, override?)` · `SCOPE_SEP` | Derives a `ConversationRef` from an `LlmPurpose` dedication (`<kind>:<id>`, split on `SCOPE_SEP`); either half is overridable. |
| `truncateAt(text, max)` | Boundary-aware truncation. Every character cap in the family lands here. |
| `agentRunFlow`, `AgentRunStep`, `AgentRunTransition`, `AGENT_RUN_FLOW` | The `@owlmeans/flow` lifecycle a run is driven through. |
| `agentFlows` | Every flow this package declares, for a provider to serve. |
| `ConversationEvent`, `ConversationEventInput` | One finished run, compacted: `summary` + `advice`. |
| `MemoryNode`, `MemoryEvent` (+ `MemoryEventInput`) | Agent-authored memory records. |
| `AgentRunMessage` | What a transport carries — a POINTER (`runId`, `conversationId`, optional `pipeline`/`step`), never state. |
| `PipelineStepSpec`, `PipelineSpec` | The declaration: named steps, `after: string[]` edges, `optional`, `nonIdempotent`, `attempts`, `timeout`. |
| `PipelineRun`, `PipelineRunStatus`, `PipelineProgress` | The persisted run row — `state` is JSON **text** plus `stateChars`; `completed`/`pending`/`warnings`; `heartbeatAt`. |
| `validatePipelineSpec`, `orderPipelineSteps`, `pipelineDescendants`, `pipelineStep` | Pure spec helpers — no runtime, no graph engine. |
| `AGENTS_SERVICE` | The service alias — **`agents`**, plural. |
| `AGENT_*_STORE` | Port names a consumer binds its storage under. |
| `AgentRunStatus` | `ok` / `failed`, written on a conversation event. |
| `AgentCommonError`, `AgentRunStateError`, `PipelineSpecError`, `PipelineVersionError`, `PipelineUnknownStepError`, `PipelineNotIdempotentError`, `PipelineStateTooLargeError` | The error family. |
| `DEFAULT_SUMMARY_CHARS` (1200) · `DEFAULT_ADVICE_CHARS` (400) · `DEFAULT_EVENT_WINDOW` (3) · `DEFAULT_MEMORY_NODE_CHARS` (2000) · `DEFAULT_MEMORY_EVENTS_LIMIT` (50) | The caps the runtime's plugins default to. Override them per plugin; read them here rather than restating a number. |
| `DEFAULT_MAX_STATE_CHARS` (256_000) · `DEFAULT_STEP_ATTEMPTS` (1) · `DEFAULT_STEP_TIMEOUT` (30 min) | Pipeline defaults. The state cap is a TRIPWIRE, not a budget. |

## Rules

**Timestamps are ISO strings, never `Date`.** These contracts cross process boundaries and storage
backends and must survive `JSON.stringify` unchanged. A store whose backend prefers dates converts
at its own adapter boundary — that is the adapter's job, not the contract's.

**The service alias is `agents`, and the accessor is `ctx.agents()`.** Plural and deliberately not
`agent`: a consuming application very often already has a service of its own called that, and a
context accessor collision is silent — the second registration simply wins.

**Flow steps are lifecycle stages, not conversational turns, and nothing RESUMES one.** `FlowPayload`
holds flat scalars only and a ReAct loop's turn count is unbounded, so the loop lives inside the
`Working` step and only its counter travels in the payload. What the steps buy is the ability to say
how far a run got when it ended, which is what a plugin reads on `onFinish`. Resumable work is a
PIPELINE — named steps, a state of scalars, side effects guarded per step. A ReAct run is not one:
its state is an unbounded message list whose tool results are already applied to the world.

**A `PipelineSpec` is a DECLARATION and this package holds no engine.** The steps' bodies, the graph,
the checkpointer and the stores all live in `@owlmeans/agent`; what is here is what a browser bundle,
a reconciler or an operator console must read to say where a run stands without importing LangGraph.
That is also why `PipelineRun.state` is JSON **text** with a `stateChars` beside it rather than a
subdocument: a run row crosses a `$jsonSchema`, and a state whose keys are dotted paths does not.

**`validatePipelineSpec` names EVERY fault at once** — unknown `after` targets, cycles, duplicate
step names, `attempts > 1` on a `nonIdempotent` step. A spec is authored once and fixed once, and
reporting faults one per build turns a five-minute edit into five builds.

**A resume across a `version` change is REFUSED, never adapted.** `completed` names steps by string,
so a spec that has since renamed, removed or reordered one would let a resumed run skip work it never
did — silently, because an unknown name in `completed` matches nothing.

**Each working step keeps exactly one non-explicit outgoing transition.** That is what lets
`FlowModel.next()` give a driver an unambiguous answer without knowing the vocabulary. `Fail` is
marked `explicit` precisely so it can never become that automatic answer. Adding a second automatic
edge to any step breaks `next()` for that step.

**Every cap is enforced by truncation after the model answers, never by asking for it.** A cap in a
prompt is a request; a cap in code is a cap. That is why the defaults live here as numbers rather
than as prompt text.

**A conversation id degrades to a named default, never to an empty string.** An empty key would
silently collapse every run of every subject into one thread.

**Port names are exported; ports are not bound here.** An unbound port is not an error — the plugin
that needs it degrades to a no-op. `AGENT_PIPELINE_RUN_STORE` is the one exception in spirit: a
pipeline with no run store still runs, but it is not resumable, because the ROW is what a resume
reads. `AGENT_CHECKPOINT_STORE` may be absent with no loss of correctness at all.

## Testing

Category A (unit, no env, no network). This package's own `tests/flow.spec.ts` covers the flow
round-trip — which is also the standing check that `@owlmeans/flow` still works server-side, since
every other consumer of that package is client-side.

## Related

- [[agent]] — the runtime that writes these records
- [[llm-common]] — `LlmPurpose` and `ExecutionState`, which a run's execution is built from
- [[flow]] — the flow model the run lifecycle is declared against
