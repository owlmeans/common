---
name: agent-skills
description: How to use @owlmeans/agent-skills — the CLI that installs embedded package guidance (core skills and their purpose parts) into a project, and the ./llm prompt plugin owlmeansPackagesPlugin that loads @owlmeans package skills into a system prompt, chosen by a call's focus or by the packages its messages name. Auto-invoked when importing owlmeansPackagesPlugin, loadPackageSkills or manifestHelper, writing a chunked package skill, or running the installer.
user-invocable: false
---

# @owlmeans/agent-skills

**Layer:** Cross-cutting domain
**Install:** `"@owlmeans/agent-skills": "^0.1.18-rc.57"` — in `devDependencies` for the CLI, in
`dependencies` for the `./llm` plugin (plus the `@owlmeans/llm` and `@owlmeans/llm-common`
**optional peers**)

Two halves that never meet at runtime:

- the package root — the **installer CLI**, which lifts embedded `agent-meta/` guidance out of
  installed `@owlmeans/*` packages into `.agents/skills/`. It has **no runtime dependencies**
  and must keep it that way.
- `./llm` — the **prompt plugin** that puts package guidance into a system prompt. Everything it
  imports is an optional peer, which is why it is a separate subpath and is never re-exported from
  the package index.

## Key exports (`@owlmeans/agent-skills/llm`)

| Export | Description |
|---|---|
| `owlmeansPackagesPlugin(options?)` | Order 50. Loads the published skills of the packages a call focuses on, or of the `@owlmeans/*` packages its messages name, into `PromptBlock.Packages` — see "Chunked package skills". |
| `loadPackageSkills(name, options, categories)` | One package's skills from the first source that has them (below); `null` on a miss. |
| `manifestHelper.{stripMeta, parseManifest, skillEntries, toSkill, unscoped}` | Embedded-manifest primitives. |
| `PACKAGE_SKILLS_PLUGIN` · `OWLMEANS_SCOPE` | The plugin alias (`owlmeans-packages`) and the default scope (`@owlmeans`). |
| `PackageSkills`, `PackageSkillsOptions`, `SkillSource` | The loaded package, the plugin options, and where a package's skills came from. |

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
the body loads only on activation. A chunked package skill takes it one level further: its core
loads whenever the package is chosen, and each part loads only for a call that needs its purpose.

Rules this package holds to:

- It parses **no skill frontmatter**. The generator that embeds `agent-meta/` reads the canonical
  frontmatter and writes what the installer and the plugin need into the manifest — names,
  categories, and each part's purposes and mentions. Both halves read only the manifest.
- A broken manifest, a missing file or a failed fetch is a **miss, never a throw**. A skill lookup
  may never take down a model call.
- A `name` that differs from its directory is invalid — the name is how everything else
  addresses the skill, so the mismatch makes it unreachable.
- Bodies are stripped of frontmatter and of any `AUTO-GENERATED` banner (`manifestHelper.stripMeta`).

## Chunked package skills

A large package skill is a core plus purpose parts. Authoring rules (part frontmatter, the purpose
vocabulary, size limits): `skill-authoring`.

```
skills/<name>/SKILL.md            # the core — loaded whenever the package is chosen
skills/<name>/parts/<part>.md     # one purpose each
```

- **Manifest v3.** A skill entry lists its parts: `parts: [{ name, file:
  'skills/<name>/parts/<part>.md', description, purposes[], mentions[] }]`. The installer writes
  them beside the core and prunes bannered parts no longer listed. A pre-v3 installer or plugin
  accepts a v3 manifest and loads the core only; a v2 manifest gives the core only.
- **Purposes and mentions come from the manifest**, never from a part's frontmatter. Purposes are
  the closed `PackagePurpose` vocabulary (`PACKAGE_PURPOSES`, `@owlmeans/llm-common`).
- **Focus mode** — the call's prompt policy carries a `PromptFocus` (`@owlmeans/llm-common`). Each
  focus package, sorted, renders its core, then the parts whose purposes meet the focus purposes or
  that the focus names (`@owlmeans/web-panel#picker`), in name order. The messages never change
  this block, so it stays byte-stable for a persona and story.
- **Late packages** — in focus mode, a package the call's messages IMPORT but the focus lacks goes
  to the per-call Tail, cores only, capped at 3 packages and 24 000 chars. `late: false` on the
  focus keeps the prompt to the focus.
- **Detect mode** — no focus (free flight, a converter, any other consumer): packages are detected
  in the messages, imported ones ranked before merely named ones, and each loads its core plus the
  parts whose mentions appear in the messages.

## `owlmeansPackagesPlugin` — what a named package contributes

A chosen package gets its core whole, plus the parts its focus or the messages call for (above);
within a core or a part there is no relevance ranking, by design. Two ceilings bound the block
anyway, and both matter when a prompt looks larger than expected:

- `categories` (default `['package-specific', 'multi-package']`) — manifest categories to load.
  `general` entries say how an agent should behave rather than what a package does, so they are
  the host's own catalogue's job and are excluded unless asked for.
- `maxPackages` (default `5`) — mentioned packages loaded into one prompt in detect mode. A message that
  name-drops a dozen packages is rarely asking about all of them, and each one costs context.

Resolution per package: the host's `LlmFileProvider` → an installed copy under `node_modules` →
the canonical repository over HTTPS — or, when `localRoot` names a checkout of it, that checkout
from disk INSTEAD (the same embedded `agent-meta/` copies at the same repo-relative paths, source
`checkout`; GitHub is then
never asked, and `fetch` does not apply). Every failure is a miss, never a throw, and misses are
cached too.

| Option | Default | Meaning |
|---|---|---|
| `files` | — | Host file access, tried first. |
| `scopes` | `['@owlmeans']` | Package scopes detected in the messages. |
| `dir` | `process.cwd()` | Where the local `node_modules` walk starts, going upward. |
| `exclude` | `[]` | Packages the static `Skills` block already carries. |
| `categories` | `['package-specific', 'multi-package']` | Manifest categories to load. |
| `maxPackages` | `5` | Mentioned packages loaded into one prompt. |
| `repo` · `ref` | `owlmeans/common` · `main` | The canonical fallback and the ref read from it. |
| `localRoot` | — | A checkout of `repo` read from disk in place of that fallback (development hosts). |
| `fetch` · `timeout` | `true` · `5000` | Whether the network fallback runs at all, and its deadline. |

## Installer CLI

`npx @owlmeans/agent-skills@^0.1.18-rc.57` walks the **whole** project tree, reads every nested
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

- Runtime: nothing (CLI). `./llm`: optional peers `@owlmeans/llm`, `@owlmeans/llm-common`

## Related

- [[llm-prompt-caching]] — block order, breakpoints, `claim` and `utility`
- [[llm-common]] — `SkillDefinition`, `PromptBlock`, `LlmFileProvider`
- [[agent]] — agent runs compose their prompts through the same prompt plugins
- [[skill-authoring]] — writing the SKILL.md files and parts this reads
- [[nested-agent-context]] — why embedded `agent-meta/` copies are ignored in a linked checkout
