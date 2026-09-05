---
name: llm
description: How to use @owlmeans/llm — the LLM inference runtime (four-method model, provider plugins, model factory service, policy-driven execution abstraction, and the prompt/skill composition service). Auto-invoked when importing the model, an LlmPlugin, the LlmService, the execution service, or the prompt service.
user-invocable: false
---

# @owlmeans/llm

**Layer:** Core
**Install:** `"@owlmeans/llm": "^0.1.18-rc.12"` in `dependencies` (plus the `@langchain/*` peers)

The inference runtime. Everything provider-specific is a **plugin**; the model itself only owns the
provider-independent parts (streaming discipline, retries, validation, observability). Serializable
contracts live in `@owlmeans/llm-common`. `src/helpers/` is exported — functions a **consumer** may
use alongside a model; `src/utils/` is internal and **never exported** (a spec that needs one imports
it from `../src/utils/…`). Decide the side before placing a function, and never export a `utils/`
symbol "because a test needs it".

## Key Exports

| Export | Description |
|--------|-------------|
| `makeLlmModel({ model, purpose, prompt?, prompts?, files?, utility?, retries?, … }, spectator)` | The four-method model: `ask` / `talk` / `invoke(input, schema, opts)` / `request`. `model` is an already-resolved `BaseChatModel`. |
| `makeLlmService(options, alias?)` · `appendLlmService(ctx, options, alias?)` · `llmServiceApi(options, self)` | Model factory/registry — `makeLlmService({ models: () => configs }).getModel(alias, override?)` resolves a `ModelConfig` by alias, memoized per alias+override. The `…Api` half omits `createService`, to compose into your own service (role accessors, domain helpers). |
| `makeExecutionService(alias?, options?)` · `appendExecutionService(ctx, alias?, options?)` · `executionServiceApi(options, self)` | Frozen 3-level executions + policy resolution + snapshot/restore/checkpoint + advice, and the same composable half. |
| `makePromptService(options?, alias?)` · `appendPromptService(ctx, options?, alias?)` · `promptServiceApi(options, self)` | Skill registry + the composition plugin chain. Also at `@owlmeans/llm/prompt`. |
| `rolePlugin`, `skillsPlugin`, `contextPlugin`, `BUILT_IN_PROMPT_PLUGINS` | The built-in composition plugins. |
| `PromptContext.claim(key)` · `PromptComposeParams.utility` | Per-composition ownership of a key; a cheap model for one plugin-side call. |
| `renderSkill`, `sortSkills`, `joinChunks`, `compareAlias`, `prefixHash` · `readCacheUsage`, `hasCacheActivity` | Deterministic rendering primitives — reuse them, never re-implement — and normalized prompt-cache accounting from a completion. |
| `plugins`, `registerLlmPlugin`, `resolvePlugin`, `pluginOf`, `pluginFor` | The provider-plugin registry. Also at `@owlmeans/llm/plugins`. |
| `anthropicPlugin`, `openAiPlugin`, `compatiblePlugin`, `openAiFamily` | Built-in providers; `openAiFamily` is the shared OpenAI-client behaviour to spread into a new plugin. |
| `NO_SAMPLING_PREFIXES` / `rejectsSampling(model)` · `RESPONSES_API_PREFIXES` / `usesResponsesApi(model)` | Which families reject which sampling parameters — see the table below. Consumers pin presets against them. |
| `withRetry`, `registerFatalError`, `isFatalError`, `spectate`, `normalizeInput`, `parseJsonContent`, `coerceToSchema` | Helpers usable alongside a model. Also at `@owlmeans/llm/helpers`. |
| `LlmError`, `LlmModelError`, `LlmMissconfiguredError`, `LlmPluginError`, `LlmRetryExceededError` | `ResilientError` family. `LlmModelError` is the RETRYABLE one. |
| `mergePrompt`, `mergePolicy`, `resolveRole`, `effortPatch` | Execution merge helpers; `mergePrompt` unions skills and takes the deepest role. |
| `DEFAULT_MODEL_RETRIES`, `MODEL_STREAM_TIMEOUT_MS` (3 min idle), `FALLBACK_AFTER_ATTEMPTS`, `DEFAULT_EFFORT`, `EFFORT_TABLE`, `MAX_CACHE_BREAKPOINTS`, `MAX_SYSTEM_BREAKPOINTS`, `MIN_CACHEABLE_TOKENS`, `LLM_SERVICE`, `EXECUTION_SERVICE`, `PROMPT_SERVICE` | Tuning + aliases. |

## Provider differences are plugins, never `if`s

`LlmPlugin` is the single seam: an `instanceof ChatAnthropic` or `config.provider === …` in `model.ts` or `service.ts` belongs on the plugin.

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
| OpenAI Responses API (`gpt-5*`, `codex-*`) | `temperature`, `top_p` | `RESPONSES_API_PREFIXES` / `usesResponsesApi(model)` |

Models below those lines keep the deterministic `temperature: 0` default. Each `refine` re-derives
the family from the ACTIVE base instance it is handed — Anthropic from `modelName ?? model`, OpenAI
from `model ?? lc_kwargs.model` plus a `useResponsesApi` already on `lc_kwargs` — so a same-family
`fallback` rung is judged on its own id, not the primary's. Keep the predicate exported: consumers
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

### The plugin seam has two hooks, dispatched independently

`ExecutionPlugin` carries `onCheckpoint`/`onRestore` (persist and resume an `ExecutionState`) and
`advise` (answer a performer's question about the project it works in —
`ExecutionService.advise(exec, request)`, first usable answer wins, a throwing plugin is skipped,
`null` when nobody answers).
Advice is advisory by contract: a caller appends whatever comes back and proceeds unchanged on
`null`. `checkpoint` dispatches on plugins declaring **`onCheckpoint`**, not on the plugin count, or
an advise-only plugin would silently start composing snapshots nobody consumes.

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
`retries - 1`, moves the STARTING rung only, and never changes how many attempts the call makes. Two
things it depends on, both preset data rather than code: the role must declare a `fallback`, and that
fallback must be in the same plugin `family` (a cross-family one is skipped with a warning, because
switching provider mid-call flips the structured-output shape). `LlmCallOptions.fatal` is the lever
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
`contextWindow`/`maxOutput`** (and reset `combinedWindow`): the fallback config is
`{...primaryConfig, ...fallback}`, so every field the patch does not name is inherited from a
different model.

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
`rejectsSampling(model)`, and for those puts `thinking: { type: 'disabled' }` on the request in
`build`, which `refine` carries through `lc_kwargs` on every attempt. Below that line
(`claude-haiku-4-5`, `claude-sonnet-4-6`) and under any plugin declaring no hook the flag injects
prompt text instead, so set it where the wire honours it. **A preset must set the flag on every
adaptive Anthropic role**; it reaches the `fallback` rung only by inheritance from the entry
(viable-agent's `presets.test.ts` pins this). Turning reasoning ON is a per-role decision.

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
adaptive-thinking budget floor · same-family fallback model · caller-seeded ladder position
(`escalation`) · schema coercion · JSON salvage from prose · `NullCapture` diagnostics · fatal-error
short-circuit · blank-content sanitization (whitespace-only text blocks are dropped before every call
— a blank block, e.g. an empty file read pasted into a prompt, is otherwise a fatal Anthropic 400;
blank tool results are stubbed to keep their `tool_use` pairing). Details: package `README.md`.

## Tests

`bun test ./tests` in the package; offline specs always run. In `tests/model.spec.ts` the anthropic live
suite is gated on `ANTHROPIC_SECRET` and self-skips with a printed reason without it, and the OpenRouter
suite is disabled unconditionally: an aggregator on a separate account serving models no deployment runs,
whose `402 requires more credits` reads as a failure of the code under test. `plugins.spec.ts` covers the
`Compatible` provider offline.

## Depends On

- `@owlmeans/llm-common` · `@owlmeans/context` · `@owlmeans/error` · `@owlmeans/basic-ids` · `ajv`
- `@anthropic-ai/sdk` — runtime, for the `BadRequestError` the fatal-error rules are written around
- peer `@langchain/core`, `@langchain/openai`, `@langchain/anthropic`

## Related

- [[llm-common]] — the serializable contracts · [[llm-prompt-caching]] — prompt composition, block
  order and the cache invariants
- [[context]] — service registration · [[error]] — the `ResilientError` family
