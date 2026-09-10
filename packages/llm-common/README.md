# @owlmeans/llm-common

Serializable contracts for LLM inference and execution. Runtime-free — it holds the enums,
policy shapes and record formats that both an inference runtime (`@owlmeans/llm`) and a
persistence/queue consumer need to name the same things.

## Overview

- Provider identifiers, effort tiers, execution levels and structured-output modes
- The inheritable `ModelPolicy` and its JSON-safe `ModelConfigPatch` / `ModelConfigOverride`
- `ExecutionState` / `TaskExecutionState` — what an execution looks like once its
  collaborators (models, file access, live handles) are stripped off
- Spectator record contracts and the `NullCapture` diagnostic
- No `@langchain/*` runtime dependency: safe to import from a browser bundle, a queue
  worker, or a package that must not pull an inference SDK

Split rationale: the dependency direction is one-way. A consumer's own contracts package
extends these; `@owlmeans/llm` implements against them.

## Installation

```bash
bun add @owlmeans/llm-common@^0.1.18-rc.11
```

## Usage

Naming a role and a policy without depending on any inference runtime:

```typescript
import { ExecutionEffort, ModelProvider } from '@owlmeans/llm-common'
import type { ModelPolicy } from '@owlmeans/llm-common'

export enum MyRole {
  Analyst = 'analyst',
  Coder = 'coder',
}

export const DEFAULT_POLICY: ModelPolicy = {
  effort: ExecutionEffort.Standard,
  modelOverrides: { [MyRole.Coder]: { maxTokens: 16000 } },
}
```

Extending the serializable state with domain context:

```typescript
import type { ExecutionState, LlmPurpose } from '@owlmeans/llm-common'

export interface MyPurpose extends LlmPurpose {
  agent?: string
}

export interface MyExecutionState extends ExecutionState {
  purpose: MyPurpose
  projectId?: string
}
```

## API

### Constants

| Export | Description |
|--------|-------------|
| `ModelProvider` | `OpenAI` · `Anthropic` · `Compatible` — each maps to an `LlmPlugin` type in `@owlmeans/llm`. |
| `ExecutionLevel` | `Project` → `Task` → `Helper`; an execution is refined downward only. |
| `ExecutionEffort` | `Economy` · `Standard` · `High` · `Max` — the one "how hard should this run" axis. |
| `StructuredMode` | `Native` (provider JSON-schema mode) vs `Tool` (forced tool call). |
| `SpectatorContentType` | `Text` · `Json` · `ToolCall`. |
| `SPECTATOR_GENERAL` | Default entry kind for consumers that do not classify calls. |

### Types

| Export | Description |
|--------|-------------|
| `ModelRole` | Open `string`. Declare your own enum; its values stay assignable. |
| `ModelConfigPatch` | JSON-safe subset of a runtime model config — never credentials. |
| `ModelConfigOverride` | `string` (a config alias) or a `ModelConfigPatch`. |
| `ModelPolicy` | `{ effort, roleOverrides?, modelOverrides? }` — inherited by every refinement. |
| `ExecutionState` | `{ level, purpose, policy }` — the persistable core. |
| `TaskExecutionState` | Adds `phase` / `completed` / `cursor` / `data` for checkpoint & resume. |
| `LlmPurpose` | `{ type?, dedication? }` — observability metadata carried on every call. |
| `NullCapture`, `NullKind` | Full diagnostics of a call that returned nothing usable. |
| `SpectatorArgument`, `SpectatorEntry`, `SpectatorEntryLogged`, `SpectatorEntryMessage` | The record format an observability sink stores. |

## Related

- `@owlmeans/llm` — the runtime: model, provider plugins, model factory, execution service

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
