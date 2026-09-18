---
name: create-skill
description: Guide for creating a new agent skill in this project — one SKILL.md under .agents/skills/ that Claude Code, GitHub Copilot and Codex all read, portable frontmatter, bundled scripts, and the symlink refresh step. Use when asked to convert knowledge into a skill, create a slash command, or add a new skill file.
---

# Creating an agent skill

Skills live in `.agents/skills/<skill-name>/SKILL.md` — one directory per skill, one copy for
every agent. This is the [Agent Skills](https://agentskills.io) standard location: GitHub Copilot
and Codex read it natively, and Claude Code reads it through the generated per-skill symlinks in
`.claude/skills/`.

**Never** author a per-agent copy: no `.github/instructions/<name>.instructions.md`, no
`.github/copilot-instructions.md`, no `.github/skills/`, and no real files under `.claude/skills/`
or `.agents/linked-skills/` — both of those are generated and gitignored.

## Naming

The directory name is the skill's identity: frontmatter `name` must equal it, and it is what an
agent types to load the skill. Lowercase, hyphens, ≤ 64 chars.

A local skill **shadows** an upstream one of the same name — `link-skills.sh` links a dependency's
skill only when no local skill claims the name. So a local skill named after an `@owlmeans` package
(`resource`, `web-client`, `auth`, …) hides that package's own guidance for the whole repo. Name
a skill after the concern it covers, never after a package this project consumes.

A skill also shadows a **Claude Code built-in slash command** of the same name: with a skill called
`context`, typing `/context` loads the skill instead of the context-usage view — in every repo that
links or installs it, and nothing reports it. Never name a skill after a built-in command, one of its
aliases (`/settings` is `/config`, `/cost` is `/usage`) or a bundled skill (`/loop`, `/simplify`);
type `/` in a Claude Code session to see the taken names. A skill about a package whose name is taken
carries the `owlmeans-` prefix — `owlmeans-context` for `@owlmeans/context`, `owlmeans-config` for
`@owlmeans/config`. The OwlMeans release harness refuses a colliding canonical skill name
(`sync-agent-meta` exit 14).

## File structure

```
.agents/skills/<skill-name>/
├── SKILL.md          # Required — entrypoint with frontmatter + instructions
├── reference.md      # Optional — detailed reference docs
├── examples.md       # Optional — usage examples
└── scripts/          # Optional — bundled shell scripts the skill runs
    └── <name>.sh
```

## Skills with scripts

A bundled script lives in exactly one place: `.agents/skills/<name>/scripts/<script>.sh`. Every
agent can reach it from the repo root, so there is no second copy to keep in sync.

1. Place the script in `.agents/skills/<name>/scripts/<script>.sh` and `chmod +x` it.
2. Document the invocation in the SKILL.md body under a "Script reference" section, using the
   repo-root-relative path.
3. Set `allowed-tools: Bash(sh *)` in frontmatter so the script runs without a prompt.

## SKILL.md frontmatter

```yaml
---
name: skill-name                  # REQUIRED — must equal the directory name (lowercase, hyphens, ≤64 chars)
description: What it does and when to use it   # REQUIRED — ≤1024 chars; the auto-invocation signal
allowed-tools: Bash(bun *), Read  # comma-separated; tools usable without per-call approval
disable-model-invocation: true    # set true for side-effect tasks (deploy, commit)
user-invocable: false             # set false for background knowledge only
metadata:                         # anything non-standard goes here
  scope: general
---
```

The `description` is the field everything turns on: every agent reads it to decide when to load
the skill, so state both the topic and the trigger ("Use when …"). It is YAML, so a value
containing `: ` (colon-space) has to be quoted — unquoted, the file stops parsing and the skill
silently disappears from every agent. Keep it under 1024 characters; Copilot rejects longer ones.

| Field | Use when |
|---|---|
| `name` | Always — must match the directory name, or Copilot rejects the skill |
| `description` | Always — primary signal for when an agent loads the skill; keep under 1024 chars |
| `allowed-tools` | Skill needs to run specific commands without prompting — a comma-separated list |
| `disable-model-invocation: true` | Skill has side effects (git push, deploy, etc.) — the operator invokes it manually |
| `user-invocable: false` | Skill is background knowledge, not an action — hide from the `/` menu |
| `metadata.scope: general` | Skill is cross-cutting and ships with the `@owlmeans/agent-skills` installer — auto-routes to the installer bundle and is never pruned by a sync run |
| `argument-hint` | Skill takes arguments — show hint in autocomplete |

Six fields are portable: `name`, `description`, `license`, `compatibility`, `allowed-tools` and
nested `metadata` — exactly what the Agent Skills frontmatter parser in `@owlmeans/agent-skills`
reads. `user-invocable`, `disable-model-invocation` and `argument-hint` are understood by Claude
Code and Copilot; use them only when the skill genuinely needs them. Everything else, including
project-specific routing markers such as `scope: general`, belongs under `metadata:`.

Write `allowed-tools` as a comma-separated list (`Bash(bun *), Read`), a flow sequence
(`[Bash(bun *), Read]`), or an indented `- ` block. The parser breaks entries on commas, newlines
and `- ` only — never on a bare space — so `Bash(bun *) Read` is read as one tool whose name is
`Bash(bun *) Read`. `@owlmeans/agent-skills` keeps the parsed list advisory and enforces no tool
policy itself; the agent running the skill is what honours it.

## Decision guide

| Scenario | Approach |
|---|---|
| Project-specific CLI/build knowledge | Skill, no `disable-model-invocation` (let the agent auto-use it) |
| Side-effect workflow (commit, deploy) | `disable-model-invocation: true` |
| Background reference only | `user-invocable: false` |

## What may enter AGENTS.md

`AGENTS.md` — with every file it `@`-imports and `.agents/memory/MEMORY.md` — is loaded in full in
every session, so it has a budget: **≤ 40 000 chars**, checked by `sh .agents/scripts/agents-size.sh`
from the repo root. A line enters it only as:

1. a mandatory rule that must hold before any skill is loaded (git, reporting, environments,
   naming) — stated in one or two lines, with the detail in a skill;
2. one line of the package map or the command list;
3. one line of the skills index: `` - `/name` — when to load it ``, ≤ 160 chars.

Everything else is loaded on demand: a subsystem's rules, contracts and failure fingerprints go to
the skill that governs it, and the outage that taught them to `.agents/memory/`. Never paraphrase a
skill's `description:` into the index — skills self-describe. A change that would push the file over
budget shortens or moves an existing line in the same change.

## After creating a skill

1. Run `sh .agents/scripts/link-skills.sh` — Claude Code cannot see the skill until the symlink
   exists. The same run refreshes the dependency links in `.agents/linked-skills/`, so a new local
   skill immediately shadows an upstream one of the same name. A committed `SessionStart` hook runs
   the script too, as does the root `package.json` `prepare` script where the repo has one — so the
   links also refresh at session start and on install.
2. Remove any redundant `.agents/<topic>.md` file the skill replaces.
3. If the skill distilled memory content into rules, shrink the source `.agents/memory/` node to a
   pointer line (`memory-promotion` where present) — the memory index does not list skills.
4. Add one line to the skills index in `AGENTS.md` (`/name` — when to load it, ≤ 160 chars) — never a paragraph (§ What may enter AGENTS.md).
5. Test by typing `/skill-name`.

## Package README next to the skill

A package skill is for agents; `packages/<pkg>/README.md` is the npm-facing page for people, and it
is built from the same sources — the skill, `src/index.ts` and real downstream usage. An
application-facing package (one the root `README.md` lists under "Application packages") keeps this
shape:

1. Title, then one paragraph on when an app uses the package and what to use instead.
2. `## Installation` — the pin line is tooling-managed (`versions`); never hand-edit it.
3. `## Concepts` — the package's own terms, 3–6 bullets.
4. `## Usage` — 3–5 progressively richer examples that import only symbols the package really
   exports, written protocol-first and with `entitySlug`/`entityId` naming.
5. `## API` — the full public export list, subpath exports included.
6. `## Common pitfalls` — the skill's rules as short bullets.
7. `## Related packages`, then the generated `owlmeans:agent-guidance` block, left byte-identical.

A supporting package may keep a shorter README, but it still states purpose, install and one
working example. Promoting a package to "Application packages" in the root README means bringing
its README to the full shape in the same change.

## Skill vs memory file

- **Skill**: reusable procedure or reference that benefits from being a slash command, or that an
  agent should load automatically based on context
- **Memory node** (`.agents/memory/*.md`): fact-shaped knowledge per the `agent-memory` protocol;
  procedure-shaped or repeatedly-touched memory promotes into a skill (`memory-promotion` where
  present)
- **Never paste memory text into a skill** — restate it as a general rule (trigger → step → the
  failure it prevents), stripping dates, phase/status markers, versions and incident narrative
  (`memory-promotion` → Distillation)
