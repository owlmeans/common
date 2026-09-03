---
name: llm-prompt-caching
description: How the OwlMeans LLM layer composes a system prompt from a role and skills, and the prompt-cache rules that layout exists to satisfy — block order, breakpoint budget, determinism invariants, and the provider facts behind them. Auto-invoked when touching prompt composition, skills, LlmPromptPlugin, patchSystem/patchCache, or anything that changes what a request sends before its first per-call byte.
user-invocable: false
---
<!-- AUTO-GENERATED — do not edit. Regenerate via sync-agent-meta. -->

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
| 1 | `Skills` | `skillsPlugin` ← registry + `inline`; `projectSkillsPlugin` index | per helper / per project | ✅ closes role+skills |
| 2 | `Packages` | app plugins (`owlmeansPackagesPlugin`, `projectSkillsPlugin` bodies) | per request | ✅ its own |
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

### `ctx.claim(key)` — one emitter per thing, per composition

Two plugins can each be ABLE to render the same skill (a static catalogue and a detector
that notices the request mentions it). `ctx.claim(key)` returns `true` to the first caller
and `false` to every later one within the same `compose`, so exactly one of them emits.

The claim set is per composition, never per service — a claim that outlived the call would
silently delete the content from every later prompt sharing the service. It is also free:
a composition where no plugin claims renders byte-identical output, so adding the seam
invalidated no prefix.

Claim on a STABLE key (`skill:<alias>`, `pkg:@owlmeans/llm`). A key derived from the
request makes the winner vary per call, and with it the cached block.

### `ctx.utility()` — a cheap model, for the volatile blocks only

`PromptComposeParams.utility` is a resolver for the cheap tier
(`ExecutionService.utility` → `ModelPolicy.utilityRole ?? UTILITY_ROLE` at
`ExecutionEffort.Economy`) that a plugin may spend ONE call on while composing — picking
which of a hundred candidate skills a request is about. It may yield `undefined`: most
deployments configure no cheap tier, and a plugin that cannot get one degrades rather
than fails.

**What it returns must never land in `Role` or `Skills`.** A model's answer is not
reproducible byte-for-byte, so a selection made this way belongs in `Packages` or
`Context`, which carry their own breakpoint or none. Wiring: `makeLlmModel`'s `utility`
option (beside `files`) and `AgentOptions.utility`; unwired, the field is simply absent.

## Package skills in a prompt (`@owlmeans/agent-skills/llm`)

`owlmeansPackagesPlugin(options)` notices which `@owlmeans/*` packages a request mentions
and loads their published skills into the `Packages` block. Everything a package documents
is loaded — there is no relevance filtering, by design.

Resolution order per package: the host's `LlmFileProvider` (the only path that sees a
sandbox or remote workspace) → an installed copy under `node_modules` → the canonical
repository over HTTPS. Every failure is a miss, never a throw. Results, including misses,
are cached per plugin instance.

A cache keyed on the file provider keys on `LlmFileProvider.key` — the provider's stable
identity (a project root, a sandbox id). Providers are late-bound and often rebuilt per
request, so object identity says nothing, and one bucket shared across projects serves the
first project's files to the second. A provider that declares no `key` is uncacheable, not
one more anonymous member of the shared bucket.

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

## Project skills in a prompt (`@owlmeans/agent-skills/llm`)

`projectSkillsPlugin(options)` (order 55) loads the skills the PROJECT itself has installed —
the Agent Skills standard's `.agents/skills/<name>/SKILL.md` directories, read through the
`LlmFileProvider` and never through `node:fs`.

It splits a skill across two blocks because the halves have different cache lifetimes:

- the **index** (`- <name> — <description>`, sorted by `compareAlias`, capped, descriptions
  clipped) goes into `Skills`. It is a property of the project, identical on every call about
  it, so it must be byte-stable — it sits behind the breakpoint every such call shares.
- an activated **body** goes into `Packages`, which carries its own breakpoint and may change
  per request.

That is progressive disclosure expressed as a cache layout: the model always knows what exists
and pays for a skill's text only when something says the call is about it.

Activation, in precedence order and capped at `maxActivated` (3): names the call itself asked
for → deterministic `rules` (`{ skills, when: { purposeType?, action?, mention?, paths? } }`)
→ the host's `activate(signals)` → optionally ONE `ctx.utility()` pick (`relevanceModel: true`,
off by default, memoised per project + signals hash so a retry re-sends identical bytes). Only
the deterministic mechanisms may influence anything cached.

Both body emitters claim `skill:<name>` first, and `owlmeansPackagesPlugin` (order 50) claims
before this one **by design**: a request that names `@owlmeans/auth` is a more specific signal
than a rule, so the package's copy wins the tie. A name the host registry already resolves is
dropped from the index entirely — `skillsPlugin` renders it, and indexing it too would
advertise one thing under two descriptions.

```typescript
ctx.prompts().use(projectSkillsPlugin({
  files: () => ctx.files(),
  rules: [{ skills: ['deploy'], when: { paths: ['charts/**', '*.yaml'] } }],
}))
```

Reads are cached per project (keyed by `LlmFileProvider.key`, `WeakMap` by instance without
one); listings expire after `listTtlMs` (30s) because skills are edited by hand mid-run. After
writing a skill into a project the agent is still working in, call
`invalidateProjectSkills(key)`.

`projectSkillsAgentPlugin` completes the picture inside a run: a `read_skill(name)` tool, for
the turn that turns out to need a body composition could not have predicted.

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
- [[agent-skills]] — `@owlmeans/agent-skills/llm`, both prompt plugins and the parser
