---
name: caching-providers
description: How the Anthropic and OpenAI plugins mark a prepared request and a tool-loop round — cache_control with per-region lifetimes, OpenAI explicit mode on the Responses API, implicit caching with prompt_cache_key — and the provider facts behind them.
metadata:
  purposes: agent, config
  mentions: patchPrompt, loopCache, cacheDialect, CacheDialect, CacheBoundary, PromptPlan, PromptPatch, LlmLoopCacheHints, cache_control, prompt_cache_breakpoint, promptCacheOptions, OPENAI_EXPLICIT_CACHE_PREFIXES, cacheMode, prompt_cache_key
---
<!-- AUTO-GENERATED — do not edit. Regenerate via sync-agent-meta. -->

# Prompt caching — Providers

## The plugin hooks

| Hook | Does |
|---|---|
| `patchPrompt(plan)` | Marks a `PromptPlan` (`messages`, the system's composed `blocks`, candidate `boundaries`, `budget`) in the provider's dialect and returns `PromptPatch { messages, options?, placed }`. Never edits the plan's messages. Omitted: the request goes out as plain strings. |
| `loopCache(messages, model, hints?)` | Marks one round of a tool loop on copies, after stripping every marker. `LlmLoopCacheHints { system?, project?, ttl? }`. Called with the UNBOUND model. |
| `cacheDialect(config)` | `CacheDialect.Anthropic`, `Explicit` or `Implicit`; a rung in another dialect is prepared again. |

The provider-neutral half — a system message's boundaries, the loop opening, selection under the
minimum and the budget, cutting the system into segments — is shared, so a plugin supplies only how
a block and a message are marked. The system message stays one string until a boundary inside it is
chosen; then it goes out as text blocks cut after `Role` + `Skills` and after `Packages`, each
segment's last block carrying the marker. A system sent as a `JSON.stringify`d block array is text
the model reads and a prefix nothing shares — never build one.

## Anthropic — `cache_control`

- Models whose id starts with `claude-`. The marker is `{ type: 'ephemeral' }` for 5 minutes —
  the `ttl` key is left out so the bytes match an entry written without it — and
  `{ type: 'ephemeral', ttl: '1h' }` for an hour.
- `patchPrompt`: BP1 and BP2 inside the system, BP3 on the project message, BP4 on the last stable
  lead message. A message takes a marker on its last block only when that block can carry one
  (text, image, document, file, `tool_use`, `tool_result`) — never a thinking block or blank text.
- The minimum is per model: `ANTHROPIC_MODEL_SUPPORT[].cacheMinTokens` (512 on the 5 family), else
  1024. A preset pinning an older model with a higher minimum raises `cacheMinTokens`, or its
  markers silently write nothing.
- `loopCache`: at most **3 explicit** markers, all on the opening — the system's persona and
  packages boundaries and the project message (an uncomposed system message is marked whole) —
  never on the last message; plus the top-level automatic `cache_control: { type: 'ephemeral' }`
  call option. That one lands on the last cacheable block of each request, so it moves forward
  round by round and every round reads back the one before. It spends the fourth slot.
- Facts ([prompt caching](https://platform.claude.com/docs/en/build-with-claude/prompt-caching.md)):
  render order `tools` → `system` → `messages`; at most 4 `cache_control` per request; the minimum
  prefix depends on the model and is not monotonic across generations; a write costs about 1.25×
  input at 5 minutes and 2× at 1 hour; longer-lived entries must come before shorter-lived ones;
  changing `system` invalidates system and messages but not `tools`; a breakpoint looks back at
  most 20 content blocks. Usage reports `cache_creation.ephemeral_5m_input_tokens` and
  `ephemeral_1h_input_tokens`; `withCacheTiers` carries the 1-hour count into the usage.

## OpenAI explicit mode — `prompt_cache_breakpoint`

- Only `openAiPlugin` (never `openAiFamily`: a custom `ChatOpenAI` plugin opts in on its own), and
  only for a model on the Responses API (`usesResponsesApi`) whose id starts with an
  `OPENAI_EXPLICIT_CACHE_PREFIXES` entry (`gpt-6`, `gpt-5.6`). `ModelConfig.cacheMode: 'explicit' |
  'implicit'` overrides the list per preset — still only on the Responses API.
- A breakpoint is `prompt_cache_breakpoint: { mode: 'explicit' }` on a text or input block of a
  system, developer or user message; a string is lifted to a text block only on a message that
  takes one. **Never on an assistant message** — the converter drops it there — so a message
  boundary moves back to the nearest message that keeps one, never onto or before the boundary in
  front of it.
- Every tool output is rewritten on the copy as `[{ type: 'input_text', text }]`, marked or not, so
  a prefix renders the same whether this request marks it or the next one does.
- The request asks for explicit mode (`promptCacheOptions: { mode: 'explicit' }`) **only when a
  breakpoint was placed** — explicit mode with none caches nothing. Only the marked spans are
  written, and the tail is billed once at the input rate. No lifetime is sent; `cacheTtl` does not
  apply.
- `loopCache`: the system at its boundaries, the previous round's last input (read back now) and
  this round's last input (read back next round, and it may be the final message); at most 4,
  dropping the project boundary first, then packages.

## Implicit caching and `compatible`

Every other OpenAI model caches automatically by prefix from 1024 tokens, in 128-token steps;
nothing is marked and only the order of the bytes counts
([prompt caching](https://developers.openai.com/api/docs/guides/prompt-caching)). Requests are
routed by a hash of roughly the first 256 tokens mixed with `prompt_cache_key`, which the `openai`
plugin sets from `ModelConfig.cacheKey ?? alias` — stable and low-cardinality, one value per role.
`compatible` gets neither markers nor `prompt_cache_key`: aggregators running with
`provider.require_parameters` can drop every serving provider over an unknown field.
