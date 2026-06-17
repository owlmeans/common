---
name: skill-authoring
description: How to add agent guidance to an OwlMeans project — author a Claude Code skill (.claude/skills/<name>/SKILL.md) and its matching GitHub Copilot instruction (.github/instructions/<name>.instructions.md), keep the two in sync, choose frontmatter, and decide skill vs memory. Use when asked to capture knowledge as a skill, add a slash command, or document a repeatable procedure.
user-invocable: true
scope: general
---

# Authoring agent guidance (skills + instructions)

OwlMeans projects carry agent guidance in two parallel places so both Claude Code and GitHub
Copilot can use it:

| Tool | Location | Shape |
|---|---|---|
| Claude Code | `.claude/skills/<name>/SKILL.md` | one directory per skill, `SKILL.md` is the entrypoint |
| GitHub Copilot | `.github/instructions/<name>.instructions.md` | one file per topic |

Author **both** for any guidance you want available to either tool. Keep the same `<name>` on both
sides so they read as one topic.

## SKILL.md (Claude Code)

```
.claude/skills/<name>/
├── SKILL.md          # required — frontmatter + body
├── reference.md      # optional — deeper detail loaded on demand
└── scripts/          # optional — shell scripts the skill runs
```

Frontmatter:

```yaml
---
name: my-skill                  # the /slash-command (lowercase, hyphens)
description: What it does and WHEN to use it.  # primary auto-invocation signal
user-invocable: true            # false = background knowledge only, hidden from the / menu
allowed-tools: Bash(bun *) Read # optional — tools usable without per-call approval
---
```

The `description` is the most important field: Claude uses it to decide when to auto-invoke the
skill, so describe both the topic and the trigger ("Use when …").

## <name>.instructions.md (Copilot)

```yaml
---
description: "Short summary — apply when …"
applyTo: "**/*.ts, **/relevant/**"   # globs that auto-attach this instruction
---
```

`applyTo` controls when Copilot pulls the instruction in. Use the file patterns the guidance is
actually about; fall back to `**/*.ts, **/*.tsx` if it is broadly relevant.

## Keep the pair in sync

When you change one side, change the other. They do not have to be identical prose, but they must
not contradict each other. Cross-reference related guidance by name (e.g. "see the `getting-started`
skill").

## Skill vs memory

- **Skill / instruction** — a reusable procedure or reference you (or the tools) will want again,
  worth auto-invoking. Lives in `.claude/skills/` + `.github/instructions/`.
- **Memory** — a fact, decision, or gotcha specific to this project's history/state. Lives in
  `.claude/memory/` + `.github/memory/`. See the `agent-memory` skill.

If you find yourself writing "last time we…", that is memory. If you are writing "to do X, do Y",
that is a skill.

## After adding a skill

1. If it replaces an ad-hoc `.claude/<topic>.md`, remove that file.
2. Mention it in `.claude/memory/MEMORY.md` (and `.github/memory/MEMORY.md`) so future sessions know
   it exists.
3. Reference it from `CLAUDE.md` / `.github/copilot-instructions.md` if it should be discoverable
   every session.
