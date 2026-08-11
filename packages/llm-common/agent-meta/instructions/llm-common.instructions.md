---
description: "How to use @owlmeans/llm-common — runtime-free serializable contracts for LLM inference and execution, and how to extend them for a domain."
applyTo: "**/*.ts, **/*.tsx"
---
<!-- AUTO-GENERATED — do not edit. Regenerate via sync-agent-meta. -->

# @owlmeans/llm-common

**Layer:** Core
**Install:** `"@owlmeans/llm-common": "^0.1.16-rc.0"` in `dependencies`

The contracts half of the LLM stack. **No `@langchain/*` runtime dependency** — importable
from a browser bundle or a queue worker. Dependency direction is one-way: a domain contracts
package extends these; `@owlmeans/llm` implements against them.

## Key Exports

| Export | Description |
|--------|-------------|
| `ModelProvider` | `OpenAI` · `Anthropic` · `Compatible` — each is an `LlmPlugin.type`. |
| `ExecutionLevel` / `ExecutionEffort` | `Project`→`Task`→`Helper`; `Economy`/`Standard`/`High`/`Max`. |
| `StructuredMode` | `Native` vs `Tool` structured output. |
| `ModelRole` | Open `string` — declare your own enum. |
| `ModelConfigPatch` / `ModelConfigOverride` / `ModelPolicy` | JSON-safe model selection. |
| `ExecutionState` / `TaskExecutionState` | The persistable execution core + resumable fields. |
| `LlmPurpose` | `{ type?, dedication? }` observability metadata. |
| `NullCapture`, `NullKind` | Diagnostics of a call that returned nothing usable. |
| `SpectatorArgument` / `SpectatorEntry` / `SpectatorEntryLogged` / `SpectatorEntryMessage`, `SpectatorContentType` | Observability records. |

## Rules

- Extend, never fork: `interface MyPurpose extends LlmPurpose`,
  `interface MyExecutionState extends ExecutionState`.
- For a domain task state, take the base fields from your own `ExecutionState` and mix in
  only the resumable half: `Omit<TaskExecutionState, keyof ExecutionState>`.
- `ModelRole` and `SpectatorEntry.kind` are open strings so a consumer's enum stays
  assignable — narrow them on your own interfaces.
- Nothing that fails `JSON.stringify` belongs here: no model instances, credentials, file
  handles or callbacks. `ModelConfig` (with `secret`/`headers`/`fallback`) lives in
  `@owlmeans/llm`.

## Usage

```typescript
import { ExecutionEffort } from '@owlmeans/llm-common'
import type { ModelPolicy } from '@owlmeans/llm-common'

export const DEFAULT_POLICY: ModelPolicy = { effort: ExecutionEffort.Standard }
```

## Depends On

Nothing at runtime (`@langchain/core` is a dev dependency, for one type).
