---
name: agent-skills
description: How to use @owlmeans/agent-skills — the CLI that installs embedded package guidance into a project, and the ./llm prompt plugins that load @owlmeans package skills and the project's own installed skills into a system prompt. Auto-invoked when importing owlmeansPackagesPlugin, projectSkillsPlugin, projectSkillsAgentPlugin, parseSkillFile, or running the installer.
user-invocable: false
---

# @owlmeans/agent-skills

**Layer:** Cross-cutting domain
**Install:** `"@owlmeans/agent-skills": "^0.1.18-rc.11"` — a `devDependency` for the CLI, a
`dependency` for the `./llm` plugins (plus the `@owlmeans/llm*`, `@owlmeans/agent` and
`@langchain/core` **optional peers**)

Two halves that never meet at runtime:

- the package root — the **installer CLI**, which lifts embedded `agent-meta/` guidance out of
  installed `@owlmeans/*` packages into `.agents/skills/`. It has **no runtime dependencies**
  and must keep it that way.
- `./llm` — **prompt plugins** that put guidance into a system prompt. Everything they import
  is an optional peer, which is why they are a separate subpath and are never re-exported from
  the package index.

## Key exports (`@owlmeans/agent-skills/llm`)

| Export | Description |
|---|---|
| `owlmeansPackagesPlugin(options?)` | Order 50. Detects `@owlmeans/*` mentions in the messages, loads those packages' published skills into `PromptBlock.Packages`. |
| `projectSkillsPlugin(options?)` | Order 55. Indexes the project's own installed skills into `PromptBlock.Skills`, and activated bodies into `PromptBlock.Packages`. |
| `projectSkillsAgentPlugin(options?)` | An `AgentPlugin` exposing the `read_skill(name)` tool, so a running agent pulls a body when it turns out to need one. |
| `loadProjectSkills(provider, options?)` | Every valid skill in a project, sorted by name. |
| `parseSkillFile(path, content)` · `parseSkillFrontmatter(content)` | The spec parser/validator. Returns `null` for anything that is not a valid skill. |
| `matchRules(rules, signals)` · `pickByModel(index, signals, model, max)` | The two activation mechanisms, usable standalone. |
| `projectSkillsCache(provider)` · `invalidateProjectSkills(key?)` | The per-project read cache and its invalidation. |
| `loadPackageSkills`, `stripMeta`, `parseManifest`, `skillEntries`, `toSkill`, `unscoped` | Embedded-manifest primitives. |

## The Agent Skills standard

A skill is a **directory** whose `SKILL.md` opens with YAML frontmatter
([agentskills.io](https://agentskills.io)):

| Field | Rule |
|---|---|
| `name` | required, 1-64 chars, `[a-z0-9-]`, **must equal the directory name** |
| `description` | required, 1-1024 chars |
| `license` · `compatibility` · `metadata` · `allowed-tools` | optional |

**Progressive disclosure is the point.** `name` + `description` are cheap and always loaded;
the body loads only on activation. Everything below is that principle expressed as a cache
layout.

Parsing rules this package holds to:

- The frontmatter parser is **hand-rolled** — flat `key: value`, one nesting level, folded
  continuation lines. No YAML dependency: the CLI half ships with none.
- An invalid file is **skipped silently, never thrown**. A skills directory holds drafts and
  notes, and none of them may take down a model call.
- A `name` that differs from its directory is invalid — the name is how everything else
  addresses the skill, so the mismatch makes it unreachable.
- Bodies are stripped of frontmatter and of any `AUTO-GENERATED` banner (`stripMeta`).

## `projectSkillsPlugin` — the two halves, two blocks

```typescript
ctx.prompts().use(projectSkillsPlugin({
  files: () => ctx.files(),                    // fallback; the compose context's wins
  rules: [
    { skills: ['deploy'], when: { paths: ['charts/**', '*.yaml'] } },
    { skills: ['auth-protocol'], when: { purposeType: ['coder'], mention: ['token', 'guard'] } },
  ],
}))
```

| Half | Block | Lifetime | Content |
|---|---|---|---|
| index | `Skills` | per project | `- <name> — <description>` per skill, sorted, capped |
| body | `Packages` | per request | `renderSkill()` of each activated skill |

The index MUST stay byte-stable for a project: it sits behind a cache breakpoint that every
call about that project shares. That is why entries sort by `compareAlias` (code units, never
`localeCompare`), descriptions are clipped to a fixed `descriptionChars`, and the heading and
lead line are constants.

**Reads go through `LlmFileProvider` only — never `node:fs`.** The project an agent works on
is routinely a sandbox, a container or a remote workspace; a plugin that reaches for the local
filesystem describes the wrong project instead of failing.

### Activation — what turns an index line into a body

In precedence order, capped at `maxActivated` (3), then sorted for byte-stability:

1. **Named by the call** — a name in `PromptInput.skills` / `callSkills` that matches an
   installed skill. A caller that named it has stated the intent the rest is inferring.
2. **Deterministic rules** — `{ skills, when: { purposeType?, action?, mention?, paths? } }`.
   Every predicate present must hold. An empty `when` never fires: a skill that activates on
   every request is the static `Skills` block written in the wrong place.
3. **`activate(signals)`** — the host's own decision.
4. **`relevanceModel: true`** — ONE cheap `ctx.utility()` call, answering with names taken
   from the index. **Off by default.** Memoised per (project key + a hash of the signals) so a
   retry re-sends identical bytes.

Only 1-3 run by default, and only they may ever influence a cached block.

### Dedupe and exclusion

- Every body emitter claims `skill:<name>` (`ctx.claim`) first. `owlmeansPackagesPlugin` runs
  at 50 and claims first **by design** — a request that names `@owlmeans/auth` is a more
  specific signal than a rule, so the package's copy wins the tie and the project's is skipped.
- A name that resolves in the host registry (`ctx.resolve([name])`) is dropped from the index
  entirely: `skillsPlugin` already renders it, and indexing it too advertises one thing under
  two descriptions.

### Caching

`projectSkillsCache` is module-level and keyed by `LlmFileProvider.key`, falling back to a
`WeakMap` on the provider INSTANCE when it declares none — two keyless providers may be two
different projects, and serving one's files to the other is worse than any miss. Listings
expire on `listTtlMs` (30s, because skills are edited by hand mid-run); parsed bodies are kept
per path. After writing a skill file into a project an agent is still working in, call
`invalidateProjectSkills(key)`.

## `projectSkillsAgentPlugin` — disclosure inside the loop

```typescript
makeAgentModel({ exec, tools, plugins: [projectSkillsAgentPlugin({ files: () => ctx.files() })] })
```

Composition happens once, before the first token, when nobody yet knows which of twelve turns
will touch the deployment guidance. `read_skill(name)` is how a running agent pulls a body at
the moment it needs one. Without a `files` provider the plugin contributes no tool at all. The
tool never throws — a rejected tool call aborts the whole LangGraph superstep.

## Installer CLI

`npx @owlmeans/agent-skills@^0.1.18-rc.11` scans `node_modules/@owlmeans/*/agent-meta/`, and copies skills
into `.agents/skills/<name>/SKILL.md`. It refuses (exit 4) in a **linked** monorepo, where the
root `.agents/skills/` is already canonical and installing would write stale copies.
Flags and conflict policy: package `README.md`.

## Tests

`bun test ./tests` in the package — all offline, driven by a fake `LlmFileProvider`. Specs
import from the built subpath (`@owlmeans/agent-skills/llm`), so **rebuild before running
them** or a source change will not be under test.

## Depends On

- Runtime: nothing (CLI). `./llm`: optional peers `@owlmeans/llm`, `@owlmeans/llm-common`,
  `@owlmeans/agent`, `@langchain/core`

## Related

- [[llm-prompt-caching]] — block order, breakpoints, `claim` and `utility`
- [[llm-common]] — `SkillDefinition`, `PromptBlock`, `LlmFileProvider`
- [[agent]] — the `AgentPlugin` seam and `AgentToolSet` conventions
- [[skill-authoring]] — writing the SKILL.md files this reads
- [[nested-agent-context]] — why embedded `agent-meta/` copies are ignored in a linked checkout
