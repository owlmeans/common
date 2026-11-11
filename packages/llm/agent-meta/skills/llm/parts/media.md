---
name: media
description: Images and PDFs in model calls — the vision/documents capability flags and who answers a media call, the checked provider-neutral parts mediaHelper builds, each provider plugin's wire spelling, the documented size and count limits, and traces that never carry a payload.
metadata:
  purposes: agent, data, config
  mentions: mediaHelper, createMediaHelper, ImagePart, DocumentPart, MediaPart, capabilityHelper, ladder, ModelCapabilities, LlmMediaTypeError, LlmMediaLimitError, LlmMediaUnsupportedError, MEDIA_LIMITS, ANTHROPIC_MEDIA_LIMITS, OPENAI_MEDIA_LIMITS, OpenAiMediaDialect, mediaDialect, mediaLimits
---
<!-- AUTO-GENERATED — do not edit. Regenerate via sync-agent-meta. -->

# @owlmeans/llm — Media and model capabilities

## A model accepts media only when its config says so

`ModelConfig.vision` (png, jpeg, gif, webp) and `ModelConfig.documents` (PDF) — also on
`ModelConfigPatch`, so a `modelOverrides` pin can carry them — are facts about the model, declared
by the consumer's presets. **Unset means no.** A same-provider `fallback` inherits them, so a
fallback that changes `model` restates them (like `maxOutput`); one on another provider never
inherits them.

Ask before you build a media call — the answer is `ModelCapabilities { vision, documents, rungs }`
(`@owlmeans/llm-common`), `rungs[0]` the primary:

| Holding | Ask |
|---|---|
| a helper execution | `executions.capabilities(helper)` — its own resolved `model` |
| any execution and a role | `executions.capabilities(exec, role, override?)` — the same ladder as `model()`: roleOverrides → modelOverrides → effort tier |
| a four-method model | `llmModel.capabilities()` |
| an alias | `llm.capabilities(alias, override?)` — presets and fallbacks resolved, no client built |
| a `BaseChatModel` / configs | `capabilityHelper.of(model)` · `fromConfigs(resolveFallbacks(config))` · `accepts(caps, needs)` |
| the models themselves | `capabilityHelper.ladder(model)` — the fallback chain, position `i` = `rungs[i]` (a loop that picks its own rung) |

`vision` is true when at least one rung accepts images, because `makeLlmModel` sends a call that
carries images (documents) **only to the rungs that accept them**: the ladder is filtered per
call, so a fallback without the capability never receives media, and a blind primary is skipped
straight to a seeing fallback. When no rung accepts, the call throws `LlmMediaUnsupportedError`
before any request. Every `LlmMedia*Error` is fatal in `retryHelper`. A delegated model
(`@owlmeans/llm-delegate`) declares neither flag, and its `toDelegated` flattens content to text,
dropping image and document parts — so a media call is refused before it could reach one.

## Parts are built from bytes and checked first

`mediaHelper.image(data, mime)`, `mediaHelper.document(data, { mime?, name? })` and
`mediaHelper.text(text)` take bytes, an `ArrayBuffer`, base64 or a `data:` URL and return
langchain's standard blocks (`{ type: 'image' | 'file', mimeType, data, metadata }`), open-typed so
they sit in any message's `content`. Before a part exists: the type is in the accepted list
(`image/jpg` reads as jpeg), the bytes' own signature matches it, the size and (from the header)
the longest side are within the limits. A refusal is `LlmMediaTypeError` or `LlmMediaLimitError`
(`limit`, `actual`); nothing is resized or converted. `createMediaHelper(limits)` narrows the
limits for a deployment and never widens them.

| Limit (`MEDIA_LIMITS`, raw bytes) | Value | Source |
|---|---|---|
| image | 7 500 000 (10 MB base64) | Anthropic API; OpenAI states none per image |
| image side | 8000 px | Anthropic |
| PDF | 50 000 000 | OpenAI (per file and per request); Anthropic allows a 128 MB request |

Per request, the rung's plugin adds `mediaLimits(config)`: Anthropic 100 images (600 when the
preset's `contextWindow` is above 200k) and 96 000 000 raw bytes (a 128 MB base64 request); OpenAI
1500 images, 50 000 000 bytes of PDFs and 384 000 000 raw bytes (a 512 MB payload). A prepared
request over one never leaves (`LlmMediaLimitError`); an image a caller spelled by hand is held to
the accepted types and per-part sizes too.

## Each provider gets its own spelling

`prepare` rewrites every neutral part on its copies through the rung plugin's `media(part, config)`
right after normalizing, before any cache marker is placed — so a marker lands on the provider's
own block (both markable lists include image and file blocks). Verified against the installed
`@langchain/core` 1.3.1, `@langchain/openai` 1.8.0 and `@langchain/anthropic` 1.6.0:

| Plugin | Image | PDF |
|---|---|---|
| `anthropic` | `{ type: 'image', source: { type: 'base64', media_type, data } }` | `{ type: 'document', source: { type: 'base64', media_type: 'application/pdf', data }, title }` |
| `openai`, chat completions | `{ type: 'image_url', image_url: { url: 'data:…' } }` | `{ type: 'file', file: { filename, file_data: 'data:…' } }` |
| `openai`, Responses API | `image_url` (the converter sends `input_image`) | `{ type: 'input_file', filename, file_data: 'data:…' }` |
| `compatible` | chat spelling (`openAiFamily.media`) | chat spelling |

- The Responses converter silently DROPS a chat `file` block, and chat completions forwards an
  `input_file` it does not know into a 400 — so `openAiPlugin` spells a PDF per API and declares
  `mediaDialect` (`OpenAiMediaDialect`); a rung in another media dialect is prepared again (the
  preparation key is family | cache dialect | media dialect).
- Never build langchain's deprecated data blocks (`source_type: 'base64'`): the Anthropic converter
  converts one AND forwards it again under the default `image/jpeg` — two images, one mislabelled.
- A caller that streams a model itself (a tool loop) spells its copies with
  `mediaHelper.render(messages, model)` (unbound model), every round, before its cache marks —
  `@owlmeans/agent`'s loop does exactly that.
- Media in the final message goes out unmarked, like the rest of the per-call payload; a stable
  lead message ending in an image carries its marker on the image block.

## Traces never carry a payload

`spectate` (content and `raw`) and the null-result capture (`NullCapture.request.messages`,
`response.content`) store every binary part — any provider's spelling, nested tool results
included — as `MediaPlaceholder { type, mime, bytes, sha256 }` (digest of the decoded payload). A
message without a payload is traced byte-identically to before. Anything else that records message
content calls `mediaHelper.redact(content)`, which returns the same reference when there is
nothing to replace. Text measures (`messageUtils.contentLength`, the cache minimum) count text
only, so a boundary closing on media alone may fall under the minimum and be skipped.

## External docs

- https://platform.claude.com/docs/en/build-with-claude/vision — jpeg/png/gif/webp; 10 MB base64 per image on the API (5 MB on Bedrock); 8000×8000 px; 100 images per request on 200k-window models, 600 otherwise; 128 MB request; `{ type: 'image', source: { type: 'base64', media_type, data } }` (2026-11)
- https://platform.claude.com/docs/en/build-with-claude/pdf-support — 128 MB request, 600 pages (100 under a 1M window); `{ type: 'document', source: { type: 'base64', media_type: 'application/pdf', data } }`, `title`, `cache_control` on the block (2026-11)
- https://developers.openai.com/api/docs/guides/images-vision — png/jpeg/webp/non-animated gif; 512 MB payload; 1500 images per request; `{ type: 'input_image', image_url: 'data:…', detail }` (2026-11)
- https://developers.openai.com/api/docs/guides/file-inputs — each file under 50 MB, 50 MB per request together; `{ type: 'input_file', filename, file_data: 'data:application/pdf;base64,…' }`; chat completions takes PDFs as `file` parts (`file.file_data`, `file.filename` in the SDK types) (2026-11)
