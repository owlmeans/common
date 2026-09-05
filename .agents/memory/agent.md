---
node: agent
scope: "packages/agent/**, packages/agent-common/**"
updated: 2026-09
---

## Facts

- `@owlmeans/agent` has TWO runtimes over LangGraph, for two different units of work.
  `makeAgentModel` is the ReAct loop on the **functional** API (`task` / `entrypoint` /
  `addMessages`), entrypoint built inside `invoke()` — nothing survives a call, on purpose: a ReAct
  run is not resumable, its tool results are side effects already applied to the world.
  `makePipeline` is a resumable state machine on **`StateGraph`** + `Annotation.Root` with an
  optional `BaseCheckpointSaver` — only a graph has named nodes, and a resume must be able to say
  which step it starts at (`entrypoint`/`task` identity is a positional call ordinal that renumbers
  on any edit).
- `@owlmeans/agent-common` is runtime-free (no langchain) so a backend or browser bundle can read
  the records an agent wrote. All its timestamps are ISO strings, never `Date`.
- It supplies the server-side `FlowProvider` that `@owlmeans/flow` never had — every other flow
  consumer in this monorepo is client-side.
- Neither package depends on a storage driver. The durable Mongo implementation of
  `PipelineRunStore` + `CheckpointStore`, and the single `AgentPlugin` that installs them, is
  `@owlmeans/agent-checkpoint` in the `internal` monorepo.
- Service alias is `agents` (plural). Consumers very often already have a service called `agent`,
  and a context accessor collision is silent.

## Invariants

- Plugin-contributed context reaches `PromptBlock.Context` only. `patchSystem` deliberately refuses
  to cache-mark a trailing Context block, so it is free; anywhere above it invalidates the prefix.
- `safeInvokeTool` never throws. Broke when violated: a rejected LangGraph task aborts the whole
  superstep and every sibling tool call in the batch dies with it.
- Tools resolve by `tool.name` first, map key second — `bindTools` advertises the name.
- Plugin failures (context, tools, per-turn, finish) are swallowed with a warning. Memory is an
  enhancement; losing it costs context, throwing costs the work.
- A failed run is finalized regardless of `autoFinish`: a caller that never received a handle
  cannot finalize it, and an unrecorded run is one the next session repeats verbatim.
- The pipeline **run row is authoritative** for where a run stands; the checkpoint is a replay
  optimisation that may legitimately be absent (TTL'd, size-refusable). A resume with no
  checkpointer bound is still correct.
- Every step is guarded TWICE: the runner refuses a step its row calls complete, and the
  application's `skipWhen` reads a durable marker the step wrote. The second covers a crash
  BETWEEN the side effect and the row write.
- A step failure is an OUTCOME (`{ status: Failed, failedAt, error }`), not a throw — every caller
  has a status or a warning to write first. `options.fatal` is the exception: row written Failed,
  then rethrown.
- The node body order is `skipWhen → run → merge → AWAITED row save → report`. The row write
  happens before the node returns, or a crash loses a completed step.
- Steps close over their dependencies; the graph is compiled per run. Collaborators never travel
  through the engine's config — that would bind a run to which config keys a LangGraph minor
  propagates into a node body.

## Gotchas

- Storage is exposed as narrow PORTS, not `Resource<T>` — a port names exactly what a plugin needs,
  a far smaller surface than CRUD, and any backend satisfies it: a resource, or a file on disk.
- Pipeline state is scalars and KEYS. Over `maxStateChars` the step FAILS rather than truncating:
  a resume replaying a cut-down state replays a state that never existed.
- `attempts` defaults to 1 — retry budgets in this family multiply — and `attempts > 1` on a
  `nonIdempotent` step is refused at build time.
- The checkpoint saver imports its CLASS from `@langchain/langgraph`'s root (one identity, one
  copy) and its protocol VALUES (`WRITES_IDX_MAP`, serde types) from
  `@langchain/langgraph-checkpoint`. Never `JSON.stringify` a checkpoint — use the serde, or
  `AIMessage`s do not round-trip.
- A pipeline persisted behind a pruning checkpoint store must declare no `DeltaChannel`: its value
  is reconstructed by walking ancestors, which pruning removes. The runner declares none.
- An unbound port is a no-op, never an error.
- `FakeStreamingChatModel` always replays its first response, so it cannot drive a tool loop; the
  specs script their own model double (`tests/_tools/model.ts`).
- `makeStaticFlowProvider` must THROW on an unknown flow: `makeFlowModel` reads a string as a flow
  name first and only re-reads it as a serialized token once the provider throws.

## Pointers

- Skills: `agent`, `agent-common`. Layer: `tree.md` §3 (cross-cutting domain).
- Consumer: viable's free-flight agent — see the `viable-agent` repo's `agent-memory-history` skill.
