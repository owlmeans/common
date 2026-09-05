---
node: agent
scope: "packages/agent/**, packages/agent-common/**"
updated: 2026-09
---

## Facts

- `@owlmeans/agent` wraps LangGraph's **functional** API (`task` / `entrypoint` / `addMessages`),
  not `StateGraph`, and creates the entrypoint inside `invoke()` — nothing survives a call.
  Recoverability belongs to the execution/flow layers, which already own a serializable state model.
- `@owlmeans/agent-common` is runtime-free (no langchain) so a backend or browser bundle can read
  the records an agent wrote. All its timestamps are ISO strings, never `Date`.
- It supplies the server-side `FlowProvider` that `@owlmeans/flow` never had — every other flow
  consumer in this monorepo is client-side — and the first real implementation of
  `@owlmeans/llm`'s `ExecutionPlugin` seam.
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

## Gotchas

- Storage is exposed as narrow PORTS, not `Resource<T>` — a port names exactly what a plugin needs,
  a far smaller surface than CRUD, and any backend satisfies it: a resource, or a file on disk.
- An unbound port is a no-op, never an error.
- `FakeStreamingChatModel` always replays its first response, so it cannot drive a tool loop; the
  specs script their own model double (`tests/_tools/model.ts`).
- `makeStaticFlowProvider` must THROW on an unknown flow: `makeFlowModel` reads a string as a flow
  name first and only re-reads it as a serialized token once the provider throws.

## Pointers

- Skills: `agent`, `agent-common`. Layer: `tree.md` §3 (cross-cutting domain).
- Consumer: viable's free-flight agent — see the `viable-agent` repo's `agent-memory-history` skill.
