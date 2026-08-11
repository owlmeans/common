---
description: "How the OwlMeans LLM layer composes a system prompt from a role and skills, and the prompt-cache rules that layout exists to satisfy — block order, breakpoint budget, determinism invariants, and the provider facts behind them. Consult before changing prompt composition, skills, a prompt plugin, or anything a request sends before its first per-call byte."
applyTo: "**/*.ts, **/*.tsx"
---
<!-- AUTO-GENERATED — do not edit. Regenerate via sync-agent-meta. -->

# Prompt composition and caching

**Layer:** Core · **Packages:** `@owlmeans/llm` (`./prompt`), `@owlmeans/llm-common`, `@owlmeans/agent-skills` (`./llm`)

A prompt cache is an **exact prefix match**. Everything below follows from that: the bytes
every call shares must come first, physically, and must be identical down to the
whitespace.

## The block layout

`PromptService.compose()` renders four ordered blocks into one system message:

| # | Block | Contributed by | Changes | Breakpoint |
|---|-------|----------------|---------|-----------|
| 0 | `Role` | `rolePlugin` ← `PromptPolicy.role` | per role | — |
| 1 | `Skills` | `skillsPlugin` ← registry + `inline` | per helper | ✅ closes role+skills |
| 2 | `Packages` | app plugins | per request | ✅ its own |
| 3 | `Context` | `contextPlugin` ← `context`, `callSkills` | per call | **never** (unless sole block) |

A caller's own leading `SystemMessage` is detached by `makeLlmModel` and re-emitted as
`Context`, so a helper that has not adopted `prompt: { role, skills }` keeps working.

## Rules

- **Order is the cache key.** `PROMPT_BLOCK_ORDER` is explicit; skills sort by
  `(order, alias)` with a code-unit comparison (never `localeCompare`); detected packages
  sort alphabetically.
- **Skill bodies are pure constants** — no timestamps, paths, or interpolated request data.
- **A volatile block is never marked.** The trailing `Context` block changes every
  call: a breakpoint there would pay a cache WRITE on every request and never read
  one back. It is marked ONLY when it is the entire prompt (a caller that has not
  adopted role/skills), because there it IS the stable part. Its parts are merged
  into one chunk for the same reason — nothing downstream needs them separable.
- **Volatile content goes last.** Per-call skills use `LlmCallOptions.skills` (→ `Context`),
  never the execution's `skills` (→ the cached `Skills` block).
- **Budget: 4 breakpoints per request.** The system prompt spends at most 3.
- **The last message is never cached** — it is the per-call payload.
- **Markers are placed in-place, on the caller's objects.** A caller that carries its
  message array across calls (a coder's growing conversation, a fix loop) hands them back
  still marked, and they accumulate. `prepare()` therefore calls `stripCacheMarkers()`
  first, so the per-request count depends on THIS call alone. Anything that places a
  marker outside that pipeline must do the same.
- **A prefix below `MIN_CACHEABLE_TOKENS` is left unmarked** (`ModelConfig.cacheMinTokens`
  overrides per alias).
- **A prompt plugin MUST be deterministic**, and registering the same alias twice replaces
  rather than appends.

## Verifying it works
> **The smoke test cannot catch a caching bug.** It makes no model calls. A breakpoint-budget
> or marker-accumulation fault only appears under a real multi-call agent run — and it
> surfaces as a `400`, which the retry loop can bury for minutes. Check the agent's own pod
> logs for `Prompt cache [` lines and a non-zero `read`.


`readCacheUsage(message)` from `@owlmeans/llm/helpers` reads
`usage_metadata.input_token_details`. If `read` stays 0 across repeated calls that share a
prefix, something is invalidating it — diff `PromptResult.blocks` between two calls.

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

**Anthropic** ([docs](https://platform.claude.com/docs/en/build-with-claude/prompt-caching.md)):
render order `tools` → `system` → `messages`; max 4 breakpoints; minimum cacheable prefix is
model-dependent and **not monotonic** (512 newest / 1024 most / 4096 on Opus 4.6-4.5 and
Haiku 4.5); writes cost ~1.25× at 5m TTL and ~2× at 1h; a `system` change invalidates
system + messages but not `tools`.

**OpenAI** ([docs](https://developers.openai.com/api/docs/guides/prompt-caching)): automatic
from 1024 tokens; routing hashes roughly the first 256 tokens and mixes in
`prompt_cache_key`. The `openai` plugin sets it from the config alias; the `compatible`
plugin does not, because aggregators with `provider.require_parameters` can drop providers
over an unknown field.
