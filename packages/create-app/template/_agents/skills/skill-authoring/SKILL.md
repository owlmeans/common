---
name: skill-authoring
description: How to add agent guidance to an OwlMeans project — author one skill at .agents/skills/<name>/SKILL.md that every agent reads, choose frontmatter that validates across Claude Code, Copilot and Codex, refresh the Claude Code symlinks, and decide skill vs memory. Use when asked to capture knowledge as a skill, add a slash command, or document a repeatable procedure.
user-invocable: true
metadata:
  scope: general
---
<!-- AUTO-GENERATED — do not edit. Regenerate via sync-agent-meta. -->

# Authoring agent guidance (skills)

OwlMeans projects carry agent guidance in two places, and only two:

| What | Where | Loaded |
|---|---|---|
| Always-on project context | `AGENTS.md` at the repo root | every session |
| Topic guidance | `.agents/skills/<name>/SKILL.md` | on demand, by topic or `/<name>` |

`.agents/skills/` is the [Agent Skills](https://agentskills.io) standard location: GitHub Copilot
and Codex discover it natively. Claude Code reads skills only from `.claude/skills/`, so each skill
is bridged there by a generated symlink — see "Refresh the Claude Code links" below. **Write a skill
once; never author a per-agent copy** (`.github/instructions/*.instructions.md`,
`.github/copilot-instructions.md`, or a real file under `.claude/skills/`).

## Skill layout

```
.agents/skills/<name>/
├── SKILL.md          # required — frontmatter + body
├── reference.md      # optional — deeper detail loaded on demand
└── scripts/          # optional — shell scripts the skill runs
```

## Frontmatter

```yaml
---
name: my-skill                  # REQUIRED, must equal the directory name (lowercase, hyphens, ≤64 chars)
description: What it does and WHEN to use it.   # REQUIRED, ≤1024 chars — the auto-invocation signal
user-invocable: true            # false = background knowledge only, hidden from the / menu
allowed-tools: Bash(bun *) Read # optional — space-separated; tools usable without per-call approval
metadata:                       # optional — anything non-standard goes here
  scope: general
---
```

The `description` is the most important field: every agent uses it to decide when to load the
skill, so state both the topic and the trigger ("Use when …"). Keep it under 1024 characters —
Copilot rejects longer ones.

Only the fields above (plus `license` and `compatibility`) are portable. Anything else — including
this monorepo's `scope: general` routing marker — belongs under `metadata:`, so a skill stays valid
in every agent that reads it. Claude Code additionally understands `disable-model-invocation`,
`argument-hint` and `context: fork`; use them only when the skill genuinely needs them.

## Refresh the Claude Code links

After creating, renaming, or deleting a skill, run:

```sh
sh .agents/scripts/link-skills.sh
```

It creates `.claude/skills/<name>` → `../../.agents/skills/<name>` for every skill and prunes links
whose skill is gone. The links are gitignored and are recreated at session start, but a skill added
mid-session is invisible to Claude Code until the script runs.

## Skill vs memory

- **Skill** — a reusable procedure or reference you (or the agents) will want again, worth loading
  automatically. Lives in `.agents/skills/`.
- **Memory** — a fact, decision, or gotcha specific to this project's history/state. Lives in the
  shared `.agents/memory/` graph store. See the `agent-memory` skill; promotion triggers and the
  update-vs-create rule live in `memory-promotion`.

If you find yourself writing "last time we…", that is memory. If you are writing "to do X, do Y",
that is a skill.

Never paste memory text into a skill. Memory content enters guidance only as a restated general
rule — trigger, step, and the failure it prevents, with dates, phase/status markers, versions and
incident narrative stripped (`memory-promotion` → Distillation).

## After adding a skill

1. If it replaces an ad-hoc `.agents/<topic>.md`, remove that file.
2. If it distilled memory content into rules, shrink the source `.agents/memory/` node to a
   pointer line (`memory-promotion`) — the memory index does not list skills.
3. Reference it from `AGENTS.md` if it should be discoverable every session.
4. Run `sh .agents/scripts/link-skills.sh`.
