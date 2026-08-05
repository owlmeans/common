---
name: llm-common
description: How to use @owlmeans/llm-common — runtime-free serializable contracts for LLM inference and execution (ModelProvider, ExecutionEffort/Level, ModelPolicy, ExecutionState, spectator records, NullCapture). Auto-invoked when importing those contracts or extending them for a domain.
user-invocable: false
---

# @owlmeans/llm-common

**Layer:** Core
**Install:** `"@owlmeans/llm-common": "^0.1.11"` in `dependencies`

The contracts half of the LLM stack. **No `@langchain/*` runtime dependency** — importable
from a browser bundle, a queue worker, or any package that must not pull an inference SDK.
The dependency direction is one-way: a domain contracts package extends these;
`@owlmeans/llm` implements against them.

## Key Exports

| Export | Description |
|--------|-------------|
| `ModelProvider` | `OpenAI` · `Anthropic` · `Compatible`. Each value is an `LlmPlugin.type` in `@owlmeans/llm`. |
| `ExecutionLevel` | `Project` → `Task` → `Helper`. Refinement is downward only. |
| `ExecutionEffort` | `Economy` · `Standard` · `High` · `Max` — the single "how hard should this run" axis. |
| `StructuredMode` | `Native` (provider JSON-schema mode) vs `Tool` (forced tool call). |
| `SpectatorContentType`, `SPECTATOR_GENERAL` | Observability record enums/defaults. |
| `ModelRole` | Open `string` — declare your own enum, its values stay assignable. |
| `ModelConfigPatch` / `ModelConfigOverride` | The JSON-safe config subset; never credentials. |
| `ModelPolicy` | `{ effort, roleOverrides?, modelOverrides? }` — inherited by every refinement. |
| `ExecutionState` / `TaskExecutionState` | The persistable core (`level`/`purpose`/`policy`, plus `phase`/`completed`/`cursor`/`data`). |
| `LlmPurpose` | `{ type?, dedication? }` — metadata carried on every model call. |
| `NullCapture`, `NullKind` | Full diagnostics of a call that returned nothing usable. |
| `SpectatorArgument`, `SpectatorEntry`, `SpectatorEntryLogged`, `SpectatorEntryMessage` | What an observability sink stores. |

## Extension rules

Open types are open **on purpose** — extend, do not fork:

```typescript
// Your roles: an enum whose values satisfy the open `ModelRole` string.
export enum MyRole { Analyst = 'analyst', Coder = 'coder' }

// Your purpose and state: extend, never redeclare.
export interface MyPurpose extends LlmPurpose { agent?: string }
export interface MyExecutionState extends ExecutionState {
  purpose: MyPurpose
  projectId?: string
}

// A task state adds domain fields to the RESUMABLE half only — the base fields
// come from your own ExecutionState, so omit them from the llm task state.
export interface MyTaskState
  extends MyExecutionState, Omit<LlmTaskExecutionState, keyof LlmExecutionState> {
  story?: Story
}
```

`SpectatorEntry.kind` is an open `string` for the same reason: declare your own kind enum
and narrow it on your own entry interface.

## What must NOT go here

Anything that cannot survive `JSON.stringify` or that needs an inference SDK: model
instances, credentials, file handles, callbacks, `ModelConfig` (it carries `secret` /
`headers` / `fallback` — that lives in `@owlmeans/llm`).

## Depends On

Nothing at runtime. `@langchain/core` is a **dev** dependency, for the `UsageMetadata` type
on a spectator message only.

## Related

- [[llm]] — the runtime that implements these contracts
