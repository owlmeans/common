---
name: providers
description: The LlmPlugin seam that replaces provider ifs, the sampling parameters each family rejects, plugin registration order, the transport seam, OpenAI background mode on the direct route, and classifying a provider error by walking cause.
metadata:
  purposes: agent, config
  mentions: LlmPlugin, llmPluginRegistry, LlmRefineParams, LlmFetchObserver, LlmStreamResume, background, starting_after, mediaDialect, mediaLimits, llmTransportRegistry, LlmTransport, LlmFetch, resolveFor, patchPrompt, loopCache, cacheDialect, anthropicPlugin, openAiPlugin, compatiblePlugin, openAiFamily, NO_SAMPLING_PREFIXES, RESPONSES_API_PREFIXES, usesResponsesApi, rejectsSampling, isBadRequest, @owlmeans/llm/plugins
---

# @owlmeans/llm — Provider plugins

## Provider differences are plugins, never `if`s

`LlmPlugin` is the single seam: an `instanceof ChatAnthropic` or `config.provider === …` in `model.ts` or `service.ts` belongs on the plugin.

| Plugin member | Replaces |
|---|---|
| `build` | the provider switch in the model factory |
| `owns` / `family` | `instanceof` checks; a `family` change between rungs re-prepares the request |
| `refine` | the per-provider rebuild of EVERY attempt: budget doubling and reasoning-cap shrink by `climb ?? attempt`, effort climb by `rungAttempt ?? attempt` (the `retries` part says what each counts); the refined client's fetch wrapped by the attempt's `observe` (an HTTP plugin must; one that sends no request ignores it); OpenAI background mode (below) |
| `effort` | which `ModelConfig.effort` levels a model accepts (`llmPluginRegistry.effortSupportOf(config)`) |
| `structuredMode` | native `response_format` vs a structured-output tool call |
| `toolChoice(toolName, config)` / `responseFormat` | the provider-specific call shapes; `config` is the ACTIVE rung's, so a model that refuses a pinned tool gets the automatic choice; the OpenAI family's `responseFormat` sends the schema with its hidden constraints stated (below) |
| `pinsTool(config)` / `strictTool(config, schema)` | whether `toolChoice` pins the tool (when not, `prepare` appends `toolCallInstruction`), and whether the tool goes `strict` |
| `schemaDefects(config, schema)` | what the provider would not show the model of a structured-output schema; non-empty is a fatal `LlmMissconfiguredError` before the rung's first request |
| `patchPrompt(plan)` | where a prepared request's cache breakpoints go and how they are spelled (system segments, project message, stable lead), plus the call options the dialect needs; returns new message objects |
| `loopCache(messages, model, hints?)` | the same for one round of a tool loop |
| `cacheDialect(config)` | which cache dialect a config is prepared in; a dialect change between rungs re-prepares the request |
| `cacheKey` (via `ModelConfig.cacheKey`) | provider cache-routing hints such as OpenAI's `prompt_cache_key` |
| `isFatal` | "this error can never be retried" |
| `search` | the provider's web-search dialect (`webSearch`); declared per plugin, never in a family spread — see the `web-search` part |
| `suppressesThinking` | whether the plugin turns reasoning off on the wire FOR THIS CONFIG, which is what drops the `/no_think` prompt directive from the prepared messages |
| `media` / `mediaDialect` / `mediaLimits` | the provider's spelling of a neutral image or PDF part, which spelling a config gets (a change between rungs re-prepares), and the per-request media limits — see the `media` part |

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

### A non-strict OpenAI `json_schema` hides validation keywords — the family states them

The OpenAI family (`openai` and `compatible`) asks for structured output with `json_schema`,
`strict: false`, and OpenAI renders that schema to the model WITHOUT its validation keywords
(`OPENAI_HIDDEN_PROPERTY_NAMES`): a nested optional object's `required` key is never seen, and every
answer fails Ajv the same way. `openAiFamily.responseFormat` therefore sends a deep copy whose nodes
end their `description` with what was stripped — "Required." for a key its object requires, "May be
null." for `nullable`, lengths, item counts, bounds, `pattern`, `format`; values (`enum`, `const`,
`default`) are never walked. The caller's schema is never edited, Ajv validates it as written,
`schemaDefects` still refuses a PROPERTY named like a keyword, and the copy is deterministic, so the
cache line of a schema holds. `schemaPlacement: 'tail'` shows the whole schema as text and needs none.

**Registration order is load-bearing.** Instance lookup (`llmPluginRegistry.pluginFor`) returns the FIRST plugin whose
`owns` matches, and `compatible` is registered before `openai` because both build a `ChatOpenAI`:
assuming the tool-calling hack for an unlabelled model is safe everywhere, assuming native
JSON-schema support is not. So instance lookup sends every `ChatOpenAI` to `compatible` — code that
holds a model the service built resolves with `llmPluginRegistry.resolveFor(model)` (the configured
provider's plugin first), on the UNBOUND model: no plugin owns a `bindTools` binding.

## Where a client's requests go over the wire is a transport, not a plugin

A plugin decides what a request SAYS; a **transport** decides where it travels. `llmTransportRegistry`
(process-wide, like the plugin table) maps a provider to an `LlmTransport`, whose `fetch(params)` —
`{ provider, alias, config }`, the config without its secret — answers the `fetch` the client should
use, or `undefined` to leave it on the SDK's own. The built-in plugins ask once, in `build`:
`ChatOpenAI` gets it as `configuration.fetch` (the `openai` and `compatible` plugins, the Responses and
the chat-completions client alike), `ChatAnthropic` as `clientOptions.fetch`. `refine`, `withConfig`
and `bindTools` rebuild from `lc_kwargs`, which keep both, so every retry rung keeps its transport.

- The SDKs call `fetch(urlString, { method, headers: Headers, body: JSON string, signal })`, one call
  per attempt (langchain sets the SDK's own `maxRetries` to 0), and read a streamed answer from
  `response.body` without checking its content type.
- A transport is read when a client is BUILT; clients are memoized per alias, so attach before the first
  model is resolved. `detach` does not touch clients already built.
- The model id, the key and the wire shape stay the plugin's: a transport that renames a model or swaps
  a key does it on the request it is handed, never in the config — `usesResponsesApi`, the effort
  table, the cache dialect and every consumer's price list key on the id the config names.
- Keep the proxying itself out of this package: `@owlmeans/llm-proxy` (internal) is the one consumer.
- A web search (`LlmService.webSearch`) never consults a transport: it is a direct request to the
  provider, so a proxy attached here cannot reroute it (the `web-search` part).
- `refine` never replaces the transport: it wraps whatever fetch the built client carries with the
  attempt's observer (`LlmRefineParams.observe`), on the refined instance only.

## OpenAI background mode — the direct route only

A long OpenAI call whose connection drops is lost, and a lost connection looks like a slow one.
Background mode (`background: true` with `stream: true` on `POST /v1/responses`) keeps the response
running on OpenAI's side, pollable (`GET /v1/responses/{id}`: `queued`, `in_progress`, …, the whole
stored response once finished), resumable in principle (`GET /v1/responses/{id}?stream=true&starting_after=<sequence_number>`) and cancellable
(`POST /v1/responses/{id}/cancel`). The `openai` plugin alone runs it (`plugins/openai/background.ts`):

- **Who.** `build` asks the transport first (`routed = fetchFor(…)`); with no route, a Responses-API
  model with `ModelConfig.background !== false` gets a background-aware fetch MARKED with its mode
  (unset = auto, `true` = always). Only `openAiPlugin.refine` adds `background: true` to `modelKwargs`,
  when the marker is present and the mode is always or the attempt's (climbed) effort is `high`+.
  Never `build`'s `modelKwargs`: the non-streamed `_generate`/`responses.parse` path and every tool
  loop over the raw model read those. A proxied route, the `compatible` plugin and a raw `.invoke()`
  never ask; a non-streamed body carrying the flag (a refined instance invoked raw) has it removed.
- **The splice.** Everything but a streamed POST `/responses` with `background: true` passes
  through. That stream is re-cut into complete SSE records only — a torn tail at a drop is dropped,
  since the SDK flushes a half event at the end of a stream and fails parsing it. The response id
  (from `response.created`), the last forwarded `sequence_number` and what each output item has
  already been handed (opened, text and arguments characters, done) are tracked. A `keepalive`
  record (`{"type":"keepalive","sequence_number":N}`, every ~30 s while events pause) is always
  forwarded — bytes the attempt's observer counts — and never moves the cursor: its number counts
  the connection's own keepalives (a resumed stream starts again at 0).
- **The polls are the authority.** On a drop, or 60 s with no new event (keepalives do not count),
  the response is polled with the request's own auth headers under its own timeout. While it is
  `queued`/`in_progress` a `: poll` SSE comment is added (provider-confirmed liveness for the
  observer); a silent but open stream keeps being read, and only a dropped one is replaced by a
  resumed stream (`?stream=true&starting_after=<last>`), opened in the background — OpenAI answers it
  with its first record, a keepalive ~30 s in, so its headers get the 60 s window — whose replayed
  events are dropped. Once the poll finds the response `completed`/`incomplete`/`failed`, the
  stored copy completes the stream: for each output item what was not forwarded yet (its `added`,
  the rest of its text or arguments as one delta, its `done`), then the terminal event with the whole
  response; a `cancelled` one is a stall. After a terminal event the stream closes with its upstream
  and nothing is polled. A resumed stream that drops having brought nothing new waits for the next
  poll instead of reopening at once. `content-length`/`content-encoding` are stripped from the
  spliced response.
- **Failure.** Three failed polls in a row fail the body with
  `LlmModelError('stream-stalled:background stream lost after 3 failed polls')` — never an
  abort-shaped error, which the SDK's SSE reader swallows into a short "success". The lost response
  is cancelled, and the model retries the call without climbing.
- **Cancel.** On the SDK's abort or a cancelled body — once, with a known id and no terminal event —
  `POST …/cancel` goes out fire-and-forget under its own `AbortSignal.timeout(10 s)` (the SDK's
  signal is the aborted one); its answer's status is logged. OpenAI answers `cancelled` at once, but
  a response already running reports `in_progress` for a while before its own status follows (13 s
  measured). A resume or a completion from the stored copy reaches the attempt's observer
  (`LlmFetchObserver.resumed`) and the spectator as a `resumed` notice.
- **Measured on the official API (gpt-6-luna, 2026-11-16).** A resumed stream is unreliable: once it
  brought the remaining events (headers after 13 s), in two probes keepalives only — no replayed and
  no new events — even for a response that had already finished; that is why the polls, not the
  resume, finish a dropped stream. A drop while the response was still `queued` left
  it `in_progress` for over five minutes (one probe); the attempt's progress deadline bounds it, the
  abandoned response is cancelled and the call asked again. A drop once it was `in_progress` let it
  finish normally.
- **Known gaps.** An abort before `response.created` (no id yet), or a process restart, leaves a
  billed response running to completion on OpenAI. A person's stop does not abort an in-flight model
  call — no signal reaches the call options; it lands at the caller's next step. A bare `break` out
  of a langchain stream reaches the SDK only with the next chunk (an async generator's `return`
  waits for its pending read); aborting the call's signal cancels at once. Reasoning summaries are
  not rebuilt from a stored copy.
- `store` is left to OpenAI's default (true); `store: false` with `background: true` is accepted
  (200, `queued`). The live spec (`background-live.spec.ts`) records the wire.

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
it. A context overflow makes this urgent: no retry changes the **input**, so an over-limit request
can never improve — every attempt re-sends the identical oversized request,
and consumers hold their locks for the whole loop. The same trap applies to any cross-copy
`instanceof`; it is the runtime face of the peer-dependency rule in the core skill.
