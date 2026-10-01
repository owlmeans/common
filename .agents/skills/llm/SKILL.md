---
name: llm
description: How to use @owlmeans/llm — the LLM inference runtime (four-method model, provider plugins, model factory service, policy-driven execution abstraction, and the prompt/skill composition service). Auto-invoked when importing the model, an LlmPlugin, the LlmService, the execution service, or the prompt service.
user-invocable: false
---

# @owlmeans/llm

**Layer:** Core
**Install:** `"@owlmeans/llm": "^0.1.18-rc.42"` in `dependencies` (plus the `@langchain/*` peers)

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
| `makeLlmService(options, alias?)` · `appendLlmService(ctx, options, alias?)` · `llmServiceApi(options, self)` | Model factory/registry — `makeLlmService({ models: () => configs }).getModel(alias, override?)` resolves a `ModelConfig` by alias, memoized per alias+override. The `…Api` half omits `createService`, to compose into your own service (role accessors, domain helpers). |
| `makeExecutionService(alias?, options?)` · `appendExecutionService(ctx, alias?, options?)` · `executionServiceApi(options, self)` | Frozen 3-level executions + policy resolution + snapshot/restore + advice + the results view (`withResults`), and the same composable half. |
| `makePromptService(options?, alias?)` · `appendPromptService(ctx, options?, alias?)` · `promptServiceApi(options, self)` | Skill registry + the composition plugin chain. Also at `@owlmeans/llm/prompt`. |
| `rolePlugin`, `skillsPlugin`, `resultsPlugin`, `contextPlugin`, `BUILT_IN_PROMPT_PLUGINS` | The built-in composition plugins. |
| `PromptContext.claim(key)` · `PromptComposeParams.utility` | Per-composition ownership of a key; a cheap model for one plugin-side call. |
| `renderSkill`, `sortSkills`, `joinChunks`, `compareAlias`, `prefixHash` · `readCacheUsage`, `hasCacheActivity` | Deterministic rendering primitives — reuse them, never re-implement — and normalized prompt-cache accounting from a completion. |
| `plugins`, `registerLlmPlugin`, `resolvePlugin`, `pluginOf`, `pluginFor` | The provider-plugin registry. Also at `@owlmeans/llm/plugins`. |
| `anthropicPlugin`, `openAiPlugin`, `compatiblePlugin`, `openAiFamily` | Built-in providers; `openAiFamily` is the shared OpenAI-client behaviour to spread into a new plugin. |
| `NO_SAMPLING_PREFIXES` / `rejectsSampling(model)` · `RESPONSES_API_PREFIXES` / `usesResponsesApi(model)` | Which families reject which sampling parameters — see the table below. Consumers pin presets against them. |
| `effortSupportOf(config)` · `OPENAI_EFFORT_SUPPORT`, `OPENAI_HIDDEN_PROPERTY_NAMES`, `ANTHROPIC_MODEL_SUPPORT` / `anthropicSupportOf(model)` · `REASONING_MIN_MAX_TOKENS` | Which `ModelConfig.effort` levels a model accepts, and the per-family Anthropic facts beside them — see "Fallback chains and provider effort". |
| `ThinkingOff`, `thinkingOffFor(config)` · `rejectsForcedTool(model)` | The Anthropic off switch a config sends (`disabled`, `between_tools`, or none), and whether a model refuses a pinned `tool_choice`. |
| `withRetry`, `registerFatalError`, `isFatalError`, `spectate`, `normalizeInput`, `parseJsonContent`, `coerceToSchema`, `resolveFallbacks`, `PROVIDER_NEUTRAL_FIELDS` | Helpers usable alongside a model. Also at `@owlmeans/llm/helpers`. |
| `LlmError`, `LlmModelError`, `LlmMissconfiguredError`, `LlmPluginError`, `LlmRetryExceededError` | `ResilientError` family. `LlmModelError` is the RETRYABLE one. |
| `mergePrompt`, `mergePolicy`, `resolveRole`, `effortPatch`, `freezeResults` | Execution merge helpers; `mergePrompt` unions skills and takes the deepest role; `freezeResults` deep-freezes a results view. |
| `DEFAULT_MODEL_RETRIES`, `MODEL_STREAM_TIMEOUT_MS` (3 min idle), `FALLBACK_AFTER_ATTEMPTS`, `TEMPERATURE_PER_EFFORT_STEP`, `DEFAULT_EFFORT`, `EFFORT_TABLE`, `MAX_CACHE_BREAKPOINTS`, `MAX_SYSTEM_BREAKPOINTS`, `MIN_CACHEABLE_TOKENS`, `LLM_SERVICE`, `EXECUTION_SERVICE`, `PROMPT_SERVICE` | Tuning + aliases. |

## Provider differences are plugins, never `if`s

`LlmPlugin` is the single seam: an `instanceof ChatAnthropic` or `config.provider === …` in `model.ts` or `service.ts` belongs on the plugin.

| Plugin member | Replaces |
|---|---|
| `build` | the provider switch in the model factory |
| `owns` / `family` | `instanceof` checks; a `family` change between rungs re-renders the prompt |
| `refine` | the per-provider retry rebuild (budget doubling, reasoning shrink, effort climb) |
| `effort` | which `ModelConfig.effort` levels a model accepts (`effortSupportOf(config)`) |
| `structuredMode` | native `response_format` vs a structured-output tool call |
| `toolChoice(toolName, config)` / `responseFormat` | the provider-specific call shapes; `config` is the ACTIVE rung's, so a model that refuses a pinned tool gets the automatic choice |
| `pinsTool(config)` / `strictTool(config, schema)` | whether `toolChoice` pins the tool (when not, `prepare` appends `toolCallInstruction`), and whether the tool goes `strict` |
| `schemaDefects(config, schema)` | what the provider would not show the model of a structured-output schema; non-empty is a fatal `LlmMissconfiguredError` before the rung's first request |
| `patchSystem` | how the composed system blocks are rendered and where their cache breakpoints go |
| `patchCache` | the message-prefix cache marker |
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
| Claude 4.7+ and the 5 family | `temperature`, `top_p`, `top_k` | `NO_SAMPLING_PREFIXES` / `rejectsSampling(model)` |
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

**Registration order is load-bearing.** Instance lookup (`pluginFor`) returns the FIRST plugin whose
`owns` matches, and `compatible` is registered before `openai` because both build a `ChatOpenAI`:
assuming the tool-calling hack for an unlabelled model is safe everywhere, assuming native
JSON-schema support is not.

## System prompts: a role and skills, never a hand-built message

`makeLlmModel` takes `prompt` (a `PromptInput`) and a `prompts` resolver. The prompt service
composes them into an ordered, cacheable system message; a caller's own leading `SystemMessage` is
folded into the volatile `Context` block, so an unmigrated call site still works. **Do not build a
persona as a `SystemMessage` in a helper** — declare it as `PromptPolicy.role` plus registered
skills, or the knowledge duplicates and the cache prefix stops being stable. Skills accumulate down
the execution chain (project → task → helper) and the deepest declared `role` wins (`mergePrompt`).
Block order, the breakpoint budget, the provider facts behind them, and the plugin seams
`claim(key)` / `utility`: [[llm-prompt-caching]].

## Execution: policy in, model out

`ProjectExecution` (policy + purpose + models resolver) → `TaskExecution` (+ resumable state:
phase/cursor/completed/data) → `HelperExecution` (+ a RESOLVED model + `temperatureFactory`, a role).

`prompt` (role + skills) travels on `ExecutionState`, so it survives snapshot/restore; `prompts` and
`files` are collaborators and never enter a snapshot. Every method returns a NEW `Object.freeze`d
object. Resolution precedence in `model(exec, role, override)`: **roleOverride → modelOverride →
effort tier → `LlmService.getModel`**; `escalate(exec, { effort })` raises the tier once and cascades
to everything derived from it. `snapshot` excludes `state` itself — without that, every
`derive`/`escalate`/`withPurpose` on a task would nest another copy of the previous state.

### The results view: `withResults(exec, view)`

`ExecutionState.results` carries what the earlier steps of the pipeline an execution works inside
produced (`CumulativeResults`, cut by `@owlmeans/agent`'s `cumulativeResultsPlugin`). A step hands
its own view in with `withResults(exec, ctx.results?.view)`: a new frozen execution, the view
deep-frozen, REPLACING any view already carried — one cut for another step names the wrong
predecessors — and `null`/`undefined` drops the key entirely, so the execution and its snapshots are
what they would be had it never carried one. Inheritance is the ordinary spread down
`forTask`/`forHelper`, and `makeLlmModel` takes `results` from its options, so a consumer that builds
its model from the helper execution itself (`makeLlmModel(exec, spectator)`) composes the view with
no other change. Without a `prompts` resolver, like `prompt`, it is ignored.

Extending it for a domain: declare your own `Execution`/input types, list collaborator fields in
`ExecutionServiceOptions.collaboratorKeys` (kept out of snapshots), instantiate the service generic
with your own `ExecutionShape`, and **never narrow an inherited method signature** (contravariance).

`forHelper` also accepts `output` — an initial `maxTokens` for a helper whose one answer is genuinely
large (a whole source file, not a decision). It is a model selector, not a field the helper carries:
it becomes a call override, clamped to `maxOutput`, doubling under retry, surviving `temperatureFactory`.

### The cheap tier: `utility(exec, override?)`

Work that is not the work — a relevance pick, a classification, a one-line judgement a plugin needs
before the real call can be shaped — runs on `ExecutionService.utility`, never on the helper's own
model. It resolves `policy.utilityRole ?? UTILITY_ROLE` (`@owlmeans/llm-common`, value `'utility'`)
at `ExecutionEffort.Economy`, through the SAME ladder as `model()`: `roleOverrides` remap it and
`modelOverrides` pin it as for any other role. The economy floor is local — the execution it was
asked on keeps its own tier — and `utilityRole` travels on `ModelPolicy`, so it survives
`forTask`/`escalate` and a snapshot/restore round trip. `utility` returns a `BaseChatModel`, never
`undefined`: an alias with no registered config reaches `createModel` through `model()` and throws
`LlmMissconfiguredError`, like any other unregistered role. The `undefined` a prompt plugin has to
handle comes from the other end — `PromptComposeParams.utility` (and `AgentOptions.utility`) is an
OPTIONAL resolver, unset wherever no cheap tier is wired, so a plugin that cannot get one degrades
rather than fails.

### The plugin seam is `advise`-only, and `use()` seats by alias

`ExecutionPlugin` carries one hook: `advise` — answer a performer's question about the project it
works in (`ExecutionService.advise(exec, request)`, first usable answer wins, a throwing plugin is
skipped, `null` when nobody answers). Advice is advisory by contract: a caller appends whatever
comes back and proceeds unchanged on `null`.

**There is no checkpoint pair here, and that is a decision rather than a gap.** An execution is a
COLLABORATOR — a model policy, a purpose, a file helper — rebuilt per run from durable inputs, not
an artifact something restores. Resumability belongs to `@owlmeans/agent`'s pipeline runner, where
the persisted run ROW is the authority on where a run stands. Two half-truths about that would be
worse than one; `ExecutionService.checkpoint` and `ExecutionPlugin.onCheckpoint|onRestore` were
deleted for exactly that reason, having never been implemented by anything.
`TaskExecutionState.{phase, completed, cursor}` survive as **labels** for traces and prompts — a
human-readable "where am I" for a model to read, never a position anything resumes from.

`use(plugin)` seats **by alias**, replacing a plugin already registered under the same one. Mixins
compose, and a layer wired twice would otherwise answer twice — silently, since the first usable
answer wins.

## Classify a provider error by walking `cause`, never by `instanceof` or a surface read

Two independent layers hide the wire shape of a provider failure, and each alone makes a fatal error
look retryable — costing the whole retry budget with the real message buried under the repeats.

1. **Nested SDK copies.** `@langchain/anthropic` and `@langchain/openai` bundle their OWN copies of
   the provider SDKs, so `e instanceof BadRequestError` compares against a DIFFERENT class than the
   one this package imports and silently returns `false`.
2. **Langchain's own error wrappers.** A failure is re-wrapped in a typed langchain error
   (`ContextOverflowError` for an input past the context window, and its siblings) carrying the
   original **only under `cause`**, no `status` of its own — so `e.status === 400` misses it.

Use `isBadRequest` from `plugins/utils.ts`: it walks the `cause` chain for `status === 400`, bounded
in depth so a self-referential chain terminates. Both built-in `isFatal` implementations go through
it. A context overflow makes this urgent: `refine` escalates the **output** budget on each retry, so
an over-limit **input** can never improve — every attempt re-sends the identical oversized request,
and consumers hold their locks for the whole loop. The same trap applies to any cross-copy
`instanceof`; it is the runtime face of the peer-dependency rule below.

## Peer-dependency rule (langchain identity)

`@langchain/core`, `@langchain/openai` and `@langchain/anthropic` are **peer** dependencies: model
instances cross the package boundary, and two installed copies of a class with protected members are
nominally distinct types. A consumer must end up with exactly ONE copy of each — declare them at one
range and check no nested `node_modules` holds a second, or every model instance crossing a boundary
becomes a foreign type and `instanceof` starts lying.

## Hangs are bounded by an IDLE deadline, not a total one

A stalled provider is aborted after `MODEL_STREAM_TIMEOUT_MS` (3 min) of SILENCE and surfaces as a
retryable `LlmModelError`, so the escalator moves on. The timer re-arms on every token, so a
long-but-productive generation is never cut off — which is why the value can be low. Set it for a
deployment with `LlmServiceOptions.streamTimeout` where the application composes its context; a
preset naming its own `ModelConfig.streamTimeout` keeps it. It does NOT bound a call that keeps
streaming forever, nor retries — a fatal error misclassified as retryable multiplies its own latency
by `DEFAULT_MODEL_RETRIES`.

## An outer validation loop must pass its attempt in

A caller that validates the OUTPUT — a diff that has to apply, a file that must not come back
truncated — runs its own retry loop around whole `ask` calls. Every one of those calls starts a FRESH
inner loop at attempt 0, so the escalator's two rungs never move: same model, same output budget,
same deterministic answer, N times. Pass `escalation: <outer attempt>` in `LlmCallOptions` and the
per-call escalator starts that far up its ladder instead — `maxTokens` doubling and the
`FALLBACK_AFTER_ATTEMPTS` switch to `ModelConfig.fallback` both advance. It is clamped to
`retries - 1`, moves the STARTING rung only, and never changes how many attempts the call makes. The
model switch depends on preset data rather than code: the role must declare a `fallback`.
`LlmCallOptions.fatal` is the lever
in the other direction — a per-call resolver consulted before the global ones and the plugin's
`isFatal`, for an error the caller knows no retry can fix.

### A loop ABOVE the model asks the same question with `isFatalError`

A retry loop is not the only place that decides to carry on: a fix ladder rescues a failed repair and
climbs to a stronger model, an agent runner catches a round that threw and reports "gave up". Both
are right for a model that answered badly and wrong for a budget that ran out, and a blanket `catch`
cannot tell them apart — an exhausted balance becomes more expensive calls instead of a halt.
`isFatalError(e, fatal?)` runs the same resolvers, in the same order, that `withRetry` uses, and
returns the error to abort WITH (a resolver may unwrap a carrier and hand back the real cause) or
`null` when nothing considers it terminal. Ask it rather than re-deriving the rule.

## Output caps: what the deployment wants vs what the provider allows

Four fields, and conflating them turns an escalation into a fatal 400 hours into a run:

| Field | Means |
|---|---|
| `maxTokens` | the budget asked for on the FIRST attempt |
| `maxTokensCap` | the ceiling the deployment budgets for the escalator |
| `maxOutput` | what the PROVIDER accepts in one request — a fact about the model |
| `contextWindow` | total window (input + output); informational, never sent |

`resolveOutputCap` (`utils/config.ts`) reconciles them: the declared cap chooses the ceiling and the
capability trims it, and `DEFAULT_MAX_OUTPUT_CAP` applies only when neither is stated. `createModel`
also clamps `maxTokens` to `maxOutput` and warns about a cap above it. For an aggregated model
`maxOutput` is the limit of the `inferenceProvider` actually pinned, often far below what the model
can do elsewhere. `combinedWindow: true` marks a model whose window is shared between input and
output (MiniMax M2.x, gpt-oss) — nothing enforces it at runtime; it keeps presets honest about
leaving room for the prompt. **A `fallback` that changes `model` must restate
`contextWindow`/`maxOutput`** (and reset `combinedWindow`): on the same provider the fallback config
is `{...rungAbove, ...fallback}`, so every field the patch does not name is inherited from a
different model. `createModel` clamps `maxTokens` per rung, against that rung's own `maxOutput`.

## Fallback chains and provider effort

**A `fallback` may carry its own `fallback`; the chain is the escalation ladder.** `resolveFallbacks`
(`helpers/fallback.ts`, exported) is the ONE merge: the service builds from it and hangs each rung
off the one above as `__fallbackModel`; a consumer walking a preset (tests, a price list) calls it
rather than re-spreading. Each rung gets `FALLBACK_AFTER_ATTEMPTS` attempts, the last keeps the rest
(`utils/rungs.ts` — 8 retries over three rungs = 3 / 3 / 2).

**A rung may name another `provider`.** It then inherits only `PROVIDER_NEUTRAL_FIELDS` (`maxTokens`,
`maxTokensCap`, `streamTimeout`, `cacheKey`), so it must bring its own `secret`, `model`, capability,
`disableThinking` and `effort`; a missing `secret` is `LlmMissconfiguredError` at `getModel`, not a
401 mid-run. `makeLlmModel` takes EVERYTHING provider-shaped from the active rung — `refine`,
`structuredMode`/`toolChoice`/`responseFormat`, the idle deadline — and re-runs `prepare` whenever
the rung's `family` differs from the last one prepared (system blocks, cache markers and the
thinking switch are provider dialect; the markers live on the caller's messages, so each rendering
clears the last one's). Keying anything on the PRIMARY's plugin reintroduces the old single-family
bug: another provider's rung asked in the primary's `tool_choice` spelling is a fatal 400.

**`ModelConfig.effort` (`ModelEffort`, `@owlmeans/llm-common`) is the provider's own knob** —
OpenAI `reasoning.effort`, Anthropic `output_config.effort` — and not `ExecutionEffort`, which is
this package's token-budget tier. Plugin tables are the authority (`OPENAI_EFFORT_SUPPORT` verified
2026-09-23 against developers.openai.com/api/docs/models/*; `ANTHROPIC_MODEL_SUPPORT` verified
2026-09-29 against platform.claude.com/docs/en/models/{sonnet-5-5,opus-5-5,fable-5-1}/whats-new-* and
build-with-claude/effort):

| Model | Levels | Default |
|---|---|---|
| `gpt-6-sol`, `gpt-6-luna` | none, low, medium, high, xhigh, max | medium |
| `gpt-6-astra` | low … max (`none` is a 400) | medium |
| `gpt-5*` and older OpenAI | not sent — accepted sets vary per snapshot | — |
| Claude Opus 5.5 | low … max | medium |
| Claude Sonnet 5.5, Opus 5, Fable 5.1/5, Mythos 5.1/5, Opus 4.8/4.7, Sonnet 5 | low … max | high |
| Claude Mythos Preview, Opus 4.6, Sonnet 4.6 | low, medium, high, max (no xhigh) | high |
| Claude Opus 4.5 | low, medium, high | high |
| Claude Haiku 4.5, Sonnet 4.5 and older | field rejected — never sent | — |

A declared level the model lacks is clamped DOWN to the nearest accepted one (never a 400); an
undeclared effort is not sent at all (omitting it is how the default is asked for).

**The Anthropic families differ in three ways that are each a 400**, and `ANTHROPIC_MODEL_SUPPORT`
(first prefix match wins, so `claude-sonnet-5-5` sits above `claude-sonnet-5`) is where each fact
lives — never an inline check on one id:

| Family | Off switch under `disableThinking` | Effort beside it | Pinned `tool_choice` | Cache minimum |
|---|---|---|---|---|
| Sonnet 5.5 | `between_tools` (alone — `display`, `budget_tokens`, `block_binding` beside it are 400s) | low … high (`thinkingOffCeiling`) | 400 | 512 |
| Opus 5.5 | none: always thinks, nothing is sent, effort is the control | all | 400 | 512 |
| Fable 5.1, Mythos 5.1 | none | all | 400 | 512 |
| Fable 5, Mythos 5 | none | all | accepted | 512 |
| Opus 5 | `disabled` | low … high (`thinkingOffCeiling`) | accepted | 512 |
| Sonnet 5, Opus 4.8/4.7 | `disabled` | all | accepted | 1024 |
| Older models (Haiku 4.5, Sonnet 4.6, …) | none — they reason only when asked | per the effort table | accepted | 1024 |

`thinkingOffFor(config)` is the value `build` sends; `refine` carries it through `lc_kwargs` and
reads it back to keep the ceiling, so a climbed retry stops at `high` instead of answering 400. The
cache minimum is the default under a preset's own `cacheMinTokens`.

**Structured output on a model that refuses a pinned tool** (`rejectsForcedTool`): `toolChoice`
answers `{ type: 'auto' }`, `pinsTool` answers `false`, and `prepare` appends
`toolCallInstruction(toolName)` to the per-call payload after the JSON mention — the prompt is all
that asks for the call. The tool goes `strict: true` only when `isStrictSchema(schema)` (every object
closed with `additionalProperties: false`, basic types, scalar `enum`/`const`, `anyOf`/`allOf`, the
listed formats, `minItems` 0/1; no `$ref`, no length/pattern/numeric constraints, no `nullable`): a
strict schema outside that subset is a 400 no retry fixes, while a non-strict one is still checked by
the caller's validator. A reply with no tool call falls to the JSON-content fallback and otherwise
throws a retryable `null-output` — a failed attempt, never a crash. Every other model keeps the pin
and gets neither instruction nor `strict`.

**langchain reads a `thinking` it never sends.** `ChatAnthropic` keeps a `thinking: disabled` field
default, off the wire unless set, but its client-side parameter check reads it: an Opus 5/5.5 call
at `xhigh`/`max` with no `thinking` set threw "thinking.type=disabled is not supported" locally,
before any request — not a 400, so retried to exhaustion. `build` and `refine` therefore set that
unsent field to `adaptive` on a model whose absent field means adaptive (`thinksByDefault`: the 5
family, not Opus 4.8/4.7); the wire is unchanged.

**Effort climbs on retries, one level per attempt of the rung** (`LlmRefineParams.rungAttempt`), from
the rung's declared level — or its model's default once it has retried — to the model's ceiling. So
each fallback starts from its OWN level. A `TemperatureFactory` request climbs it too
(`temperatureSteps`: one level per `TEMPERATURE_PER_EFFORT_STEP` = 0.3, at least one), because the
models that take effort have mostly taken sampling away and "hotter" alone changes nothing on the
wire. Effort is part of Anthropic's cached prefix, so a climbed retry writes a new cache entry.
At `high` and above the OpenAI plugin floors the output budget at `REASONING_MIN_MAX_TOKENS` (25k,
OpenAI's reasoning-guide reservation for reasoning + answer), clamped to the cap, like
`ADAPTIVE_MIN_MAX_TOKENS` below.

**OpenAI effort travels in `modelKwargs.reasoning`, never in the constructor's `reasoning` field.**
`@langchain/openai` (1.5.x) puts that field on the wire only for names it recognises as reasoning
models (`o*`, `gpt-5*`), so on `gpt-6-*` it was dropped from every request with no error — every
preset effort on an OpenAI rung was ignored. `modelKwargs` is spread verbatim into the Responses
body for every model, and langchain adds its own `reasoning` key only when the constructor field or a
call option is set, which the plugin never does, so the key goes out exactly once. `build` writes it
there and `refine` climbs it there (reading the declared level back from `modelKwargs`). Assert it on
the request body, `invocationParams()`, never on `lc_kwargs`. Verified live 2026-09-29 on
`gpt-6-luna`: `effort: low` → 179 reasoning tokens, `high` → 331, both echoed back in the response's
`reasoning`; `gpt-5.4-mini` still gets no effort.

**OpenAI hides property NAMES that look like keywords.** A non-strict `json_schema` response format
(the only one the plugin sends, `strict: false`) is rendered into the model's prompt with JSON-schema
keywords stripped by KEY, anywhere in the tree, a `properties` map included. A property named like one
of `OPENAI_HIDDEN_PROPERTY_NAMES` — `required`, `default`, `format`, `pattern`,
`additionalProperties`, `examples`, `deprecated`, `readOnly`, `writeOnly`, `minimum`, `maximum`,
`exclusiveMinimum`, `exclusiveMaximum`, `multipleOf`, `minLength`, `maxLength`, `minItems`,
`maxItems`, `uniqueItems`, `minProperties`, `maxProperties`, `allOf`, `not`, `if`, `then`, `else`,
`contains`, `propertyNames`, `patternProperties`, `dependentRequired`, `unevaluatedProperties`
(measured on `gpt-6-sol`/`gpt-6-luna`) — never reaches the model, is never answered, and fails
validation identically on every retry. `type`, `properties`, `items`, `enum`, `const`,
`description`, `title`, `nullable`, `anyOf`, `oneOf`, `$ref`, `$id`, `$defs`, `definitions`,
`prefixItems` and `discriminator` survive. The plugin's `schemaDefects` names each such property by
JSON pointer (only keys of a `properties` map — a keyword in keyword position is fine), and `invoke`
/ `request` throw `LlmMissconfiguredError` before the rung's first request; a misconfiguration is
fatal to every retry loop. Function calling (`structuredOutput: false`) and Anthropic's tool mode
keep every name and are not refused. Rename the field (`mandatory` for `required`). `strict: true`
is not sent to OpenAI: its strict mode also demands every property in `required`, which
`isStrictSchema` (Anthropic's subset) does not check.

### Reasoning is off unless a preset asks for it — and it is billed against the same budget

The models `NO_SAMPLING_PREFIXES` names think ADAPTIVELY unless the request says otherwise: an absent
`thinking` parameter means adaptive, and `@langchain/anthropic` forwards the parameter only when the
caller sets it (its own field default of `disabled` is never sent). Left on, the reasoning costs
twice — it is spent from `max_tokens`, the same allowance as the answer (a budget sized for the
answer alone goes entirely on reasoning and the completion arrives well-formed, `stop_reason:
"max_tokens"`, with no text block), and its SUMMARISED stream arrives in bursts minutes apart, which
the idle deadline reads as a dead connection and retries from scratch
(`llm:model:stream-stalled:no token for 180000ms (idle deadline)`).

**`ModelConfig.disableThinking` is the switch, and where it lands depends on the plugin.**
`makeLlmModel` appends the literal `/no_think` to every request's prepared messages whenever the flag
is set AND the plugin's `suppressesThinking(config)` does not answer `true` — the soft switch for
models with no request-level control (Qwen3). The Anthropic plugin answers `true` only for
`rejectsSampling(model)`, and for those puts the family's off switch (`thinkingOffFor`, the table
above) on the request in `build`, which `refine` carries through `lc_kwargs` on every attempt — on a
model that always thinks nothing is sent and the flag only keeps the directive out. Below that line
(`claude-haiku-4-5`, `claude-sonnet-4-6`) and under any plugin declaring no hook the flag injects
prompt text instead, so set it where the wire honours it. **A preset must set the flag on every
adaptive Anthropic rung**: a same-provider `fallback` inherits it from the rung above, a rung that
switches TO Anthropic inherits nothing and must name it (viable-agent's `presets.test.ts` walks every
rung). Turning reasoning ON is a per-role decision.

`ADAPTIVE_MIN_MAX_TOKENS` (32k) is the output floor the Anthropic plugin's `build` applies to every
`rejectsSampling(model)` config — `disableThinking` is not consulted, so a role with reasoning turned
off is floored just the same. It is a floor, not an override (a preset asking for more keeps it) and
it is clamped through `resolveOutputCap`, so it can never exceed what the provider accepts and turn a
retryable empty answer into a fatal 400. Raising or removing it re-opens empty completions.

Two diagnostics the above depends on:

- **An empty completion is a null result, not a filter rejection.** `ask` tests emptiness BEFORE the
  caller's filter — every shipped filter returns null only for empty input, so a filter run first
  blames the caller for a provider problem and skips `reportNull`, losing the `finishReason` and
  `outputTokens` that name the cause.
- **Anthropic's stop reason is not `finish_reason`.** langchain puts it in
  `additional_kwargs.stop_reason` and `response_metadata.finish_reason` does not exist there, so
  `null-report.ts` reads both; `thinkingOnly` marks a completion that was all reasoning.

OpenAI reasoning models get it handled by shrinking the reasoning cap on retry (`plugins/openai.ts`);
escalating `maxTokens` alone fixes neither family — the retry draws from an unchanged distribution.

**Every attempt is a fresh request over the caller's history.** A retry or a fallback rung re-sends
the same prepared messages; a failed attempt's reply is never appended. So the thinking-block
bindings of Opus 5.5, Sonnet 5.5 and Fable 5.1 (a block is read only by its own model, or a listed
successor; the API drops the rest, unbilled) cost nothing here. What they do bind is a CALLER that
carries assistant turns across `talk` calls: an edit before a replayed block (the system prompt, the
tools, an earlier message) is a 400 on accounts created on or after 2026-08-31, so such a
conversation stays append-only.

## Config precedence: a preset is a base, not a final word

`createModel` layers four sources, lowest first: `presetOf(base.preset)` < `base` < `presetOf(override.preset)` < `override`.

A `preset` is a BASE that its referent refines, so it sits UNDER the config naming it. Assign it last
and a role declaring `preset:` silently discards both its own fields and the caller's override — that
is how effort-tier token caps and `temperatureFactory`'s temperature disappear for preset-based
roles. An override naming a preset (how the execution layer delivers a `modelOverrides` string pin)
outranks the alias but yields to explicit override fields; resolution is ONE level deep, so a preset
meant to carry a model must name one.

## Resilience already handled — do not reimplement

Idle stream deadline · duplicate-final-chunk dedup · output-budget escalation · reasoning-cap shrink ·
adaptive-thinking budget floor · fallback chain across providers · effort climb per rung ·
reasoning budget floor · caller-seeded ladder position
(`escalation`) · schema coercion · JSON salvage from prose · `NullCapture` diagnostics · fatal-error
short-circuit · blank-content sanitization (whitespace-only text blocks are dropped before every call
— a blank block, e.g. an empty file read pasted into a prompt, is otherwise a fatal Anthropic 400;
blank tool results are stubbed to keep their `tool_use` pairing). Details: package `README.md`.

## Terminal failure observation

`LlmSpectator.error?({ action, error })` is a best-effort terminal observation hook. `makeLlmModel`
calls it once only after the entire retry ladder for `ask`, `talk`, `invoke`, or `request` has failed;
it never sees transient attempts and a failing observer never replaces the original error. Use it for
side-channel effects that must follow a confirmed stop (for example, a tenant notification), not for
retry control or persistence that the call itself depends on.

## Tests

`bun test ./tests` in the package; offline specs always run. `tests/results.spec.ts` holds GOLDEN
bytes of a composed prompt and of a model's sent messages recorded before the results block existed
— the proof that a call without a view is unchanged; never re-record them to make a change pass.
In `tests/model.spec.ts` the anthropic live
suite is gated on `ANTHROPIC_SECRET` and self-skips with a printed reason without it, and the OpenRouter
suite is disabled unconditionally: an aggregator on a separate account serving models no deployment runs,
whose `402 requires more credits` reads as a failure of the code under test. `anthropic-families.spec.ts`
pins the per-family wire (thinking switch, effort ceiling, `tool_choice`, `strict`, cache minimum,
the retry on a text-only reply) through `ChatAnthropic.invocationParams`; `structured-schema.spec.ts`
pins the refusal of a hidden property name before any request. `plugins.spec.ts` covers the
`Compatible` provider offline.

## Depends On

- `@owlmeans/llm-common` · `@owlmeans/context` · `@owlmeans/error` · `@owlmeans/basic-ids` · `ajv`
- `@anthropic-ai/sdk` — runtime, for the `BadRequestError` the fatal-error rules are written around
- peer `@langchain/core`, `@langchain/openai`, `@langchain/anthropic`

## Related

- [[llm-common]] — the serializable contracts · [[llm-prompt-caching]] — prompt composition, block
  order and the cache invariants
- [[owlmeans-context]] — service registration · [[error]] — the `ResilientError` family
