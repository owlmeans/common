---
name: llm
description: How to use @owlmeans/llm — the LLM inference runtime (four-method model, provider plugins, model factory service, policy-driven execution abstraction, and the prompt/skill composition service). Auto-invoked when importing the model, an LlmPlugin, the LlmService, the execution service, or the prompt service.
user-invocable: false
---

# @owlmeans/llm

**Layer:** Core
**Install:** `"@owlmeans/llm": "^0.1.18-rc.6"` in `dependencies` (plus the `@langchain/*` peers)

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
| `makePromptService(options?, alias?)` · `appendPromptService(ctx, options?, alias?)` · `promptServiceApi(options, self)` | Skill registry + the composition plugin chain. Also at `@owlmeans/llm/prompt`. |
| `rolePlugin`, `skillsPlugin`, `contextPlugin`, `BUILT_IN_PROMPT_PLUGINS` | The built-in composition plugins. |
| `renderSkill`, `sortSkills`, `joinChunks`, `compareAlias`, `prefixHash` | Deterministic rendering primitives — reuse them, never re-implement. |
| `readCacheUsage`, `hasCacheActivity` | Normalized prompt-cache accounting from a completion. |
| `executionServiceApi(options, self)` | The execution half without `createService`, for the same composition pattern. |
| `plugins`, `registerLlmPlugin`, `resolvePlugin`, `pluginOf`, `pluginFor` | The provider-plugin registry. Also at `@owlmeans/llm/plugins`. |
| `anthropicPlugin`, `openAiPlugin`, `compatiblePlugin`, `openAiFamily` | Built-in providers; `openAiFamily` is the shared OpenAI-client behaviour to spread into a new plugin. |
| `withRetry`, `registerFatalError`, `spectate`, `normalizeInput`, `parseJsonContent`, `coerceToSchema` | Helpers usable alongside a model. Also at `@owlmeans/llm/helpers`. |
| `LlmError`, `LlmModelError`, `LlmMissconfiguredError`, `LlmPluginError`, `LlmRetryExceededError` | `ResilientError` family. `LlmModelError` is the RETRYABLE one. |
| `mergePrompt`, `mergePolicy`, `resolveRole`, `effortPatch` | Execution merge helpers; `mergePrompt` unions skills and takes the deepest role. |
| `DEFAULT_MODEL_RETRIES`, `MODEL_STREAM_TIMEOUT_MS` (3 min idle), `FALLBACK_AFTER_ATTEMPTS`, `DEFAULT_EFFORT`, `EFFORT_TABLE`, `MAX_CACHE_BREAKPOINTS`, `MAX_SYSTEM_BREAKPOINTS`, `MIN_CACHEABLE_TOKENS`, `LLM_SERVICE`, `EXECUTION_SERVICE`, `PROMPT_SERVICE` | Tuning + aliases. |

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
| `patchSystem` | how the composed system blocks are rendered and where their cache breakpoints go |
| `patchCache` | the message-prefix cache marker |
| `cacheKey` (via `ModelConfig.cacheKey`) | provider cache-routing hints such as OpenAI's `prompt_cache_key` |
| `isFatal` | "this error can never be retried" |

**Registration order is load-bearing.** Instance-based lookup (`pluginFor`) returns the
FIRST plugin whose `owns` matches. `compatible` is registered before `openai` because both
build a `ChatOpenAI`, and assuming the tool-calling hack for an unlabelled model is safe
everywhere while assuming native JSON-schema support is not.

## System prompts: a role and skills, never a hand-built message

`makeLlmModel` takes `prompt` (a `PromptInput`) and a `prompts` resolver. The prompt service
composes them into an ordered, cacheable system message; a caller's own leading
`SystemMessage` is folded into the volatile `Context` block, so an unmigrated call site
still works. **Do not build a persona as a `SystemMessage` in a helper** — declare it as
`PromptPolicy.role` plus registered skills, or the knowledge duplicates and the cache
prefix stops being stable.

Skills accumulate down the execution chain (project → task → helper) and the deepest
declared `role` wins — see `mergePrompt`. Full rules, breakpoint budget and the provider
facts behind them: [[llm-prompt-caching]].

## Execution: policy in, model out

```
ProjectExecution   ← root: policy + purpose + models resolver
  └─ TaskExecution    ← + resumable state (phase/cursor/completed/data)
       └─ HelperExecution ← + a RESOLVED model + temperatureFactory, bound to a role
```

`prompt` (role + skills) travels on `ExecutionState`, so it survives snapshot/restore;
`prompts` and `files` are collaborators and never enter a snapshot.

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

## Classify a provider error by walking `cause`, never by `instanceof` or a surface read

Two independent layers hide the wire shape of a provider failure, and each one alone is
enough to make a fatal error look retryable — which costs all eight attempts with the real
message buried under the repeats.

1. **Nested SDK copies.** `@langchain/anthropic` and `@langchain/openai` bundle their OWN
   copies of the provider SDKs, so an error they throw is an instance of a DIFFERENT class
   than the one this package imports — `e instanceof BadRequestError` silently returns
   `false`.
2. **Langchain's own error wrappers.** A failure is re-wrapped in a typed langchain error
   (`ContextOverflowError` for an input past the context window, and its siblings) that
   carries the original **only under `cause`** and has no `status` of its own — so
   `e.status === 400` misses it too.

Use `isBadRequest` from `plugins/utils.ts`: it walks the `cause` chain looking for
`status === 400`, bounded in depth so a self-referential chain terminates. Both built-in
`isFatal` implementations go through it.

A context overflow is the case that makes this urgent rather than merely untidy: `refine`
escalates the **output** budget on each retry, so an over-limit **input** can never improve —
every attempt re-sends the identical oversized request. Consumers hold their locks for the
whole loop, so a single unfixable call becomes minutes of thrash on the caller's side.

The same trap applies to any cross-copy `instanceof`; it is the runtime face of the
peer-dependency identity rule below.

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

## Hangs are bounded by an IDLE deadline, not a total one

A stalled provider is aborted after `MODEL_STREAM_TIMEOUT_MS` (3 min) of SILENCE and
surfaces as a retryable `LlmModelError`, so the escalator moves on. The timer re-arms on
every token, so a long-but-productive generation is never cut off — which is why the value
can be low. Set it for a whole deployment with `LlmServiceOptions.streamTimeout` where the
application composes its context; a preset that names its own `ModelConfig.streamTimeout`
keeps it.

Note what this does NOT bound: a call that keeps streaming forever, and retries. A fatal
error misclassified as retryable multiplies its own latency by `DEFAULT_MODEL_RETRIES` —
see the `instanceof` trap above.

## Resilience already handled — do not reimplement

Idle stream deadline · duplicate-final-chunk dedup · output-budget escalation · reasoning-cap
shrink · same-family fallback model · schema coercion · JSON salvage from prose · `NullCapture`
diagnostics · fatal-error short-circuit · blank-content sanitization (whitespace-only text
blocks are dropped before every call — a blank block, e.g. an empty file read pasted into a
prompt, is otherwise a fatal Anthropic 400; blank tool results are stubbed to keep their
`tool_use` pairing). Details: package `README.md`.

## Tests

`bun test ./tests` in the package. Offline specs always run; `tests/model.spec.ts` is gated
on `OPENROUTER_SECRET` / `ANTHROPIC_SECRET` in the repo-root `.env` and self-skips otherwise.

## Depends On

- `@owlmeans/llm-common` · `@owlmeans/context` · `@owlmeans/error` · `@owlmeans/basic-ids` · `ajv`
- peer `@langchain/core`, `@langchain/openai`, `@langchain/anthropic`

## Related

- [[llm-common]] — the serializable contracts
- [[llm-prompt-caching]] — prompt composition, block order and the cache invariants
- [[context]] — service registration · [[error]] — the `ResilientError` family
