---
name: testing
description: Unit tests of agents and pipelines with a scripted model double and files kept in deps.
metadata:
  purposes: test
  mentions: FakeStreamingChatModel, OPENAI_SECRET, ANTHROPIC_SECRET, media.spec.ts, media-live.spec.ts
---
<!-- AUTO-GENERATED — do not edit. Regenerate via sync-agent-meta. -->

# @owlmeans/agent — Testing

## Testing

Category A (unit, no env, no network). The model is doubled with a small scripted object in
`tests/_tools/model.ts` because `@langchain/core`'s own `FakeStreamingChatModel` always replays its
first response and so cannot drive a tool loop. That double stands in for the MODEL, an external
boundary — never for an `@owlmeans/*` package. A turn's `before` runs while that turn answers (a
person pressing stop or writing to the inbox mid-call), `error` fails the call, and `bound()` tells,
per ask, which tools the asking view was bound with. A stop is a plain `AbortController` the test
aborts from a step, a tool or a turn's `before`. The cumulative-results specs keep the project as a
`Map` of files in `deps` — the durable input extractors read — so a "new process" is a new plugin
over the same files.

`media.spec.ts` drives REAL clients the llm service builds through a recording transport
(`tests/_tools/wire.ts`: `llmTransportRegistry` fetches answering scripted chat-completions or
Messages-API streams, or a 400): the provider spelling on every round (chat completions, Anthropic,
Responses explicit mode with its breakpoint on `input_image`), the cache marks, refusals before any
request (no `vision`, no `documents`, over the limit), a blind primary handing the run to a seeing
fallback on another provider, placeholders on the spectator path and placeholder-only tool results.
Anthropic's converter spells standard blocks by itself, so only an OpenAI case proves the loop
renders. `media-live.spec.ts` (gates `anthropic`, `openai` from the repo-root `.env` via
`@owlmeans/test`) runs one tiny-image turn per provider on a cheap vision model.
