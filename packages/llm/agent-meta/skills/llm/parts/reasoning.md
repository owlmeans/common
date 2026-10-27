---
name: reasoning
description: Why reasoning is off unless a preset asks for it — disableThinking and where it lands per plugin, the adaptive output floor, empty-completion diagnostics, and fresh requests per attempt.
metadata:
  purposes: agent, config
  mentions: disableThinking, suppressesThinking, /no_think, ADAPTIVE_MIN_MAX_TOKENS, thinkingOffFor, thinkingOnly, stop_reason
---
<!-- AUTO-GENERATED — do not edit. Regenerate via sync-agent-meta. -->

# @owlmeans/llm — Reasoning control

## Reasoning is off unless a preset asks for it — and it is billed against the same budget

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
`anthropicSupportHelper.rejectsSampling(model)`, and for those puts the family's off switch (`anthropicSupportHelper.thinkingOffFor`, the
families table in the `presets` part) on the request in `build`, which `refine` carries through `lc_kwargs` on every attempt — on a
model that always thinks nothing is sent and the flag only keeps the directive out. Below that line
(`claude-haiku-4-5`, `claude-sonnet-4-6`) and under any plugin declaring no hook the flag injects
prompt text instead, so set it where the wire honours it. **A preset must set the flag on every
adaptive Anthropic rung**: a same-provider `fallback` inherits it from the rung above, a rung that
switches TO Anthropic inherits nothing and must name it (viable-agent's `presets.test.ts` walks every
rung). Turning reasoning ON is a per-role decision.

`ADAPTIVE_MIN_MAX_TOKENS` (32k) is the output floor the Anthropic plugin's `build` applies to every
`anthropicSupportHelper.rejectsSampling(model)` config — `disableThinking` is not consulted, so a role with reasoning turned
off is floored just the same. It is a floor, not an override (a preset asking for more keeps it) and
it is clamped through `configUtils.resolveOutputCap`, so it can never exceed what the provider accepts and turn a
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
