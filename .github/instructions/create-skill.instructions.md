---
description: "Guide for creating a new GitHub Copilot instruction file in this project. Use when asked to convert knowledge into an instruction, add domain-specific guidance, or create a new .instructions.md file."
applyTo: ".github/instructions/**"
---

# Creating a GitHub Copilot Instruction File

Instruction files live in `.github/instructions/<name>.instructions.md`. Each file targets a specific domain.

## File Structure

```
.github/instructions/
├── <name>.instructions.md    # Frontmatter + markdown content
```

## Frontmatter

```yaml
---
description: "What it covers and when Copilot should load it"
applyTo: "**/pattern/**"   # glob: which files trigger this instruction
---
```

## Key Frontmatter Fields

| Field | Purpose |
|---|---|
| `description` | Required — tells Copilot when to load this instruction |
| `applyTo` | Glob pattern — files that trigger loading this instruction |

## applyTo Patterns

- `"**/package.json, **/bunfig.toml"` — package manager files
- `"**/tsconfig*.json"` — TypeScript config files
- `"**"` — all files (use sparingly, only for truly universal rules)
- `.github/instructions/**` — instruction files themselves

## After Creating an Instruction

1. Update `.github/memory/MEMORY.md` to mention the instruction exists
2. Update `.github/copilot-instructions.md` Additional Context section if important
3. Test that `description` accurately describes when Copilot should use it

## Instruction vs Memory File

- **Instruction** (`.github/instructions/*.instructions.md`): reusable procedures, domain reference, coding conventions that Copilot should apply actively
- **Memory file** (`.github/memory/*.md`): facts about decisions, history, or one-off project state
