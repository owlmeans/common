---
name: presets
description: Model configuration — output caps, fallback chains across providers, provider effort tables, the per-family Anthropic and OpenAI wire facts, and preset precedence.
metadata:
  purposes: agent, config
  mentions: ModelConfig, maxTokensCap, maxOutput, contextWindow, resolveFallbacks, PROVIDER_NEUTRAL_FIELDS, ModelEffort, OPENAI_EFFORT_SUPPORT, ANTHROPIC_MODEL_SUPPORT, anthropicSupportHelper, OPENAI_HIDDEN_PROPERTY_NAMES, REASONING_MIN_MAX_TOKENS, presetOf
---
<!-- AUTO-GENERATED — do not edit. Regenerate via sync-agent-meta. -->

# @owlmeans/llm — Output caps, fallbacks and provider effort

## Output caps: what the deployment wants vs what the provider allows

Four fields, and conflating them turns an escalation into a fatal 400 hours into a run:

| Field | Means |
|---|---|
| `maxTokens` | the budget asked for on the FIRST attempt |
| `maxTokensCap` | the ceiling the deployment budgets for the escalator |
| `maxOutput` | what the PROVIDER accepts in one request — a fact about the model |
| `contextWindow` | total window (input + output); informational, never sent |

`configUtils.resolveOutputCap` (`utils/config.ts`) reconciles them: the declared cap chooses the ceiling and the
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
the rung's `family` or cache dialect (`cacheDialect`) differs from the last one prepared (cache
markers, cache mode and the thinking switch are provider dialect; each preparation starts again
from copies of the caller's messages). Keying anything on the PRIMARY's plugin reintroduces the old single-family
bug: another provider's rung asked in the primary's `tool_choice` spelling is a fatal 400.

**`ModelConfig.effort` (`ModelEffort`, `@owlmeans/llm-common`) is the provider's own knob** —
OpenAI `reasoning.effort`, Anthropic `output_config.effort` — and not `ExecutionEffort`, which is
this package's token-budget tier. Plugin tables are the authority (`OPENAI_EFFORT_SUPPORT` verified
2026-09-23 against developers.openai.com/api/docs/models/*; `ANTHROPIC_MODEL_SUPPORT` verified
2026-10-08 against platform.claude.com/docs/en/models/{sonnet-5-5,opus-5-5,fable-5-1,haiku-5-5}/* and
build-with-claude/{effort,prompt-caching}):

| Model | Levels | Default |
|---|---|---|
| `gpt-6-sol`, `gpt-6-luna` | none, low, medium, high, xhigh, max | medium |
| `gpt-6-astra` | low … max (`none` is a 400) | medium |
| `gpt-5*` and older OpenAI | not sent — accepted sets vary per snapshot | — |
| Claude Opus 5.5, Haiku 5.5 | low … max | medium |
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
| Opus 5, Haiku 5.5 | `disabled` | low … high (`thinkingOffCeiling`) | accepted | 512 |
| Sonnet 5, Opus 4.8/4.7 | `disabled` | all | accepted | 1024 |
| Older models (Haiku 4.5, Sonnet 4.6, …) | none — they reason only when asked | per the effort table | accepted | 1024 |

Haiku 5.5 (`claude-haiku-5-5`, no dated snapshot) is a 5-family model: no `temperature`/`top_p`/`top_k`
(`NO_SAMPLING_PREFIXES` has `claude-haiku-5`), no assistant prefill, adaptive thinking on by default,
1M window and 128K output; Haiku 4.5 is unchanged and unlisted.

`anthropicSupportHelper.thinkingOffFor(config)` is the value `build` sends; `refine` carries it through `lc_kwargs` and
reads it back to keep the ceiling, so a climbed retry stops at `high` instead of answering 400. The
cache minimum is the default under a preset's own `cacheMinTokens`.

**Structured output on a model that refuses a pinned tool** (`anthropicSupportHelper.rejectsForcedTool`): `toolChoice`
answers `{ type: 'auto' }`, `pinsTool` answers `false`, and `prepare` appends
`toolCallInstruction(toolName)` to the per-call payload after the JSON mention — the prompt is all
that asks for the call. The tool goes `strict: true` only when `schemaUtils.isStrictSchema(schema)` (every object
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
(`effortUtils.temperatureSteps`: one level per `TEMPERATURE_PER_EFFORT_STEP` = 0.3, at least one), because the
models that take effort have mostly taken sampling away and "hotter" alone changes nothing on the
wire. Effort is part of Anthropic's cached prefix, so a climbed retry writes a new cache entry.
At `high` and above the OpenAI plugin floors the output budget at `REASONING_MIN_MAX_TOKENS` (25k,
OpenAI's reasoning-guide reservation for reasoning + answer), clamped to the cap, like
`ADAPTIVE_MIN_MAX_TOKENS` (the `reasoning` part).

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
`schemaUtils.isStrictSchema` (Anthropic's subset) does not check.

## Config precedence: a preset is a base, not a final word

`createModel` layers four sources, lowest first: `presetOf(base.preset)` < `base` < `presetOf(override.preset)` < `override`.

A `preset` is a BASE that its referent refines, so it sits UNDER the config naming it. Assign it last
and a role declaring `preset:` silently discards both its own fields and the caller's override — that
is how effort-tier token caps and `temperatureFactory`'s temperature disappear for preset-based
roles. An override naming a preset (how the execution layer delivers a `modelOverrides` string pin)
outranks the alias but yields to explicit override fields; resolution is ONE level deep, so a preset
meant to carry a model must name one.
