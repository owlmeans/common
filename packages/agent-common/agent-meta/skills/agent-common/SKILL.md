---
name: agent-common
description: How to use @owlmeans/agent-common — runtime-free contracts for OwlMeans agents: conversation identity, the run-lifecycle flow, and the record shapes an application persists (conversation events, run state, memory nodes and events). Auto-invoked when importing agent record types, conversationFor, truncateAt, or the agent run flow.
user-invocable: false
---
<!-- AUTO-GENERATED — do not edit. Regenerate via sync-agent-meta. -->

# @owlmeans/agent-common

**Layer:** Cross-cutting domain
**Install:** `"@owlmeans/agent-common": "^0.1.18-rc.16"` in `dependencies`

Serializable contracts for the agent family. No LangChain, no LangGraph, no storage driver — a
backend or a browser bundle imports these to read what an agent wrote without pulling the runtime.
The runtime is `@owlmeans/agent`.

## Key exports

| Export | Description |
|---|---|
| `conversationFor(purpose, override?)` | Derives a `ConversationRef` from an `LlmPurpose` dedication. |
| `truncateAt(text, max)` | Boundary-aware truncation. Every character cap in the family lands here. |
| `agentRunFlow`, `AgentRunStep`, `AgentRunTransition`, `AGENT_RUN_FLOW` | The `@owlmeans/flow` lifecycle a run is driven through. |
| `agentFlows` | Every flow this package declares, for a provider to serve. |
| `ConversationEvent`, `ConversationEventInput` | One finished run, compacted: `summary` + `advice`. |
| `AgentRunState` | Serialized flow plus the execution snapshot — the data plane of a run. |
| `MemoryNode`, `MemoryEvent` (+ `MemoryEventInput`) | Agent-authored memory records. |
| `AgentRunMessage` | What a transport carries; execution state travels by reference. |
| `AGENTS_SERVICE` | The service alias — **`agents`**, plural. |
| `AGENT_*_STORE` | Port names a consumer binds its storage under. |
| `AgentRunStatus` | `ok` / `failed`, written on a conversation event. |
| `AgentCommonError`, `AgentRunStateError` | The error family. |

## Rules

**Timestamps are ISO strings, never `Date`.** These contracts cross process boundaries and storage
backends and must survive `JSON.stringify` unchanged. A store whose backend prefers dates converts
at its own adapter boundary — that is the adapter's job, not the contract's.

**The service alias is `agents`, and the accessor is `ctx.agents()`.** Plural and deliberately not
`agent`: a consuming application very often already has a service of its own called that, and a
context accessor collision is silent — the second registration simply wins.

**Flow steps are lifecycle stages, not conversational turns.** `FlowPayload` holds flat scalars only
and a ReAct loop's turn count is unbounded, so the loop lives inside the `Working` step and only its
counter travels in the payload. What the steps buy is knowing where an interrupted run resumes:
`Working` from the last checkpoint, or `Finalizing` when the loop finished but the compaction never
committed.

**Each working step keeps exactly one non-explicit outgoing transition.** That is what lets
`FlowModel.next()` give a driver an unambiguous answer without knowing the vocabulary. `Fail` is
marked `explicit` precisely so it can never become that automatic answer. Adding a second automatic
edge to any step breaks `next()` for that step.

**A conversation id degrades to a named default, never to an empty string.** An empty key would
silently collapse every run of every subject into one thread.

**Port names are exported; ports are not bound here.** An unbound port is not an error — the plugin
that needs it degrades to a no-op, the way `ExecutionService.checkpoint` does with no plugin
registered.

## Testing

Category A (unit, no env, no network). This package's own `tests/flow.spec.ts` covers the flow
round-trip — which is also the standing check that `@owlmeans/flow` still works server-side, since
every other consumer of that package is client-side.
