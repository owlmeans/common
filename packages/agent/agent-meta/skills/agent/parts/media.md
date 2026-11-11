---
name: media
description: Images and PDFs in an agent run — the opening that carries mediaHelper parts, the rung that answers it (a blind primary hands the run to a seeing fallback), refusal before any request, per-round rendering ahead of the cache marks, redacted traces, and why a tool result is always text.
metadata:
  purposes: agent
  mentions: mediaHelper, LlmMediaUnsupportedError, LlmMediaLimitError, capabilityHelper, vision, documents
---
<!-- AUTO-GENERATED — do not edit. Regenerate via sync-agent-meta. -->

# @owlmeans/agent — Images and PDFs in a run

## The opening carries them

Media enters a run through the opening only: `invoke(new HumanMessage({ content: [mediaHelper.text('…'),
mediaHelper.image(bytes, 'image/png'), mediaHelper.document(pdf, { name })] }))`. The parts are
`@owlmeans/llm`'s checked, provider-neutral blocks ([[llm]], `media` part); context, inbox turns,
the stop instruction and tool results are text. `AgentRun.prompt` is the opening's text parts.

## The rung that answers it

`ModelConfig.vision` / `documents` decide, rung by rung, exactly as for `makeLlmModel`: a run whose
opening carries an image (a PDF) is answered by the first rung of the model's ladder that accepts
it — the primary when it does, otherwise the first fallback that does, on any provider. That rung
is the run's model for every round: tools are bound to it, its provider plugin marks the rounds
(`AgentOptions.provider` applies to the primary only), media is spelled for it, and its id goes to
`spectate`. A run without media is the primary's. Ask before building such a run with
`executions.capabilities(helper)` or `capabilityHelper.of(model)` — `vision: true` there means some
rung of the ladder will answer it.

No rung accepts the media → `LlmMediaUnsupportedError`; a request over the rung provider's limits
(Anthropic: 100 images) → `LlmMediaLimitError`. Both are thrown by `invoke` **before the run
starts**: no plugin contributes or finishes, no prompt side call is made, nothing is traced, no
request leaves. They are fatal in `retryHelper`; retrying the same run cannot change them.

## Every round is rendered, then marked

Each round's wire `[system, project message, opening + Tail, …rounds]` goes through
`mediaHelper.render(messages, answeringModel)` — copies, every neutral part in the provider's own
spelling (Anthropic `image` / `document` with a base64 `source`; chat completions `image_url` /
`file`; Responses `input_image` / `input_file`), checked against the request limits — and only then
through the plugin's `loopCache`. So a cache marker that closes a message ending in an image lands on
the provider's block (OpenAI explicit mode marks the opening's `input_image` as the round's last
input), and the opening and its media are read back from cache round after round. The transcript,
`onTurn` and `result.messages` keep the neutral parts as the caller sent them.

Only parts built by `mediaHelper` (langchain standard blocks) are counted when choosing the rung; a
block spelled by hand in a provider's dialect is passed through and held only to the limits.

## Traces carry placeholders

`spectate` receives the transcript with the neutral parts; `spectate(spectator, callType)` from
`@owlmeans/llm` stores each binary part as `{ type, mime, bytes, sha256 }`, never the payload. A
custom `AgentSpectateHook` that records content calls `mediaHelper.redact(content)` itself.
Compaction (`compactionHelper.messageText`, `renderTranscript`) reads text parts only.

## A tool result is text

A tool cannot hand the model an image. Its output becomes the `ToolMessage` text — a string as is,
anything else JSON — and a binary part in what it returned (a media part, or an array of content
parts) is replaced by its placeholder first, so base64 never reaches the model as text. A tool that
needs a model to SEE something (a screenshot, an uploaded file) makes its own media call —
`llmModel.ask([new HumanMessage({ content: [mediaHelper.text(question), mediaHelper.image(…)] })])`
on a role whose `capabilities().vision` is true — and returns what that model said.
