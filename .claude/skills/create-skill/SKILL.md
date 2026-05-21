---
name: create-skill
description: Guide for creating a new Claude Code skill in this project. Use when asked to convert knowledge into a skill, create a slash command, or add a new skill file.
---

# Creating a Claude Code Skill

Skills live in `.claude/skills/<skill-name>/SKILL.md`. Each skill is a directory.

## File Structure

```
.claude/skills/<skill-name>/
├── SKILL.md          # Required — entrypoint with frontmatter + instructions
├── reference.md      # Optional — detailed reference docs
├── examples.md       # Optional — usage examples
└── scripts/          # Optional — bundled shell scripts the skill runs
    └── <name>.sh
```

## Skills with Scripts

Some skills bundle shell scripts that agents run as part of their procedure. This requires two locations for dual-tool support:

| Location | Purpose |
|---|---|
| `.claude/skills/<name>/scripts/<script>.sh` | Claude Code — loaded relative to the skill |
| `.github/agent-scripts/<script>.sh` | GitHub Copilot — accessible from repo root |

**Both copies must remain byte-identical.** When updating a script, update both locations simultaneously. Document this sync requirement in the SKILL.md.

When creating a skill with bundled scripts:
1. Place the script in `.claude/skills/<name>/scripts/<script>.sh`
2. Copy it verbatim to `.github/agent-scripts/<script>.sh`
3. Note both locations in the SKILL.md body under a "Script reference" section
4. Set `allowed-tools: Bash(sh *)` in frontmatter so Claude can run the script without prompting

## SKILL.md Frontmatter

```yaml
---
name: skill-name                  # becomes the /slash-command (lowercase, hyphens)
description: What it does and when to use it  # guides auto-invocation by Claude
allowed-tools: Bash(bun *) Read   # tools usable without per-call approval
disable-model-invocation: true    # set true for side-effect tasks (deploy, commit)
user-invocable: false             # set false for background knowledge only
---
```

## Key Frontmatter Fields

| Field | Use when |
|---|---|
| `description` | Always — primary signal for when Claude auto-invokes |
| `allowed-tools` | Skill needs to run specific commands without prompting |
| `disable-model-invocation: true` | Skill has side effects (git push, deploy, etc.) — user must invoke manually |
| `user-invocable: false` | Skill is background knowledge, not an action — hide from `/` menu |
| `argument-hint` | Skill takes arguments — show hint in autocomplete |
| `context: fork` | Skill should run in isolated subagent (long research, exploration) |

## Dynamic Variables

- `$ARGUMENTS` — everything typed after `/skill-name`
- `$0`, `$1`, `$2` — individual arguments by index
- `` !`command` `` — shell command, executes before Claude sees the skill (output replaces it)

Example with dynamic context:
```
Current branch: !`git rev-parse --abbrev-ref HEAD`
```

## Decision Guide

| Scenario | Approach |
|---|---|
| Project-specific CLI/build knowledge | Skill, no `disable-model-invocation` (let Claude auto-use) |
| Side-effect workflow (commit, deploy) | `disable-model-invocation: true` |
| Background reference only | `user-invocable: false` |
| Runs long searches or exploration | `context: fork`, `agent: Explore` |

## After Creating a Skill

1. Remove any redundant `.claude/<topic>.md` file the skill replaces
2. Update `.claude/memory/MEMORY.md` to mention the skill exists
3. Update `CLAUDE.md` Additional Context section if the old file was referenced there
4. Test by typing `/skill-name` in Claude Code

## Skill vs Memory File

- **Skill**: reusable procedure or reference that benefits from being a slash command, or that Claude should auto-invoke based on context
- **Memory file** (`.claude/memory/*.md`): facts about decisions, history, or one-off project state that doesn't fit a repeatable pattern
