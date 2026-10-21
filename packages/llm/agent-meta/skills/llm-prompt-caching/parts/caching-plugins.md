---
name: caching-plugins
description: Writing a prompt-composition plugin that keeps the cache — which block to add to, determinism, ctx.claim, the utility model, the results view — and how package skills reach a prompt.
metadata:
  purposes: agent
  mentions: LlmPromptPlugin, PromptContext, PromptComposeParams, claim, resultsPlugin, contextPlugin, owlmeansPackagesPlugin, LlmFileProvider
---
<!-- AUTO-GENERATED — do not edit. Regenerate via sync-agent-meta. -->

# Prompt caching — Composition plugins

## Adding a plugin

```typescript
ctx.prompts().use({
  alias: 'my-plugin',
  order: 50,   // built-ins: role 0, skills 10, results 80, context 90; the package plugin is 50
  compose: ctx => ctx.add(PromptBlock.Skills, text),   // static, runs first
  inspect: ctx => { /* reads ctx.messages */ },        // after every compose pass
})
```

Choose the block by how long the text stays the same: `Role` / `Skills` for a persona, `Packages`
for a persona on one story, `Results` / `Context` for one step, `Tail` for one call. A plugin MUST be
deterministic — anything it adds above the Tail and cannot reproduce byte for byte breaks the prefix
for everyone sharing it. Registration is by alias: the same alias replaces rather than appends, so
double wiring cannot double-emit.

`ctx.messages` are the caller's messages minus its leading system text. On an agent run `compose`
gets none at all, so detection finds nothing there — an agent's packages come from its focus.

## `ctx.claim(key)` — one emitter per thing, per composition

Two plugins can each be ABLE to render the same skill (a static catalogue and a detector). The first
`ctx.claim(key)` in one `compose` gets `true`, every later one `false`, so exactly one emits. The
claim set is per composition, never per service — a claim that outlived the call would silently
drop the content from every later prompt — and a composition where nobody claims renders the same
bytes as before the seam existed. Claim a STABLE key (`skill:<alias>`, `pkg:@owlmeans/llm`): a key
derived from the request makes the winner, and the block, vary per call.

## `ctx.utility()` — a cheap model, never for a cached block

`PromptComposeParams.utility` resolves the cheap tier (`ExecutionService.utility`, the
`ModelPolicy.utilityRole ?? UTILITY_ROLE` alias at `ExecutionEffort.Economy`) for ONE side call
while composing, such as picking which candidate skills a request is about. It may yield
`undefined` — most deployments configure no cheap tier — and a plugin without one degrades rather
than fails. **Its answer never lands in `Role`, `Skills` or `Packages`**: a model's answer is not
reproducible byte for byte, so it belongs in `Context` or the `Tail`. Wiring: `makeLlmModel`'s
`utility` option and `AgentOptions.utility`; unwired, the field is absent.

## `ctx.results` — the view of earlier pipeline steps

`PromptComposeParams.results` is the execution's `results`, passed by `makeLlmModel` from its options
and by `makeAgentModel` from `exec.results`. `resultsPlugin` renders it with
`renderCumulativeResults` at the head of the project message; it is stable for one step and
different on the next, so it may never move into the system region. With no view nothing is
emitted, and the composed bytes are those of a prompt that never had the block (golden-tested in
`@owlmeans/llm`'s `tests/results.spec.ts`).

## Package skills in a prompt

`owlmeansPackagesPlugin(options)` (`@owlmeans/agent-skills/llm`, order 50) loads published package
skills — a core plus its selected parts — into `Packages`, or late ones into the Tail. Within a core
or a part nothing is filtered by relevance, by design: a partial answer about an API is worse than
none. Focus versus detection and the late caps: the core skill and [[agent-skills]].

Resolution per package: the host's `LlmFileProvider` (the only path that sees a sandbox or remote
workspace) → an installed copy under `node_modules` → the canonical repository over HTTPS. Every
failure is a miss, never a throw, and results, misses included, are cached per plugin instance and
per provider — a project's file provider must never serve its files to another project.

```typescript
ctx.prompts().use(owlmeansPackagesPlugin({
  files: () => fileProvider,     // the host's own LlmFileProvider, tried first
  exclude: ['@owlmeans/llm'],    // already covered by a static skill
  fetch: false,                  // air-gapped: skip the repository fallback
}))
```

The manifest carries no git ref — shipping the copy inside the tarball is what matches versions — so
for a package that is NOT installed the ref is a plugin option (`ref`, default `main`).
