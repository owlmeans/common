---
name: llm-common
description: How to use @owlmeans/llm-common — runtime-free serializable contracts for LLM inference and execution (ModelProvider, ExecutionEffort/Level, ModelPolicy, PromptPolicy, SkillDefinition, ExecutionState and its cumulative-results view, PromptBlock, spectator records, NullCapture, LlmFileProvider). Auto-invoked when importing those contracts or extending them for a domain.
user-invocable: false
---
<!-- AUTO-GENERATED — do not edit. Regenerate via sync-agent-meta. -->

# @owlmeans/llm-common

**Layer:** Core
**Install:** `"@owlmeans/llm-common": "^0.1.18-rc.38"` in `dependencies`

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
| `ModelEffort` · `MODEL_EFFORT_ORDER` | The PROVIDER's effort value (`none` … `max`) sent as OpenAI `reasoning.effort` / Anthropic `output_config.effort`; `ModelConfigPatch.effort`. Not `ExecutionEffort`, which only sizes budgets. Which levels a model accepts is the `llm` plugins' table. |
| `StructuredMode` | `Native` (provider JSON-schema mode) vs `Tool` (forced tool call). |
| `SpectatorContentType`, `SPECTATOR_GENERAL` | Observability record enums/defaults. |
| `ModelRole` | Open `string` — declare your own enum, its values stay assignable. |
| `ModelConfigPatch` / `ModelConfigOverride` | The JSON-safe config subset; never credentials. Carries the model-capability fields (`contextWindow`, `maxOutput`, `combinedWindow`) alongside the budget ones — see the `llm` skill for what each means. |
| `ModelPolicy` | `{ effort, roleOverrides?, modelOverrides?, utilityRole? }` — inherited by every refinement. |
| `UTILITY_ROLE` | `'utility'` — the conventional cheap tier for side calls (a relevance pick, a classification). `ModelPolicy.utilityRole` points it at another alias; `ExecutionService.utility` resolves it. |
| `ExecutionState` / `TaskExecutionState` | The persistable core (`level`/`purpose`/`policy`, optional `prompt`/`inquiry`/`results`, plus `phase`/`completed`/`cursor`/`data`). |
| `LlmPurpose` | `{ type?, dedication? }` — metadata carried on every model call. |
| `PromptBlock`, `PROMPT_BLOCK_ORDER`, `DEFAULT_SKILL_ORDER` | The ordered sections of a composed system prompt — `Role`, `Skills`, `Packages`, `Results`, `Context`; the order IS the cache key. |
| `CumulativeResults`, `CumulativeResultsSection` | A pipeline step's view of what earlier steps produced: `step`, rendered `sections` (oldest first), `omitted` step names, `chars`, and a `digest` that is never rendered. |
| `renderCumulativeResults(view)` · `CUMULATIVE_RESULTS_PREAMBLE` · `CUMULATIVE_RESULTS_OMITTED_LEAD`/`_TAIL` | The view as prompt text: the fixed rules, the sections, the "not listed for space" line — or `''` for no view. |
| `SkillDefinition` | One named block of reusable prompt knowledge. `body` must be a pure constant. |
| `PromptPolicy` | `{ role?, skills?, cacheSystem?, cacheTtl? }` — carried on `ExecutionState`, merged downward. |
| `CacheTtl`, `CacheUsage` | `'5m' \| '1h'`; normalized prompt-cache accounting. |
| `LlmFileProvider`, `FileProviderRef`, `resolveFileProvider` | The file contract prompt plugins work against — four members, every path relative to the host's project root. `FileProviderRef` accepts the provider or a thunk returning one; `resolveFileProvider` unwraps whichever form arrived, or `undefined`. |
| `NullCapture`, `NullKind` | Full diagnostics of a call that returned nothing usable. |
| `SpectatorArgument`, `SpectatorEntry`, `SpectatorEntryLogged`, `SpectatorEntryMessage` | What an observability sink stores. |

## `LlmFileProvider` — what a host must supply

A consumer's own file helper satisfies it structurally (`interface FileHelper extends
LlmFileProvider`); implementing it from scratch means all four:

| Member | Contract |
|---|---|
| `readFile(path, noThrow?)` | Read a file relative to the root. With `noThrow`, a missing file yields `''`. |
| `getSourceList(pattern?)` | Glob for files relative to the root. Project-skill discovery in `@owlmeans/agent-skills` is built on it, so a provider that stubs it indexes nothing. |
| `writeFile(path, content)` | Write relative to the root, creating parent directories. |
| `deleteFile(path, noThrow?)` | Delete relative to the root. With `noThrow`, a missing file is a no-op. |
| `key?` | Optional. The provider's stable identity (project root, sandbox id) — the only thing a plugin caching per-project reads can key on, since providers are rebuilt per request. A provider without one is treated as uncacheable. |

Resolving the project root is deliberately NOT part of the contract, and an implementation must not
narrow an inherited signature — that is what stops a rich helper from satisfying this one.

## `ExecutionState.results` — the cumulative-results view

What the earlier steps of the pipeline an execution works inside produced, cut by `@owlmeans/agent`'s
`cumulativeResultsPlugin` for ONE step. It is state, not a collaborator — plain rendered text, so a
snapshot and a restore compose the same prompt — and it is inherited down the execution chain like
any state field, but REPLACED (`ExecutionService.withResults`), never merged, when another step is
handed its own view.

`renderCumulativeResults` is pure: the same view renders the same bytes, an absent or empty view
renders NOTHING (never a heading over an empty list, which a model reads as "nothing was produced"),
and the digest never reaches a prompt. `CUMULATIVE_RESULTS_PREAMBLE` is written for the weakest model
a pipeline may run on — use the names verbatim, import only from the listed specifier, never declare
a listed thing again, a missing thing does not exist yet unless the list says it left something out,
and a source file shown in the conversation is NEWER than the list and wins. Change its wording only
deliberately: it opens a block that recurs on every call of a step.

## Extension rules

Open types are open **on purpose** — extend, do not fork:

```typescript
import type {
  ExecutionState as LlmExecutionState, LlmPurpose,
  TaskExecutionState as LlmTaskExecutionState,
} from '@owlmeans/llm-common'

// Your roles: an enum whose values satisfy the open `ModelRole` string.
export enum MyRole { Analyst = 'analyst', Coder = 'coder' }

// Your purpose and state: extend, never redeclare. Aliasing the imports keeps your own
// `ExecutionState` the name the rest of your domain uses.
export interface MyPurpose extends LlmPurpose { agent?: string }
export interface MyExecutionState extends LlmExecutionState {
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

## Testing

Category A. `bun test ./tests` (the package's `test` script, so the root run includes it):
`inquiry.spec.ts` for the answer helpers, `results.spec.ts` for the block order and the rendered view.

## Related

- [[llm]] — the runtime that implements these contracts
- [[llm-prompt-caching]] — why `Results` sits where it does in the block order
- [[agent]] — `cumulativeResultsPlugin`, which cuts the view
