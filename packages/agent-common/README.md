# @owlmeans/agent-common

Serializable contracts for OwlMeans agents and LLM pipelines: conversation identity, the run
lifecycle flow, and the record shapes an application persists.

Runtime-free by design — no LangChain, no LangGraph, no storage driver. A backend or a browser
bundle can import these shapes to read what an agent wrote without pulling the runtime. The
runtime is [`@owlmeans/agent`](../agent).

## What is here

| Export | Purpose |
|---|---|
| `conversationFor(purpose, override?)` | Derives a `ConversationRef` from an `LlmPurpose` dedication — the thread identity an agent run belongs to |
| `truncateAt(text, max)` | Boundary-aware truncation; every character cap in the family lands here |
| `agentRunFlow` / `AgentRunStep` / `AgentRunTransition` | The `@owlmeans/flow` lifecycle a run is driven through |
| `ConversationEvent` | One finished run, compacted: `summary` (what happened) + `advice` (what to do next) |
| `AgentRunState` | The data plane of a run — serialized flow plus the execution snapshot |
| `MemoryNode` / `MemoryEvent` | Agent-authored memory: a subsystem graph node, and an entry in a bounded sequence |
| `AgentRunMessage` | What a transport carries; execution state travels by reference |

## Conventions worth knowing

**Timestamps are ISO strings, never `Date`.** These contracts cross process boundaries and storage
backends and must survive `JSON.stringify` unchanged. A store whose backend prefers dates converts
at its own adapter boundary.

**Flow steps are lifecycle stages, not conversational turns.** `FlowPayload` holds flat scalars
only and a ReAct loop's turn count is unbounded, so the loop lives inside the `Working` step and
only its counter travels in the payload. What the steps buy is the ability to say where an
interrupted run resumes.

**Each working step has exactly one non-explicit outgoing transition**, so `FlowModel.next()` always
has an unambiguous answer and a driver can advance a run without knowing the vocabulary. `Fail` is
marked explicit precisely so it never becomes that automatic answer.

**Port names are exported, ports are not bound here.** `AGENT_CONVERSATION_STORE` and friends are
the keys a consumer registers its own storage under. An unbound port is not an error — the plugin
that needs it degrades to a no-op.

<!-- owlmeans:agent-guidance:start -->
## Agent guidance

This package ships embedded agent skills under `agent-meta/`. After installing your
`@owlmeans/*` packages, run the OwlMeans agent-skills installer to place them into
your project's skill store (`.agents/skills/`):

```sh
npx @owlmeans/agent-skills@^0.1.18-rc.12
```

The embedded files are version-matched to this package release. Do not edit them
directly — they are regenerated on each publish. To contribute guidance edits,
open a PR against the source monorepo.
<!-- owlmeans:agent-guidance:end -->
