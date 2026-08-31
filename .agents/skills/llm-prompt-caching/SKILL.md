---
name: llm-prompt-caching
description: How the OwlMeans LLM layer composes a system prompt from a role and skills, and the prompt-cache rules that layout exists to satisfy — block order, breakpoint budget, determinism invariants, and the provider facts behind them. Auto-invoked when touching prompt composition, skills, LlmPromptPlugin, patchSystem/patchCache, or anything that changes what a request sends before its first per-call byte.
user-invocable: false
---

# Prompt composition and caching

**Layer:** Core · **Packages:** `@owlmeans/llm` (`./prompt`), `@owlmeans/llm-common`, `@owlmeans/agent-skills` (`./llm`)

A prompt cache is an **exact prefix match**. Everything in this document follows from that
one fact: the bytes every call shares must come first, physically, and must be identical
down to the whitespace. The block layout, the ordering rules and the determinism
invariants are not style — they are the cache.

## The block layout

`PromptService.compose()` renders four ordered blocks (`PromptBlock`, `PROMPT_BLOCK_ORDER`)
into a single system message:

| # | Block | Contributed by | Changes | Breakpoint |
|---|-------|----------------|---------|-----------|
| 0 | `Role` | `rolePlugin` ← `PromptPolicy.role` | per role | — |
| 1 | `Skills` | `skillsPlugin` ← registry + `inline` | per helper | ✅ closes role+skills |
| 2 | `Packages` | app plugins (e.g. `owlmeansPackagesPlugin`) | per request | ✅ its own |
| 3 | `Context` | `contextPlugin` ← `context`, `callSkills` | per call | **never** (unless sole block) |

A caller's own leading `SystemMessage` is detached by `makeLlmModel` and re-emitted as
`Context`, so a helper that has not adopted `prompt: { role, skills }` keeps working —
its text simply travels a different route.

## Rules

- **Order is the cache key.** `PROMPT_BLOCK_ORDER` is declared explicitly, skills sort by
  `(order, alias)` with a code-unit comparison (`compareAlias`, never `localeCompare` —
  ICU data differs between hosts), and detected packages sort alphabetically.
- **Skill bodies are pure constants.** No timestamps, no absolute paths, no interpolated
  request data. One varying byte invalidates the prefix for every call that shares it.
- **A volatile block is never marked.** The trailing `Context` block changes every
  call: a breakpoint there would pay a cache WRITE on every request and never read
  one back. It is marked ONLY when it is the entire prompt (a caller that has not
  adopted role/skills), because there it IS the stable part. Its parts are merged
  into one chunk for the same reason — nothing downstream needs them separable.
- **Volatile content goes last.** Per-call skills belong in `LlmCallOptions.skills`
  (→ `Context`), not in the execution's `skills` (→ the cached `Skills` block).
- **Budget: 4 breakpoints per request, total** — across tools, system AND messages.
  Anthropic rejects the fifth outright (`400 A maximum of 4 blocks with cache_control may
  be provided. Found 5.`), and a 400 is fatal, so the whole call fails. The system prompt
  may spend at most `MAX_SYSTEM_BREAKPOINTS` (2) — its only STABLE boundaries are the end
  of role+skills and the end of packages — which always leaves two for the messages.
- **The last message is never cached.** `patchCache` stops one short of the end: the final
  message is the per-call payload, and `ensureJsonMention` / `applyNoThink` append to it.
- **Markers are placed in-place, on the caller's objects.** A caller that carries its
  message array across calls (a coder's growing conversation, a fix loop) hands them back
  still marked, and they accumulate. `prepare()` therefore calls `stripCacheMarkers()`
  first, so the per-request count depends on THIS call alone. Anything that places a
  marker outside that pipeline must do the same.
- **A short prefix is not marked.** Below `MIN_CACHEABLE_TOKENS` (override per alias with
  `ModelConfig.cacheMinTokens`) a marker buys nothing and costs a breakpoint.

## Verifying it works
> **The smoke test cannot catch a caching bug.** It makes no model calls. A breakpoint-budget
> or marker-accumulation fault only appears under a real multi-call agent run — and it
> surfaces as a `400`, which the retry loop can bury for minutes. Check the agent's own pod
> logs for `Prompt cache [` lines and a non-zero `read`.


`usage_metadata.input_token_details` is the only honest answer. `readCacheUsage(message)`
(`@owlmeans/llm/helpers`) normalizes it; `spectate` logs a line whenever a provider reports
any cache activity. **If `read` stays 0 across repeated calls that share a prefix, something
is invalidating it** — diff `PromptResult.blocks` between two calls to find what.

## Adding a plugin

```typescript
ctx.prompts().use({
  alias: 'my-plugin',
  order: 50,                         // built-ins hold 0 (role), 10 (skills), 90 (context)
  compose: ctx => ctx.add(PromptBlock.Skills, text),   // static, runs first
  inspect: ctx => { /* reads ctx.messages */ },        // after every compose pass
})
```

A plugin MUST be deterministic. Anything it contributes to a cached block and cannot
reproduce byte-for-byte breaks the prefix for everyone sharing it. Register by alias —
re-registering the same alias replaces rather than appends, so double-wiring cannot
double-emit.

## Package skills in a prompt (`@owlmeans/agent-skills/llm`)

`owlmeansPackagesPlugin(options)` notices which `@owlmeans/*` packages a request mentions
and loads their published skills into the `Packages` block. Everything a package documents
is loaded — there is no relevance filtering, by design.

Resolution order per package: the host's `LlmFileProvider` (the only path that sees a
sandbox or remote workspace) → an installed copy under `node_modules` → the canonical
repository over HTTPS. Every failure is a miss, never a throw. Results, including misses,
are cached per plugin instance.

```typescript
ctx.prompts().use(owlmeansPackagesPlugin({
  files: () => ctx.files(),      // tried first
  exclude: ['@owlmeans/llm'],    // already covered by the static Skills block
  fetch: false,                  // air-gapped: skip the repository fallback
}))
```

The manifest deliberately carries no git ref — version-matching comes from shipping the
copy inside the tarball, so for a package that is NOT installed the ref is a plugin option
(`ref`, default `main`).

## Provider facts these rules encode

**Anthropic** ([prompt-caching](https://platform.claude.com/docs/en/build-with-claude/prompt-caching.md)) —
render order is `tools` → `system` → `messages`; **max 4** `cache_control` breakpoints per
request; the minimum cacheable prefix is model-dependent and **not monotonic** across
generations (512 tokens on the newest models, 1024 on most, 4096 on Opus 4.6/4.5 and
Haiku 4.5); a write costs ~1.25× at the 5-minute TTL and ~2× at `ttl: '1h'`, so the long
TTL only pays from the third read; changing `system` invalidates system + messages but not
`tools`; each breakpoint looks back at most 20 content blocks.

**OpenAI** ([prompt-caching](https://developers.openai.com/api/docs/guides/prompt-caching)) —
caching is automatic from 1024 tokens in 128-token increments, with no markers to place.
Requests are routed by a hash of roughly the first 256 tokens, and `prompt_cache_key` is
mixed into that hash, so requests sharing a key land on the same backend and can actually
hit each other's entries. The `openai` plugin sets it from the config alias (one value per
role); the `compatible` plugin deliberately does not, because aggregators running with
`provider.require_parameters` can drop every serving provider over an unknown field.

## Related

- [[llm]] — the runtime and the provider-plugin seam
- [[llm-common]] — `SkillDefinition`, `PromptPolicy`, `PromptBlock`, `LlmFileProvider`
- [[agent-skills]] — `@owlmeans/agent-skills/llm`, the package-skills plugin
