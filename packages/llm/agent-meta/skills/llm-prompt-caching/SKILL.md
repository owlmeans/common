---
name: llm-prompt-caching
description: How the OwlMeans LLM layer lays a request out for the prompt cache — the system, project-message and tail regions, the four cache boundaries, per-region lifetimes, the stable/cacheMax/focus/schemaPlacement call options, tool-loop caching, the determinism invariants, and how to verify reads. Auto-invoked when touching prompt composition, skills, LlmPromptPlugin, the Results, Context or Tail blocks, patchPrompt/loopCache, cache TTLs, or anything that changes what a request sends before its first per-call byte.
user-invocable: false
---
<!-- AUTO-GENERATED — do not edit. Regenerate via sync-agent-meta. -->

# Prompt composition and caching

**Layer:** Core · **Packages:** `@owlmeans/llm` (`./prompt`), `@owlmeans/llm-common`, `@owlmeans/agent`, `@owlmeans/agent-skills` (`./llm`)

A prompt cache is an **exact prefix match**: the bytes many calls share come first and stay
identical down to the whitespace. The regions, boundaries and determinism rules below ARE the cache.

## The layout

`PromptService.compose()` renders the blocks (`PROMPT_BLOCK_ORDER`) and returns them per region
(`PROMPT_REGIONS`) as plain strings — `PromptResult { system, project, tail, blocks, cache }`. The
provider plugin marks them later, once `makeLlmModel` holds the whole request.

| # | Region on the wire | Blocks (plugin) | Stable for | Boundary |
|---|---|---|---|---|
| 1 | System message | `Role` (`rolePlugin`), `Skills` (`skillsPlugin`) | a persona | BP1 `skills` |
| 2 | System message | `Packages` (`owlmeansPackagesPlugin`) | a persona on one story | BP2 `packages` |
| 3 | Project message — a user turn right after the system, opened by `PROJECT_CONTEXT_HEADER` | `Results` (`resultsPlugin`), `Context` (`contextPlugin`: `PromptInput.context` + the caller's leading system text) | one step of the work | BP3 `project` |
| 4 | The caller's conversation | its first `stable` non-system messages | one batch of calls | BP4 `stable` |
| 5 | Final message + Tail | the call's payload, then `Tail` (per-call `skills`, late packages, whatever a plugin adds there), then the tail schema and the JSON / tool-call / `/no_think` directives | one call | never |

The header tells the model that project facts override general guidance — a user turn otherwise
weighs less than system text.

Edge rules:
- **No `Role`/`Skills`/`Packages` composed** → `Results` and `Context` stay in the system message
  (a caller that adopted no persona sends what it built), closed by the `project` boundary.
- **The caller sent only system messages** → the project message is the final message: it takes
  the Tail and gets no BP3.
- **Tail placement** (`promptUtils.appendTail`): a final user string becomes
  `content + '\n\n' + tail`, a user block array gains one text block; after an assistant, tool or
  system message a new user message carries it.
- Only the caller's LEADING system messages become `Context`; a system message mid-conversation
  stays where it is.

## Placing breakpoints

`prepare` lists the candidates (`PromptPlan.boundaries`, kinds `CacheBoundary`) and the rung's
plugin places them with `patchPrompt(plan)` → `PromptPatch { messages, options?, placed }`:

- **At most 4 per request** (`MAX_CACHE_BREAKPOINTS`) — tools, system and messages together;
  Anthropic answers a fifth with a fatal 400. `LlmCallOptions.cacheMax` lowers the budget for one
  call (0–4, `0` = no markers). Boundaries are taken earliest first until it is spent.
- **Cumulative minimum.** A boundary is skipped while the prefix up to it (`prefixChars`, 4 chars
  per token) is below the model's minimum: `ModelConfig.cacheMinTokens`, else the plugin's
  per-family value, else `MIN_CACHEABLE_TOKENS` (1024). A later, longer boundary may still qualify.
- **Never the final message** — it is the per-call payload and its tail.
- **Copies only.** `normalizeInput` copies the caller's messages (prototypes kept), `prepare` strips
  every `cache_control` / `prompt_cache_breakpoint` they carry, and markers go on new objects. A
  caller that carries its conversation across calls gets it back exactly as it built it.
- **`PromptPolicy.cacheSystem: false`** drops BP1–BP3 (and an agent's loop markers); BP4 still
  follows `stable`.
- **Dialects.** A rung of another family or cache dialect (`LlmPlugin.cacheDialect`: `anthropic`,
  `explicit`, `implicit`) is prepared again from the untouched input; `patch.options` go on every
  stream call of that rung.

## Lifetimes: `cacheTtl`

`PromptPolicy.cacheTtl` — and `PromptServiceOptions.cacheTtl`, the default under it — is one
`CacheTtl` for every boundary or a `CacheTtlPolicy { skills?, packages?, project?, stable? }`.
Resolution: `'5m'` everywhere, then the service default, then the policy, key by key
(`executionPolicyHelper.mergePrompt` merges policy objects key by key down the execution chain; a
string replaces). Then the clamp: **lifetimes never rise along the prefix** — every key after a
`'5m'` becomes `'5m'`, since a provider refuses a 1-hour entry behind a 5-minute one. So
`{ skills: '1h' }` is the useful shape (a persona outlives one story), and `{ packages: '1h' }`
alone resolves to `'5m'`. A 1-hour write costs about 2× input against 1.25× for 5 minutes, so it
pays from the third read. Only Anthropic sends a lifetime.

## Call options that shape the prefix

| Option | Effect |
|---|---|
| `stable: n` | The caller's first `n` non-system messages repeat byte for byte across calls (a constant instruction, a shared source pin); BP4 closes on the last of them before the final message. Default `0`: the conversation is not cached. Replaces the removed `useCache`. |
| `cacheMax` | The breakpoint budget only — never a message position. |
| `focus` | A `PromptFocus` merged over the execution's `prompt.focus` as a deeper level (arrays union, `late` replaced); it picks the `Packages` block (below). |
| `skills` | Per-call skill aliases → the uncached Tail. A skill every call of a persona needs belongs in the execution's `prompt.skills` (BP1). |
| `schemaPlacement: 'tail'` | `invoke` / `request`: the provider gets a constant format (`json_object` where it has native JSON mode, nothing otherwise) and the schema (`TAIL_SCHEMA_INSTRUCTION` + JSON Schema) rides the Tail, so a persona that alternates schemas shares one prefix. Parsing and validation are unchanged. `native` (default) puts the schema in a tool or response format AHEAD of the prefix: one cache line per schema. |

## Packages: focus or detection

`owlmeansPackagesPlugin` fills `Packages`. With `focus.packages` it renders those packages (sorted),
each core plus the parts its purposes or `<package>#<part>` names select; the messages never change
that block, so it stays byte-stable for a persona and story. A package the messages import but the
focus lacks goes to the Tail — cores only, at most 3 packages / 24 000 chars — unless the focus says
`late: false`. Without a focus it detects packages in the messages, so the block can vary per call:
right for callers with no stable persona, wrong for a coder. Detail: [[agent-skills]].

## Tool loops

`makeAgentModel` composes once per run (plugin contributions and `context` → the project message),
sends `[system, project message, opening + Tail, …rounds]`, and on every round calls
`plugin.loopCache(wire, agentModel, hints)` on copies; `hints` carry the system blocks, the project
message's index and the resolved lifetimes. The plugin is `llmPluginRegistry.resolveFor(model)`:
the configured provider's plugin, else instance lookup on the UNBOUND model — a `bindTools` binding
is owned by no plugin, and instance lookup alone sends any `ChatOpenAI` to `compatible`. What each
provider marks per round: the `caching-providers` part.

## Determinism

- Order is declared (`PROMPT_BLOCK_ORDER`); skills sort by `(order, alias)` with a code-unit compare
  (`promptRenderHelper.compareAlias`, never `localeCompare` — ICU data differs between hosts);
  packages and parts sort by name.
- Skill bodies and anything in the system region are pure constants: no timestamps, absolute paths
  or request data. One varying byte costs every call sharing the prefix a write.
- A step's facts belong in the project message, per-call text in the Tail; never move either up
  into the system region. Writing a composition plugin: the `caching-plugins` part.

## Verifying it works

Unit tests make no model calls and cannot show a cache fault: it shows up as zero reads, a write
on every call, or a 400 the retry loop buries.

- `cacheHelper.readCacheUsage(message)` → `CacheUsage { read, creation, creationLong?, input,
  output }`. `creationLong` is the 1-hour share of `creation`: `cacheHelper.withCacheTiers` copies
  Anthropic's `response_metadata.usage.cache_creation.ephemeral_1h_input_tokens` to
  `usage_metadata.input_token_details.cache_creation_1h` (both `makeLlmModel` and `makeAgentModel`
  apply it), and a billing sink prices it at the 1-hour rate.
- Debug lines of the `llm` logger: `Prompt caching` (`provider`, `breakpoints` placed,
  `candidates`) when markers go out, `Prompt cache activity` (`read`, `written`, `writtenLong`,
  `uncached`) whenever a provider reports any. **`read` staying 0 across calls that share a prefix
  means something invalidates it** — diff `PromptResult.blocks` of two calls.
- A live probe (viable-agent's `probe-preset.ts cache` is one) sends two calls over one stable
  prefix and requires a read on the second. After a layout change also cover a changed project
  message (the system still reads), a three-round loop (each round reads the one before), a
  1-hour write, and OpenAI explicit mode (only marked spans written).
- `NullCapture.request.useCache` records whether the prepared request carried a breakpoint;
  `request.stable` the caller's count.

## Parts

| Part | Load it when |
|---|---|
| [caching-providers](parts/caching-providers.md) | changing how a provider marks a request or a loop round, or checking Anthropic / OpenAI cache facts |
| [caching-plugins](parts/caching-plugins.md) | writing a composition plugin, or wiring package skills, the utility model or a results view into a prompt |

## Related

- [[llm]] — the runtime and the provider-plugin seam
- [[llm-common]] — `PromptBlock`, `PromptRegion`, `PromptFocus`, `CacheTtlPolicy`, `CacheUsage`
- [[agent]] — the tool loop that calls `loopCache`
- [[agent-skills]] — `owlmeansPackagesPlugin`, focus and detection
