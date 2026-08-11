---
description: "How to use @owlmeans/llm — the LLM inference runtime: four-method model, provider plugins, model factory service, the policy-driven execution abstraction, and the prompt/skill composition service."
applyTo: "**/*.ts, **/*.tsx"
---
<!-- AUTO-GENERATED — do not edit. Regenerate via sync-agent-meta. -->

# @owlmeans/llm

**Layer:** Core
**Install:** `"@owlmeans/llm": "^0.1.15"` in `dependencies` (plus the `@langchain/*` peers)

The inference runtime. Everything provider-specific is a **plugin**; the model owns only the
provider-independent parts. Serializable contracts live in `@owlmeans/llm-common`.

## Key Exports

| Export | Description |
|--------|-------------|
| `makeLlmModel(options, spectator)` | `ask` / `talk` / `invoke` / `request`. |
| `makeLlmService` · `appendLlmService` · `llmServiceApi` | Model factory/registry; `llmServiceApi` composes into your own service. |
| `makeExecutionService` · `appendExecutionService` · `executionServiceApi` | Frozen 3-level executions, policy resolution, snapshot/restore/checkpoint. |
| `makePromptService` · `appendPromptService` · `promptServiceApi` | Skill registry + composition plugin chain (`@owlmeans/llm/prompt`). |
| `renderSkill`, `sortSkills`, `compareAlias`, `readCacheUsage` | Deterministic rendering and prompt-cache accounting. |
| `plugins`, `registerLlmPlugin`, `resolvePlugin`, `pluginOf`, `pluginFor` | Provider-plugin registry (`@owlmeans/llm/plugins`). |
| `anthropicPlugin`, `openAiPlugin`, `compatiblePlugin`, `openAiFamily` | Built-ins; spread `openAiFamily` into a new OpenAI-compatible plugin. |
| `withRetry`, `registerFatalError`, `spectate`, `normalizeInput`, `parseJsonContent`, `coerceToSchema` | Helpers (`@owlmeans/llm/helpers`). |
| `LlmModelError` (retryable), `LlmMissconfiguredError`, `LlmPluginError`, `LlmRetryExceededError` | `ResilientError` family. |

## Rules

- `src/helpers/` is what consumers may use; `src/utils/` is library-private and never
  exported. Place a new function on the right side rather than exporting a util for a test.
- Never branch on the provider (`instanceof ChatAnthropic`, `provider === …`) in the model or
  the service — put it on the `LlmPlugin` (`build` / `owns` / `family` / `refine` /
  `structuredMode` / `toolChoice` / `responseFormat` / `patchSystem` / `patchCache` / `isFatal`).
- Plugin registration order is load-bearing: `pluginFor` returns the first `owns` match, and
  `compatible` precedes `openai` so an unlabelled `ChatOpenAI` gets the conservative
  tool-calling behaviour.
- Never `instanceof` an error from a provider SDK: `@langchain/*` bundle their own
  nested copies, so the check silently fails and a fatal `400` gets retried eight
  times. Match `status === 400` instead.
- `@langchain/*` are **peer** dependencies — model instances cross the package boundary and
  two installed copies are nominally distinct types. Pin one copy in the consumer.
- Extend the execution generically: your own `ExecutionShape`, your collaborator fields in
  `collaboratorKeys`. Do not narrow inherited method signatures (contravariance error).
- Never hand-build a persona as a `SystemMessage` in a helper. Declare it as
  `PromptPolicy.role` plus registered skills and let the prompt service compose it —
  otherwise the knowledge duplicates and the cacheable prefix stops being stable. Skills
  accumulate project → task → helper; the deepest declared role wins (`mergePrompt`).
  Block order, breakpoint budget and the provider facts: `llm-prompt-caching`.

## Usage

```typescript
import { makeLlmModel, makeLlmService } from '@owlmeans/llm'

const llm = makeLlmService({ models: () => configs })
const model = makeLlmModel(
  { model: llm.getModel('analyst'), purpose: { type: 'analysis' } }, spectator
)
const spec = await model.invoke('Describe the app', SpecSchema, { action: 'spec' })
```

Execution resolution precedence: **roleOverride → modelOverride → effort tier →
`LlmService.getModel`**.

## Already handled — do not reimplement

Idle stream deadline · duplicate-final-chunk dedup · output-budget escalation ·
reasoning-cap shrink · same-family fallback model · schema coercion · JSON salvage from
prose · `NullCapture` diagnostics · fatal-error short-circuit.

## Depends On

- `@owlmeans/llm-common`, `@owlmeans/context`, `@owlmeans/error`, `@owlmeans/basic-ids`, `ajv`
- peer `@langchain/core`, `@langchain/openai`, `@langchain/anthropic`
