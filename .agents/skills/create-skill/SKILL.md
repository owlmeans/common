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
(`context`, `resource`, `web-client`, …) hides that package's own guidance for the whole repo. Name
a skill after the concern it covers, never after a package this project consumes.

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

## After creating a skill

1. Run `sh .agents/scripts/link-skills.sh` — Claude Code cannot see the skill until the symlink
   exists. The same run refreshes the dependency links in `.agents/linked-skills/`, so a new local
   skill immediately shadows an upstream one of the same name. A committed `SessionStart` hook runs
   the script too, as does the root `package.json` `prepare` script where the repo has one — so the
   links also refresh at session start and on install.
2. Remove any redundant `.agents/<topic>.md` file the skill replaces.
3. If the skill distilled memory content into rules, shrink the source `.agents/memory/` node to a
   pointer line (`memory-promotion` where present) — the memory index does not list skills.
4. Reference it from `AGENTS.md` if it should be discoverable every session.
5. Test by typing `/skill-name`.

## Skill vs memory file

- **Skill**: reusable procedure or reference that benefits from being a slash command, or that an
  agent should load automatically based on context
- **Memory node** (`.agents/memory/*.md`): fact-shaped knowledge per the `agent-memory` protocol;
  procedure-shaped or repeatedly-touched memory promotes into a skill (`memory-promotion` where
  present)
- **Never paste memory text into a skill** — restate it as a general rule (trigger → step → the
  failure it prevents), stripping dates, phase/status markers, versions and incident narrative
  (`memory-promotion` → Distillation)
