---
name: llm
description: How to use @owlmeans/llm — the LLM inference runtime (four-method model, provider plugins, model factory service, policy-driven execution abstraction). Auto-invoked when importing the model, an LlmPlugin, the LlmService, or the execution service.
user-invocable: false
---
<!-- AUTO-GENERATED — do not edit. Regenerate via sync-agent-meta. -->

# @owlmeans/llm

**Layer:** Core
**Install:** `"@owlmeans/llm": "^0.1.15"` in `dependencies` (plus the `@langchain/*` peers)

The inference runtime. Everything provider-specific is a **plugin**; the model itself only
owns the provider-independent parts (streaming discipline, retries, validation,
observability). Serializable contracts live in `@owlmeans/llm-common`.

## Key Exports

| Export | Description |
|--------|-------------|
| `makeLlmModel(options, spectator)` | The four-method model: `ask` / `talk` / `invoke` / `request`. |
| `makeLlmService(options, alias?)` · `appendLlmService(ctx, options, alias?)` | Model factory/registry — resolves a `ModelConfig` by alias, memoized per alias+override. |
| `llmServiceApi(options, self)` | The factory half WITHOUT `createService`, to compose into your own service (role accessors, domain helpers). |
| `makeExecutionService(alias?, options?)` · `appendExecutionService(ctx, alias?, options?)` | Frozen 3-level executions + policy resolution + snapshot/restore/checkpoint. |
| `executionServiceApi(options, self)` | The execution half without `createService`, for the same composition pattern. |
| `plugins`, `registerLlmPlugin`, `resolvePlugin`, `pluginOf`, `pluginFor` | The provider-plugin registry. Also at `@owlmeans/llm/plugins`. |
| `anthropicPlugin`, `openAiPlugin`, `compatiblePlugin`, `openAiFamily` | Built-in providers; `openAiFamily` is the shared OpenAI-client behaviour to spread into a new plugin. |
| `withRetry`, `registerFatalError`, `spectate`, `normalizeInput`, `parseJsonContent`, `coerceToSchema` | Helpers usable alongside a model. Also at `@owlmeans/llm/helpers`. |
| `LlmError`, `LlmModelError`, `LlmMissconfiguredError`, `LlmPluginError`, `LlmRetryExceededError` | `ResilientError` family. `LlmModelError` is the RETRYABLE one. |
| `DEFAULT_MODEL_RETRIES`, `MODEL_STREAM_TIMEOUT_MS`, `FALLBACK_AFTER_ATTEMPTS`, `DEFAULT_EFFORT`, `EFFORT_TABLE`, `LLM_SERVICE`, `EXECUTION_SERVICE` | Tuning + aliases. |

## helpers/ vs utils/ — the rule this package follows

- `src/helpers/` — functions a **consumer** may use alongside a model. Exported.
- `src/utils/` — used only inside the library. **Never exported**; a spec that needs one
  imports it from `../src/utils/…`.

Adding a function? Decide which side it belongs to first, then place it. Do not export a
`utils/` symbol "because a test needs it".

## Provider differences are plugins, never `if`s

`LlmPlugin` is the single seam. If you find yourself writing `instanceof ChatAnthropic` or
`config.provider === …` in `model.ts` or `service.ts`, it belongs on the plugin instead:

| Plugin member | Replaces |
|---|---|
| `build` | the provider switch in the model factory |
| `owns` / `family` | `instanceof` checks; `family` gates cross-provider fallback |
| `refine` | the per-provider retry rebuild (budget doubling, reasoning shrink) |
| `structuredMode` | native `response_format` vs the forced-tool-call hack |
| `toolChoice` / `responseFormat` | the provider-specific call shapes |
| `patchCache` | prompt-cache markers |
| `isFatal` | "this error can never be retried" |

**Registration order is load-bearing.** Instance-based lookup (`pluginFor`) returns the
FIRST plugin whose `owns` matches. `compatible` is registered before `openai` because both
build a `ChatOpenAI`, and assuming the tool-calling hack for an unlabelled model is safe
everywhere while assuming native JSON-schema support is not.

## Execution: policy in, model out

```
ProjectExecution   ← root: policy + purpose + models resolver
  └─ TaskExecution    ← + resumable state (phase/cursor/completed/data)
       └─ HelperExecution ← + a RESOLVED model + temperatureFactory, bound to a role
```

Every method returns a NEW `Object.freeze`d object. Resolution precedence in
`model(exec, role, override)`: **roleOverride → modelOverride → effort tier →
`LlmService.getModel`**. `escalate(exec, { effort })` raises the tier once and cascades to
everything derived from it.

Extending it for a domain: declare your own `Execution`/input types, list your collaborator
fields in `ExecutionServiceOptions.collaboratorKeys` so they stay out of snapshots, and
instantiate the service generic with your own `ExecutionShape` — **do not narrow the
inherited method signatures**, which would be a contravariance error.

`snapshot` excludes `state` itself; without that, every `derive`/`escalate`/`withPurpose`
on a task would nest another copy of the previous state.

## Peer-dependency rule (langchain identity)

`@langchain/core`, `@langchain/openai` and `@langchain/anthropic` are **peer** dependencies:
model instances cross the package boundary, and two installed copies of a class with
protected members are nominally distinct types. In a linked-workspace checkout the consumer
must pin them to a single copy — see the `bun-linked-workspaces` skill.

## Usage

```typescript
import { makeLlmModel, makeLlmService } from '@owlmeans/llm'
import { ModelProvider } from '@owlmeans/llm-common'

const llm = makeLlmService({ models: () => configs })
const model = makeLlmModel(
  { model: llm.getModel('analyst'), purpose: { type: 'analysis' } }, spectator
)
const spec = await model.invoke('Describe the app', SpecSchema, { action: 'spec' })
```

## Resilience already handled — do not reimplement

Idle stream deadline · duplicate-final-chunk dedup · output-budget escalation · reasoning-cap
shrink · same-family fallback model · schema coercion · JSON salvage from prose · `NullCapture`
diagnostics · fatal-error short-circuit. Details: package `README.md`.

## Tests

`bun test ./tests` in the package. Offline specs always run; `tests/model.spec.ts` is gated
on `OPENROUTER_SECRET` / `ANTHROPIC_SECRET` in the repo-root `.env` and self-skips otherwise.

## Depends On

- `@owlmeans/llm-common` · `@owlmeans/context` · `@owlmeans/error` · `@owlmeans/basic-ids` · `ajv`
- peer `@langchain/core`, `@langchain/openai`, `@langchain/anthropic`

## Related

- [[llm-common]] — the serializable contracts
- [[context]] — service registration · [[error]] — the `ResilientError` family
