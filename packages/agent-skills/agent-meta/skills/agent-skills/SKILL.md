---
name: agent-skills
description: How to use @owlmeans/agent-skills — the CLI that installs embedded package guidance into a project, and the ./llm prompt plugins that load @owlmeans package skills and the project's own installed skills into a system prompt. Auto-invoked when importing owlmeansPackagesPlugin, projectSkillsPlugin, projectSkillsAgentPlugin, parseSkillFile, or running the installer.
user-invocable: false
---
<!-- AUTO-GENERATED — do not edit. Regenerate via sync-agent-meta. -->

# @owlmeans/agent-skills

**Layer:** Cross-cutting domain
**Install:** `"@owlmeans/agent-skills": "^0.1.18-rc.12"` — in `devDependencies` for the CLI, in
`dependencies` for the `./llm` plugins (plus the `@owlmeans/llm*`, `@owlmeans/agent` and
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

## Key exports (package root — the installer as a library)

The CLI is a thin shell over these, so a build script can drive an install without spawning `npx`.

| Export | Description |
|---|---|
| `run(args)` | The whole flow: refuse-if-linked → discover → plan → print → apply. Returns `{ code }`, never calls `process.exit`. |
| `discover(dir, { extras?, only? })` | Every installable entry found in the tree, deduped by name. |
| `detectLinked(dir)` | `{ linked, evidence }` — the exit-4 check. |
| `planInstall(entries, dir, { force? })` · `AUTO_GENERATED_BANNER` | Entry → `install` / `update` / `skip-uptodate` / `conflict`, decided by the banner and a byte comparison. |
| `applyInstall(items, dir)` | Writes the plan and maintains the Claude Code symlinks. Returns the counts. |

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

## `owlmeansPackagesPlugin` — what a named package contributes

A package that was named gets everything it documents: within a package there is no relevance
ranking, by design. Two ceilings bound the block anyway, and both matter when a prompt looks
larger than expected:

- `categories` (default `['package-specific', 'multi-package']`) — manifest categories to load.
  `general` entries say how an agent should behave rather than what a package does, so they are
  the host's own catalogue's job and are excluded unless asked for.
- `maxPackages` (default `5`) — mentioned packages loaded into one prompt. A message that
  name-drops a dozen packages is rarely asking about all of them, and each one costs context.

Resolution per package: the host's `LlmFileProvider` → an installed copy under `node_modules` →
the canonical repository over HTTPS. Every failure is a miss, never a throw, and misses are cached
too.

| Option | Default | Meaning |
|---|---|---|
| `files` | — | Host file access, tried first. |
| `scopes` | `['@owlmeans']` | Package scopes detected in the messages. |
| `dir` | `process.cwd()` | Where the local `node_modules` walk starts, going upward. |
| `exclude` | `[]` | Packages the static `Skills` block already carries. |
| `categories` | `['package-specific', 'multi-package']` | Manifest categories to load. |
| `maxPackages` | `5` | Mentioned packages loaded into one prompt. |
| `repo` · `ref` | `owlmeans/common` · `main` | The canonical fallback and the ref read from it. |
| `fetch` · `timeout` | `true` · `5000` | Whether that fallback runs at all, and its deadline. |

## `projectSkillsPlugin` — the two halves, two blocks

```typescript
// `files` is the host's own LlmFileProvider, as the value or a thunk for one.
ctx.prompts().use(projectSkillsPlugin({
  files: () => fileProvider,                   // fallback; the compose context's wins
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

| Option | Default | Meaning |
|---|---|---|
| `files` | — | Fallback provider; the compose context's own wins. |
| `dir` | `.agents/skills` | Where the skills live, relative to the project root. |
| `rules` · `activate` | `[]` · — | The deterministic rules, and the host's own decision on top. |
| `exclude` | `[]` | Names neither indexed nor activated. |
| `maxActivated` | `3` | Bodies loaded into one prompt. |
| `maxIndexEntries` · `descriptionChars` | `40` · `160` | Index size, and the clip that keeps each line stable. |
| `maxBodyChars` | `24000` | Length one activated body is clipped to. |
| `relevanceModel` | `false` | Spend one cheap-model call on the pick. |
| `listTtlMs` | `30000` | How long a directory listing is trusted. |

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
makeAgentModel({ exec, tools, plugins: [projectSkillsAgentPlugin({ files: () => fileProvider })] })
```

Composition happens once, before the first token, when nobody yet knows which of twelve turns
will touch the deployment guidance. `read_skill(name)` is how a running agent pulls a body at
the moment it needs one. Without a `files` provider the plugin contributes no tool at all. The
tool never throws — a rejected tool call aborts the whole LangGraph superstep.

## Installer CLI

`npx @owlmeans/agent-skills@^0.1.18-rc.12` walks the **whole** project tree, reads every nested
`<dir>/node_modules/@owlmeans` scope it finds, and copies each `agent-meta/` skill into
`.agents/skills/<name>/SKILL.md`. A workspace keeps its dependencies beside the workspace member
that declares them, so the root scope is routinely empty and a root-only scan would find nothing.
The walk never descends into a `node_modules` directory, skips hidden directories, and reads each
physical package once however many places it is linked from.

Only `kind: 'skill'` entries install. A package published before manifest schema v2 also carries a
`kind: 'instruction'` twin of the same knowledge — the Copilot format that predates the Agent Skills
standard — and those are dropped, so a mixed `node_modules` never writes both halves.

Two rules the discovery half must keep:

- **Dedup compares prereleases.** Every version on the current line is an `-rc.N`, so a comparison
  that stopped at major/minor/patch would call every contest a tie and keep whichever copy the
  walk reached first. Precedence is semver's: a release outranks any prerelease of the same
  version, identifiers compare field by field, numeric ones numerically and below alphanumeric.
- **`--only` filters before dedup, not after.** Two packages may ship a same-named skill; judging
  the filter against whichever copy won the dedup drops a skill the named package really ships.

An unresolved conflict costs one file, never the run: the clean skills are written first, then the
conflicts are reported, and only then does a non-interactive run without `--yes` or `--force`
return exit 5. A conflicted skill is still symlinked into `.claude/skills/` — it exists on disk,
and Claude Code has to see it. Exit codes: 2 argument parse, 3 nothing found, 4 linked monorepo,
5 unresolved conflicts, 1 fatal.

It refuses (exit 4) in a **linked** monorepo, where the root `.agents/skills/` is already
canonical and `sh .agents/scripts/link-skills.sh` — run by the committed `SessionStart` hook —
already puts it in front of every agent, so installing would only add stale copies. That check
scans the ROOT scope alone, on purpose: a dev-linked monorepo hoists escaping symlinks there, while
a scaffolded workspace app keeps its dependencies nested and must install normally.

Flags: `--dir` · `--yes` · `--only <pkg,...>` · `--extras` / `--no-extras` · `--force` ·
`--dry-run` · `--help`. `--claude-only` and `--copilot-only` are accepted and do nothing — one
skill store serves every agent. Full flag and conflict reference: package `README.md`.

### Extras — the guidance that belongs to no package

Some skills describe how an agent should work in an OwlMeans project at all rather than what a
package does. A skill becomes one by declaring

```yaml
metadata:
  scope: general
```

in its canonical frontmatter; everything so marked is embedded into THIS installer's own
`agent-meta/`, alongside this package's own skill. Extras install by default even when no other
`@owlmeans/*` package is present, which is how a freshly scaffolded project gets harness guidance
before its first dependency install. `--no-extras` limits the run to what the project's own
packages ship.

## Tests

`bun test ./tests` in the package — all offline. The `./llm` specs are driven by a fake
`LlmFileProvider` and import from the built subpath (`@owlmeans/agent-skills/llm`), so a change
under `src/llm` needs `tsc -b` before they test it. The installer spec imports the CLI sources
directly and needs no build; it drives real files under a temp directory.

## Depends On

- Runtime: nothing (CLI). `./llm`: optional peers `@owlmeans/llm`, `@owlmeans/llm-common`,
  `@owlmeans/agent`, `@langchain/core`

## Related

- [[llm-prompt-caching]] — block order, breakpoints, `claim` and `utility`
- [[llm-common]] — `SkillDefinition`, `PromptBlock`, `LlmFileProvider`
- [[agent]] — the `AgentPlugin` seam and `AgentToolSet` conventions
- [[skill-authoring]] — writing the SKILL.md files this reads
- [[nested-agent-context]] — why embedded `agent-meta/` copies are ignored in a linked checkout
