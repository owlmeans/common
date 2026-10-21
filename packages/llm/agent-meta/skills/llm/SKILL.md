---
name: llm
description: How to use @owlmeans/llm — the LLM inference runtime (four-method model, provider plugins, model factory service, policy-driven execution abstraction, and the prompt/skill composition service). Auto-invoked when importing the model, an LlmPlugin, the LlmService, the execution service, or the prompt service.
user-invocable: false
---
<!-- AUTO-GENERATED — do not edit. Regenerate via sync-agent-meta. -->

# @owlmeans/llm

**Layer:** Core
**Install:** `"@owlmeans/llm": "^0.1.18-rc.52"` in `dependencies` (plus the `@langchain/*` peers)

The inference runtime. Everything provider-specific is a **plugin**; the model itself only owns the
provider-independent parts (streaming discipline, retries, validation, observability). Serializable
contracts live in `@owlmeans/llm-common`. `src/helpers/` is exported — functions a **consumer** may
use alongside a model; `src/utils/` is internal and **never exported** (a spec that needs one imports
it from `../src/utils/…`). Decide the side before placing a function, and never export a `utils/`
symbol "because a test needs it".

## Key Exports

| Export | Description |
|--------|-------------|
| `makeLlmModel({ model, purpose, prompt?, prompts?, files?, utility?, results?, retries?, … }, spectator)` | The four-method model: `ask` / `talk` / `invoke(input, schema, opts)` / `request`. `model` is an already-resolved `BaseChatModel`. |
| `LlmCallOptions { action, stable?, cacheMax?, focus?, skills?, escalation?, fatal? }` · `schemaPlacement?: 'native' \| 'tail'` (`invoke`/`request`) | Per call: `stable` = how many lead messages repeat across calls (one breakpoint closes them; default 0), `cacheMax` = the breakpoint budget (≤ 4), `focus` = a `PromptFocus` over the execution's, `skills` = per-call skills in the uncached Tail, `'tail'` = the schema text in the Tail behind a constant format. There is no `useCache`. |
| `makeLlmService(options, alias?)` · `appendLlmService(ctx, options, alias?)` · `llmServiceApi(options, self)` | Model factory/registry — `makeLlmService({ models: () => configs }).getModel(alias, override?)` resolves a `ModelConfig` by alias, memoized per alias+override. The `…Api` half omits `createService`, to compose into your own service (role accessors, domain helpers). |
| `makeExecutionService(alias?, options?)` · `appendExecutionService(ctx, alias?, options?)` · `executionServiceApi(options, self)` | Frozen 3-level executions + policy resolution + snapshot/restore + advice + the results view (`withResults`), and the same composable half. |
| `makePromptService(options?, alias?)` · `appendPromptService(ctx, options?, alias?)` · `promptServiceApi(options, self)` | Skill registry + the composition plugin chain. Also at `@owlmeans/llm/prompt`. |
| `rolePlugin`, `skillsPlugin`, `resultsPlugin`, `contextPlugin`, `BUILT_IN_PROMPT_PLUGINS` | The built-in composition plugins. |
| `PromptContext.claim(key)` · `PromptComposeParams.utility` | Per-composition ownership of a key; a cheap model for one plugin-side call. |
| `promptRenderHelper.{renderSkill, sortSkills, joinChunks, compareAlias, prefixHash, regionOf}` · `cacheHelper.{readCacheUsage, hasCacheActivity, withCacheTiers}` | Deterministic rendering primitives — reuse them, never re-implement — and normalized prompt-cache accounting from a completion; `withCacheTiers` carries Anthropic's 1-hour write count into `input_token_details.cache_creation_1h`. |
| `llmPluginRegistry.{plugins, register, resolvePlugin, resolveFor, pluginOf, pluginFor}` | The provider-plugin registry. `resolveFor(model)` = the configured provider's plugin, else instance lookup — call it on the unbound model. Also at `@owlmeans/llm/plugins`. |
| `CacheDialect`, `CacheBoundary`, `OPENAI_EXPLICIT_CACHE_PREFIXES` | How a provider is told what to cache, the four boundaries of the layout, and the OpenAI families on explicit cache mode — see [[llm-prompt-caching]]. |
| `anthropicPlugin`, `openAiPlugin`, `compatiblePlugin`, `openAiFamily` | Built-in providers; `openAiFamily` is the shared OpenAI-client behaviour to spread into a new plugin. |
| `NO_SAMPLING_PREFIXES` / `anthropicSupportHelper.rejectsSampling(model)` · `RESPONSES_API_PREFIXES` / `usesResponsesApi(model)` | Which families reject which sampling parameters — see the table in the `providers` part. Consumers pin presets against them. |
| `llmPluginRegistry.effortSupportOf(config)` · `OPENAI_EFFORT_SUPPORT`, `OPENAI_HIDDEN_PROPERTY_NAMES`, `ANTHROPIC_MODEL_SUPPORT` / `anthropicSupportHelper.anthropicSupportOf(model)` · `REASONING_MIN_MAX_TOKENS` | Which `ModelConfig.effort` levels a model accepts, and the per-family Anthropic facts beside them — see "Fallback chains and provider effort" in the `presets` part. |
| `ThinkingOff`, `anthropicSupportHelper.thinkingOffFor(config)` · `anthropicSupportHelper.rejectsForcedTool(model)` | The Anthropic off switch a config sends (`disabled`, `between_tools`, or none), and whether a model refuses a pinned `tool_choice`. |
| `retryHelper.{withRetry, registerFatalError, isFatalError}`, `spectate(spectator, callType)(input, message, action, retries, startedAt?, model?)`, `normalizeInput`, `jsonHelper.{parseJsonContent, coerceToSchema}`, `resolveFallbacks`, `PROVIDER_NEUTRAL_FIELDS` | Helpers usable alongside a model. `spectate`'s `model` is the ANSWERING rung's id, put on the entry only when known; `normalizeInput` copies the caller's messages, so preparing never edits them. Also at `@owlmeans/llm/helpers`. |
| `LlmError`, `LlmModelError`, `LlmMissconfiguredError`, `LlmPluginError`, `LlmRetryExceededError` | `ResilientError` family. `LlmModelError` is the RETRYABLE one. |
| `executionPolicyHelper.{mergePrompt, mergeFocus, mergePolicy, resolveRole, effortPatch}`, `executionStateHelper.freezeResults` | Execution merge helpers; `mergePrompt` unions skills, takes the deepest role, unions `focus` lists (the deepest `late` wins) and merges `cacheTtl` objects key by key; `freezeResults` deep-freezes a results view. |
| `DEFAULT_MODEL_RETRIES`, `MODEL_STREAM_TIMEOUT_MS` (3 min idle), `FALLBACK_AFTER_ATTEMPTS`, `TEMPERATURE_PER_EFFORT_STEP`, `DEFAULT_EFFORT`, `EFFORT_TABLE`, `MAX_CACHE_BREAKPOINTS`, `MIN_CACHEABLE_TOKENS`, `DEFAULT_CACHE_TTL`, `PROJECT_CONTEXT_HEADER`, `TAIL_SCHEMA_INSTRUCTION`, `LLM_SERVICE`, `EXECUTION_SERVICE`, `PROMPT_SERVICE` | Tuning + aliases. |

## System prompts: a role and skills, never a hand-built message

`makeLlmModel` takes `prompt` (a `PromptInput`) and a `prompts` resolver. The prompt service
composes them into regions — the system message (role, skills, packages), a project message right
after it (results, context) and a Tail on the final message (per-call skills) — which the provider
plugin marks with cache breakpoints; a caller's own leading `SystemMessage` becomes `Context` in the
project message (in the system message when no persona was composed), so an unmigrated call site
still works. **Do not build a
persona as a `SystemMessage` in a helper** — declare it as `PromptPolicy.role` plus registered
skills, or the knowledge duplicates and the cache prefix stops being stable. Skills accumulate down
the execution chain (project → task → helper) and the deepest declared `role` wins (`executionPolicyHelper.mergePrompt`).
The regions, the four breakpoints and their lifetimes, `stable` / `focus` / tail schemas, tool-loop
caching, the provider facts behind them, and the plugin seams `claim(key)` / `utility`:
[[llm-prompt-caching]].

## Peer-dependency rule (langchain identity)

`@langchain/core`, `@langchain/openai` and `@langchain/anthropic` are **peer** dependencies: model
instances cross the package boundary, and two installed copies of a class with protected members are
nominally distinct types. A consumer must end up with exactly ONE copy of each — declare them at one
range and check no nested `node_modules` holds a second, or every model instance crossing a boundary
becomes a foreign type and `instanceof` starts lying.

## Resilience already handled — do not reimplement

Idle stream deadline · duplicate-final-chunk dedup · usage drain after `finish_reason` (at most 8
usage-only reads within 10 s — Chat Completions sends token counts last) · output-budget escalation · reasoning-cap shrink ·
adaptive-thinking budget floor · fallback chain across providers · effort climb per rung ·
reasoning budget floor · caller-seeded ladder position
(`escalation`) · schema coercion · JSON salvage from prose · `NullCapture` diagnostics · fatal-error
short-circuit · blank-content sanitization (whitespace-only text blocks are dropped before every call
— a blank block, e.g. an empty file read pasted into a prompt, is otherwise a fatal Anthropic 400;
blank tool results are stubbed to keep their `tool_use` pairing). Details: package `README.md`.

## Depends On

- `@owlmeans/llm-common` · `@owlmeans/context` · `@owlmeans/error` · `@owlmeans/basic-ids` · `ajv`
- `@anthropic-ai/sdk` — runtime, for the `BadRequestError` the fatal-error rules are written around
- peer `@langchain/core`, `@langchain/openai`, `@langchain/anthropic`

## Related

- [[llm-common]] — the serializable contracts · [[llm-prompt-caching]] — prompt composition, block
  order and the cache invariants
- [[owlmeans-context]] — service registration · [[error]] — the `ResilientError` family

## Parts

| Part | Load it when |
|---|---|
| [providers](parts/providers.md) | adding or changing a provider plugin, or an error that is retried when it should not be |
| [execution](parts/execution.md) | deriving executions, resolving a model by role or effort, passing a results view, or using the utility tier |
| [retries](parts/retries.md) | writing a retry or validation loop around model calls, or a call that hangs or retries too long |
| [presets](parts/presets.md) | writing or changing a model preset, a fallback rung or an effort level |
| [reasoning](parts/reasoning.md) | turning reasoning on or off for a role, or diagnosing an empty or reasoning-only completion |
| [testing](parts/testing.md) | running or adding tests of this package |
