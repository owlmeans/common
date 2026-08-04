---
description: "MANDATORY for work under libraries/* or apps/*: before any edit in those directories, run the nested-agent-context discovery script and read all listed instruction/skill files relevant to the planned change."
applyTo: "libraries/**, apps/**"
---

# Nested Agent Context — libraries/* and apps/*

`libraries/` and `apps/` are direct symlinks to separate OwlMeans monorepos.
Each monorepo carries its own `.github/instructions/`, `.github/copilot-instructions.md`,
`.claude/skills/`, and `.claude/rules/` trees that are authoritative for any
code that lives inside that child project.

## Mandatory pre-work (MUST follow before any edit)

**Before editing, creating, or deleting any file under `libraries/<name>/` or `apps/<name>/`:**

1. **Run the discovery script** scoped to the target child:

   ```sh
   sh .github/agent-scripts/nested-agent-context.sh -p libraries/<name>
   # or for an apps child:
   sh .github/agent-scripts/nested-agent-context.sh -p apps/<name>
   ```

   Run from the repository root.

2. **Read every `[instruction]` and `[skill]` file** whose description matches
   the planned change.  Open the file at the exact path printed by the script —
   it is always relative to the repository root.

3. **Follow the nested instructions as authoritative** for that child project.
   Root project instructions still apply to root `package.json` workspace entries,
   cross-package contracts, and deployment files.

4. **Also read `.agents/memory/MEMORY.md`** of the child project (listed as
   `[memory-index]`) to get the project's current state and relevant history.

## Script reference

Script location: `.github/agent-scripts/nested-agent-context.sh`

| Flag | Meaning |
|------|---------|
| *(none)* | Enumerate all roots (`libraries/` and `apps/`) |
| `-p libraries/common` | Scope to one child |
| `-r libraries` | Scope to one root |
| `-h` | Print help |

## Scope rules

- Only the **direct child level** of `libraries/` or `apps/` is scanned.
  The script does not recurse into a linked monorepo's own `libraries/`,
  preventing symlink loops.
- The script exits cleanly if `libraries/` or `apps/` do not exist.
