---
description: "How to add agent guidance to an OwlMeans project — author a Claude Code skill (.claude/skills/<name>/SKILL.md) and the matching Copilot instruction (.github/instructions/<name>.instructions.md), keep them in sync, and choose skill vs memory. Apply when capturing knowledge as a skill or instruction."
applyTo: "**/.claude/skills/**, **/.github/instructions/**"
scope: general
---

# Authoring agent guidance (skills + instructions)

OwlMeans projects carry agent guidance in two parallel places so both Claude Code and GitHub
Copilot can use it:

| Tool | Location | Shape |
|---|---|---|
| Claude Code | `.claude/skills/<name>/SKILL.md` | one directory per skill, `SKILL.md` is the entrypoint |
| GitHub Copilot | `.github/instructions/<name>.instructions.md` | one file per topic |

Author **both** for any guidance you want available to either tool, using the same `<name>` on both
sides so they read as one topic.

## SKILL.md frontmatter (Claude Code)

```yaml
---
name: my-skill                  # the /slash-command (lowercase, hyphens)
description: What it does and WHEN to use it.  # primary auto-invocation signal
user-invocable: true            # false = background knowledge only
allowed-tools: Bash(bun *) Read # optional
---
```

The `description` decides when Claude auto-invokes the skill — describe the topic and the trigger.

## Instruction frontmatter (Copilot)

```yaml
---
description: "Short summary — apply when …"
applyTo: "**/*.ts, **/relevant/**"   # globs that auto-attach this instruction
---
```

`applyTo` controls when Copilot attaches the instruction. Use the patterns the guidance is about;
fall back to `**/*.ts, **/*.tsx` if broadly relevant.

## Keep the pair in sync

Change one side, change the other. They need not be identical prose but must not contradict.
Cross-reference related guidance by name.

## Skill vs memory

- **Skill / instruction** — a reusable procedure or reference worth auto-invoking.
- **Memory** (`.claude/memory/`, `.github/memory/`) — a fact, decision, or gotcha specific to this
  project's history. See the `agent-memory` instruction.

## After adding a skill

List it in `.github/memory/MEMORY.md` (and `.claude/memory/MEMORY.md`), and reference it from
`.github/copilot-instructions.md` / `CLAUDE.md` if it should be discoverable every session.
