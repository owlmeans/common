---
name: testing
description: The package's offline and gated specs, the golden prompt bytes, and the stream fixtures.
metadata:
  purposes: test
  mentions: ANTHROPIC_SECRET, results.spec.ts, model.spec.ts, anthropic-families.spec.ts, stream-sdk.spec.ts
---

# @owlmeans/llm — Tests

## Tests

`bun test ./tests` in the package; offline specs always run. `tests/results.spec.ts` holds GOLDEN
bytes of the prompt layout — system (role, skills, packages), project message (header, results,
context), the caller's turn — recorded when the layout was introduced; one byte of drift invalidates
every cached prefix, so never re-record them to make a change pass. `prompt.spec.ts` pins the
regions, the Tail, the empty-system fallback and the lifetime resolution.
In `tests/model.spec.ts` the anthropic live
suite is gated on `ANTHROPIC_SECRET` and self-skips with a printed reason without it, and the OpenRouter
suite is disabled unconditionally: an aggregator on a separate account serving models no deployment runs,
whose `402 requires more credits` reads as a failure of the code under test. `anthropic-families.spec.ts`
pins the per-family wire (thinking switch, effort ceiling, `tool_choice`, `strict`, cache minimum,
the retry on a text-only reply) through `ChatAnthropic.invocationParams`; `structured-schema.spec.ts`
pins the refusal of a hidden property name before any request. `plugins.spec.ts` covers the
`Compatible` provider offline and the cache dialects: `patchPrompt` on both providers (lifetime
order, cumulative minimums, budget, OpenAI blocks and tool `input_text`, nothing on `compatible`),
marker stripping, `loopCache`, and a fallback in another dialect prepared again.

`transport.spec.ts` pins the transport seam over real clients built by the plugins — a fetch handed to the OpenAI Responses, chat-completions, Anthropic and compatible clients, its survival across `refine` and `bindTools`, and `detach` — with a recording fetch that answers 400 (no layer retries it).

`internals.spec.ts` covers the usage drain after `finish_reason`, `appendTail`, abort-insensitive stream creation, reads and cleanup, observed late
failures, ignored late values, consumer cancellation and active streams exceeding multiple idle
windows. `bun test ./tests/stream-sdk.spec.ts` exercises actual ChatOpenAI Responses against local
HTTP fixtures: missing headers, open headers without SSE, and a productive SSE control. It checks
socket cancellation and absence of late callbacks without spending provider tokens.
