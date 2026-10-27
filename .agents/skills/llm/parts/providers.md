---
name: providers
description: The LlmPlugin seam that replaces provider ifs, the sampling parameters each family rejects, plugin registration order, and classifying a provider error by walking cause.
metadata:
  purposes: agent, config
  mentions: LlmPlugin, llmPluginRegistry, resolveFor, patchPrompt, loopCache, cacheDialect, anthropicPlugin, openAiPlugin, compatiblePlugin, openAiFamily, NO_SAMPLING_PREFIXES, RESPONSES_API_PREFIXES, usesResponsesApi, rejectsSampling, isBadRequest, @owlmeans/llm/plugins
---

# @owlmeans/llm — Provider plugins

## Provider differences are plugins, never `if`s

`LlmPlugin` is the single seam: an `instanceof ChatAnthropic` or `config.provider === …` in `model.ts` or `service.ts` belongs on the plugin.

| Plugin member | Replaces |
|---|---|
| `build` | the provider switch in the model factory |
| `owns` / `family` | `instanceof` checks; a `family` change between rungs re-prepares the request |
| `refine` | the per-provider retry rebuild (budget doubling, reasoning shrink, effort climb) |
| `effort` | which `ModelConfig.effort` levels a model accepts (`llmPluginRegistry.effortSupportOf(config)`) |
| `structuredMode` | native `response_format` vs a structured-output tool call |
| `toolChoice(toolName, config)` / `responseFormat` | the provider-specific call shapes; `config` is the ACTIVE rung's, so a model that refuses a pinned tool gets the automatic choice |
| `pinsTool(config)` / `strictTool(config, schema)` | whether `toolChoice` pins the tool (when not, `prepare` appends `toolCallInstruction`), and whether the tool goes `strict` |
| `schemaDefects(config, schema)` | what the provider would not show the model of a structured-output schema; non-empty is a fatal `LlmMissconfiguredError` before the rung's first request |
| `patchPrompt(plan)` | where a prepared request's cache breakpoints go and how they are spelled (system segments, project message, stable lead), plus the call options the dialect needs; returns new message objects |
| `loopCache(messages, model, hints?)` | the same for one round of a tool loop |
| `cacheDialect(config)` | which cache dialect a config is prepared in; a dialect change between rungs re-prepares the request |
| `cacheKey` (via `ModelConfig.cacheKey`) | provider cache-routing hints such as OpenAI's `prompt_cache_key` |
| `isFatal` | "this error can never be retried" |
| `suppressesThinking` | whether the plugin turns reasoning off on the wire FOR THIS CONFIG, which is what drops the `/no_think` prompt directive from the prepared messages |

### A provider that removes a parameter is a plugin concern too

`build` is not the only place a parameter reaches the wire, and `refine` is not only a retry hook —
**every** call is made on the instance `refine` returns, attempt 0 included. A knob suppressed in
`build` and re-applied in `refine` therefore ships on every single request: an unsupported
`temperature` restored there 400s the model's whole family on the first call, and `isFatal`
correctly refuses to retry it. Both built-in plugins gate their rejected parameters in **both**
hooks, through a predicate the package root exports:

| Family | Rejects | Predicate |
|---|---|---|
| Claude 4.7+ and the 5 family | `temperature`, `top_p`, `top_k` | `NO_SAMPLING_PREFIXES` / `anthropicSupportHelper.rejectsSampling(model)` |
| OpenAI Responses API (`gpt-6*`, `gpt-5*`, `codex-*`) | `temperature`, `top_p` | `RESPONSES_API_PREFIXES` / `usesResponsesApi(model)` |

A new OpenAI family goes into `RESPONSES_API_PREFIXES` the day it is pinned: outside it the model
goes through chat completions with `temperature` (a 400), and chat completions allows tools on
`gpt-6*` only at `reasoning_effort: none`. Models below those lines keep the deterministic
`temperature: 0` default. Each `refine` re-derives the family from the ACTIVE base instance it is
handed — Anthropic from `modelName ?? model`, OpenAI from `model ?? lc_kwargs.model` plus a
`useResponsesApi` already on `lc_kwargs` — so a `fallback` rung is judged on its own id, not the
primary's. Keep the predicate exported: consumers
pin presets against it (viable-agent's `tests/presets.test.ts` asserts no preset entry declares a
parameter its model rejects), and a second hand-written copy drifts when a family is added.

**Registration order is load-bearing.** Instance lookup (`llmPluginRegistry.pluginFor`) returns the FIRST plugin whose
`owns` matches, and `compatible` is registered before `openai` because both build a `ChatOpenAI`:
assuming the tool-calling hack for an unlabelled model is safe everywhere, assuming native
JSON-schema support is not. So instance lookup sends every `ChatOpenAI` to `compatible` — code that
holds a model the service built resolves with `llmPluginRegistry.resolveFor(model)` (the configured
provider's plugin first), on the UNBOUND model: no plugin owns a `bindTools` binding.

## Classify a provider error by walking `cause`, never by `instanceof` or a surface read

Two independent layers hide the wire shape of a provider failure, and each alone makes a fatal error
look retryable — costing the whole retry budget with the real message buried under the repeats.

1. **Nested SDK copies.** `@langchain/anthropic` and `@langchain/openai` bundle their OWN copies of
   the provider SDKs, so `e instanceof BadRequestError` compares against a DIFFERENT class than the
   one this package imports and silently returns `false`.
2. **Langchain's own error wrappers.** A failure is re-wrapped in a typed langchain error
   (`ContextOverflowError` for an input past the context window, and its siblings) carrying the
   original **only under `cause`**, no `status` of its own — so `e.status === 400` misses it.

Use `pluginUtils.isBadRequest` from `plugins/utils.ts`: it walks the `cause` chain for `status === 400`, bounded
in depth so a self-referential chain terminates. Both built-in `isFatal` implementations go through
it. A context overflow makes this urgent: `refine` escalates the **output** budget on each retry, so
an over-limit **input** can never improve — every attempt re-sends the identical oversized request,
and consumers hold their locks for the whole loop. The same trap applies to any cross-copy
`instanceof`; it is the runtime face of the peer-dependency rule in the core skill.
